import { Connection, PublicKey, Keypair } from '@solana/web3.js'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { Resend } from 'resend'
import { IDL, PROGRAM_ID, TREASURY_SEED, MONTHLY_PRIZE_SEED, MASTER_CONFIG_SEED } from '../../../lib/constants'

const resend = new Resend(process.env.RESEND_API_KEY)

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

  // Fetch prize amounts from MasterConfig on-chain
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

  // Pad to 3 slots with default pubkey if fewer than 3 players
  while (sorted.length < 3) {
    sorted.push({ account: { owner: PublicKey.default, pointsThisMonth: new BN(0) } })
  }

  const winners = sorted.map((p: any) => p.account.owner) as [PublicKey, PublicKey, PublicKey]
  const amounts = prizeAmounts.map((a, i) =>
    sorted[i]?.account?.owner?.equals(PublicKey.default) ? new BN(0) : a
  ) as [BN, BN, BN]

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
    const sol = amounts[i].toNumber() / 1e9
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
      amountSol: amounts[i].toNumber() / 1e9,
      pointsThisMonth: sorted[i]?.account?.pointsThisMonth?.toNumber?.() ?? 0,
    })),
  }
}
