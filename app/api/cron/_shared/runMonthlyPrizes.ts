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
// Returns null (never throws) so callers can skip failed resolutions gracefully.
async function resolveWalletFromPda(connection: Connection, profilePda: PublicKey): Promise<PublicKey | null> {
  const pdaStr = profilePda.toBase58()
  console.log(`[resolveWallet] Resolving wallet for profile PDA: ${pdaStr}`)

  let sigs: Awaited<ReturnType<typeof connection.getSignaturesForAddress>>
  try {
    // Fetch up to 10 sigs; reverse so oldest (account creation tx) is tried first
    sigs = await connection.getSignaturesForAddress(profilePda, { limit: 10 }, 'confirmed')
  } catch (err) {
    console.error(`[resolveWallet] Failed to fetch signatures for ${pdaStr}:`, err)
    return null
  }

  console.log(`[resolveWallet] Found ${sigs.length} signatures for ${pdaStr}`)

  if (sigs.length === 0) {
    console.warn(`[resolveWallet] No transactions found for profile PDA: ${pdaStr}`)
    return null
  }

  const ordered = [...sigs].reverse()

  for (const { signature } of ordered) {
    try {
      console.log(`[resolveWallet] Checking tx ${signature}`)
      const tx = await connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
      const accounts = (tx?.transaction?.message as any)?.accountKeys ?? []
      if (accounts.length === 0) {
        console.log(`[resolveWallet] Tx ${signature} has no accounts, skipping`)
        continue
      }

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

  console.error(`[resolveWallet] Exhausted all transactions, could not resolve wallet for ${pdaStr}`)
  return null
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

  console.log(`[runMonthlyPrizes] Top ${sorted.length} players with points this month`)

  if (sorted.length === 0) {
    return { message: 'No players with points this month', winners: [] }
  }

  // Resolve wallets one at a time — catch failures individually so one bad profile
  // doesn't abort the entire cron job. Failed slots are skipped (zeroed out).
  const resolved: (PublicKey | null)[] = []
  for (const p of sorted) {
    const wallet = await resolveWalletFromPda(connection, p.publicKey)
    if (wallet === null) {
      console.error(`[runMonthlyPrizes] Skipping winner slot — could not resolve wallet for PDA ${p.publicKey.toBase58()}`)
    }
    resolved.push(wallet)
  }

  // Build padded 3-slot arrays. Slots with unresolved wallets use PublicKey.default + BN(0)
  // so setMonthlyWinners still receives its required fixed-length arrays.
  const winners: [PublicKey, PublicKey, PublicKey] = [
    resolved[0] ?? PublicKey.default,
    resolved[1] ?? PublicKey.default,
    resolved[2] ?? PublicKey.default,
  ]
  const amounts: [BN, BN, BN] = [
    resolved[0] ? prizeAmounts[0] : new BN(0),
    resolved[1] ? prizeAmounts[1] : new BN(0),
    resolved[2] ? prizeAmounts[2] : new BN(0),
  ]

  const resolvedCount = resolved.filter(Boolean).length
  console.log(`[runMonthlyPrizes] Resolved ${resolvedCount}/${sorted.length} wallets — calling setMonthlyWinners`)

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

  console.log(`[runMonthlyPrizes] setMonthlyWinners tx: ${tx}`)

  // Build result rows
  const placeLabels = ['1st', '2nd', '3rd']
  const winnerRows = winners.map((w, i) => {
    if (!resolved[i]) return `${placeLabels[i]}: SKIPPED (wallet resolution failed)`
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
      `Resolved ${resolvedCount}/${sorted.length} winner wallets.`,
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
    resolvedCount,
    winners: winners.map((w, i) => ({
      place: i + 1,
      wallet: w.toBase58(),
      resolved: resolved[i] !== null,
      amountSol: amounts[i].toNumber() / 1_000_000_000,
      pointsThisMonth: sorted[i]?.account?.pointsThisMonth?.toNumber?.() ?? 0,
    })),
  }
}
