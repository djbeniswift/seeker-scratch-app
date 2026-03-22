import { Connection, PublicKey, Keypair } from '@solana/web3.js'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { Resend } from 'resend'
import { IDL, PROGRAM_ID, TREASURY_SEED, MONTHLY_PRIZE_SEED, MASTER_CONFIG_SEED, PROFILE_SEED } from '../../../lib/constants'

const resend = new Resend(process.env.RESEND_API_KEY)

// Resolve the player wallet for a profile PDA by checking transaction history.
// The profile PDA is derived as [PROFILE_SEED, wallet.toBytes()], but the on-chain
// program never writes the wallet into profile.owner — so we can't read it from
// account data. Instead, get the oldest transaction for the profile PDA and check
// accounts[0] — the fee payer is always the first account and is always the player.
async function resolveWalletFromPda(connection: Connection, profilePda: PublicKey): Promise<PublicKey> {
  const pdaStr = profilePda.toBase58()
  console.log(`[resolveWallet] Resolving wallet for profile PDA: ${pdaStr}`)

  // Fetch up to 10 sigs and use the oldest (last) — that's the account creation tx
  const sigs = await connection.getSignaturesForAddress(profilePda, { limit: 10 }, 'confirmed')
  console.log(`[resolveWallet] Found ${sigs.length} signatures for ${pdaStr}`)

  if (sigs.length === 0) {
    throw new Error(`No transactions found for profile PDA: ${pdaStr}`)
  }

  // Try oldest-first (most likely to be the createProfile / first buyAndScratch tx)
  const ordered = [...sigs].reverse()

  for (const { signature } of ordered) {
    try {
      console.log(`[resolveWallet] Checking tx ${signature}`)
      const tx = await connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
      const accounts = (tx?.transaction?.message as any)?.accountKeys ?? []
      if (accounts.length === 0) continue

      // accounts[0] is always the fee payer — the player wallet
      const feePayer: PublicKey = accounts[0].pubkey
      console.log(`[resolveWallet] Fee payer (accounts[0]): ${feePayer.toBase58()}`)

      const [derived] = PublicKey.findProgramAddressSync([PROFILE_SEED, feePayer.toBytes()], PROGRAM_ID)
      console.log(`[resolveWallet] Derived PDA from fee payer: ${derived.toBase58()}`)

      if (derived.equals(profilePda)) {
        console.log(`[resolveWallet] Match! Wallet = ${feePayer.toBase58()}`)
        return feePayer
      }

      console.log(`[resolveWallet] No match for tx ${signature}, trying next`)
    } catch (err) {
      console.warn(`[resolveWallet] Error fetching tx ${signature}:`, err)
    }
  }

  throw new Error(`Cannot resolve wallet for profile PDA: ${pdaStr}`)
}

export async function runMonthlyPrizes() {
  const rpcUrl = process.env.SOLANA_RPC_URL
    || 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY
  if (!adminPrivateKey) throw new Error('ADMIN_PRIVATE_KEY env var not set')

  const connection = new Connection(rpcUrl, 'confirmed')
  const adminKeypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(adminPrivateKey)))

  const provider = new AnchorProvider(
    connection,
    {
      publicKey: adminKeypair.publicKey,
      signTransaction: async (tx: any) => { tx.sign(adminKeypair); return tx },
      signAllTransactions: async (txs: any) => txs.map((tx: any) => { tx.sign(adminKeypair); return tx }),
    } as any,
    { commitment: 'confirmed' }
  )
  const program = new Program(IDL as any, PROGRAM_ID, provider)

  // Fetch prize amounts from MasterConfig on-chain (stored in lamports)
  const [masterConfigPda] = PublicKey.findProgramAddressSync([MASTER_CONFIG_SEED], PROGRAM_ID)
  const masterConfig = await (program.account as any).masterConfig.fetch(masterConfigPda)
  const prizeAmounts: [BN, BN, BN] = [
    masterConfig.prize1stSol as BN,
    masterConfig.prize2ndSol as BN,
    masterConfig.prize3rdSol as BN,
  ]

  // Fetch all profiles, sort by pointsThisMonth descending, take top 3
  const profiles = await (program.account as any).playerProfile.all()
  const sorted = profiles
    .filter((p: any) => p.account.pointsThisMonth.toNumber() > 0)
    .sort((a: any, b: any) => b.account.pointsThisMonth.toNumber() - a.account.pointsThisMonth.toNumber())
    .slice(0, 3)

  if (sorted.length === 0) {
    return { message: 'No players with points this month', winners: [] }
  }

  // Resolve wallets from PDAs. profile.owner is never set by the on-chain program
  // so it reads as 11111...111 (PublicKey.default). Instead we derive the wallet by
  // finding which account key in a recent transaction hashes to this profile PDA.
  const resolvedWallets = await Promise.all(
    sorted.map((p: any) => resolveWalletFromPda(connection, p.publicKey))
  )

  // Pad to 3 slots — real entries use resolved wallets + prize amounts, padding uses defaults
  const winners: [PublicKey, PublicKey, PublicKey] = [
    resolvedWallets[0] ?? PublicKey.default,
    resolvedWallets[1] ?? PublicKey.default,
    resolvedWallets[2] ?? PublicKey.default,
  ]
  const amounts: [BN, BN, BN] = [
    sorted[0] ? prizeAmounts[0] : new BN(0),
    sorted[1] ? prizeAmounts[1] : new BN(0),
    sorted[2] ? prizeAmounts[2] : new BN(0),
  ]

  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)
  const [monthlyPrizePda] = PublicKey.findProgramAddressSync([MONTHLY_PRIZE_SEED], PROGRAM_ID)

  const tx = await (program.methods as any)
    .setMonthlyWinners(winners, amounts)
    .accounts({
      monthlyPrize: monthlyPrizePda,
      treasury: treasuryPda,
      admin: adminKeypair.publicKey,
      systemProgram: PublicKey.default,
    })
    .rpc({ commitment: 'confirmed' })

  // Build result rows
  const placeLabels = ['1st', '2nd', '3rd']
  const winnerRows = winners.map((w, i) => {
    const pts = sorted[i]?.account?.pointsThisMonth?.toNumber?.() ?? 0
    const sol = amounts[i].toNumber() / 1_000_000_000
    return `${placeLabels[i]}: ${w.toBase58()} — ${sol} SOL (${pts} pts)`
  })

  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  // Send confirmation email
  await resend.emails.send({
    from: 'Seeker Scratch <onboarding@resend.dev>',
    to: 'labswift@gmail.com',
    subject: `🏆 Monthly Winners Set — ${monthLabel}`,
    text: [
      `Monthly winners have been set on-chain for ${monthLabel}.`,
      '',
      winnerRows.join('\n'),
      '',
      `Tx: ${tx}`,
      '',
      'Winners can now claim their prizes at seekerscratch.com',
    ].join('\n'),
  })

  return {
    success: true,
    tx,
    winners: winners.map((w, i) => ({
      place: i + 1,
      wallet: w.toBase58(),
      amountSol: amounts[i].toNumber() / 1_000_000_000,
      pointsThisMonth: sorted[i]?.account?.pointsThisMonth?.toNumber?.() ?? 0,
    })),
  }
}
