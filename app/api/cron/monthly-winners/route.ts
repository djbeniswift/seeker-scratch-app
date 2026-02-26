import { NextResponse } from 'next/server'
import { Connection, PublicKey, Keypair } from '@solana/web3.js'
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor"
import { IDL, PROGRAM_ID, TREASURY_SEED, MONTHLY_PRIZE_SEED } from '../../../lib/constants'

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || ''

const PRIZE_AMOUNTS = [
  250_000_000,
  150_000_000,
  50_000_000,
]

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const connection = new Connection(RPC_URL, 'confirmed')
    const adminKeypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(ADMIN_PRIVATE_KEY)))
    const provider = new AnchorProvider(connection, { publicKey: adminKeypair.publicKey, signTransaction: async (tx: any) => { tx.sign(adminKeypair); return tx }, signAllTransactions: async (txs: any) => txs.map((tx: any) => { tx.sign(adminKeypair); return tx }) } as any, { commitment: 'confirmed' })
    const program = new Program(IDL as any, PROGRAM_ID, provider)

    const profiles = await (program.account as any).playerProfile.all()

    const sorted = profiles
      .filter((p: any) => p.account.pointsThisMonth.toNumber() > 0)
      .sort((a: any, b: any) => b.account.pointsThisMonth.toNumber() - a.account.pointsThisMonth.toNumber())
      .slice(0, 3)

    if (sorted.length === 0) {
      return NextResponse.json({ message: 'No players with points this month' })
    }

    while (sorted.length < 3) {
      sorted.push({ account: { owner: PublicKey.default } })
    }

    const winners = sorted.map((p: any) => p.account.owner) as [PublicKey, PublicKey, PublicKey]
    const amounts = PRIZE_AMOUNTS.map((a, i) =>
      sorted[i]?.account?.owner?.equals(PublicKey.default) ? new BN(0) : new BN(a)
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

    return NextResponse.json({
      success: true,
      tx,
      winners: winners.map((w, i) => ({
        wallet: w.toBase58(),
        place: i + 1,
        amount: PRIZE_AMOUNTS[i] / 1e9
      }))
    })
  } catch (error: any) {
    console.error('Cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
