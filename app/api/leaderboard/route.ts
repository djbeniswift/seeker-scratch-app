import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
import { IDL, PROGRAM_ID } from '../../lib/constants'

const RPC = 'https://mainnet.helius-rpc.com/?api-key=0b4b8765-216d-4304-b433-34df430427f7'

export const revalidate = 60 // cache for 60 seconds

export async function GET() {
  try {
    const conn = new Connection(RPC, 'confirmed')
    const provider = new AnchorProvider(conn, {} as any, { commitment: 'confirmed' })
    const program = new Program(IDL as any, PROGRAM_ID, provider)

    const accounts = await (program.account as any).playerProfile.all()
    const profiles = accounts.map((acc: any) => ({
      wallet: acc.publicKey.toBase58(),
      ownerWallet: (() => {
        const raw = acc.account.owner?.toBase58() ?? ''
        return (raw && raw !== '11111111111111111111111111111111') ? raw : null
      })(),
      displayName: acc.account.displayName || null,
      pfpUrl: acc.account.pfpUrl || null,
      pointsThisMonth: acc.account.pointsThisMonth.toNumber(),
      pointsAllTime: acc.account.pointsAllTime.toNumber(),
      sweepPointsThisMonth: acc.account.sweepPointsThisMonth?.toNumber() ?? 0,
      sweepPointsAllTime: acc.account.sweepPointsAllTime?.toNumber() ?? 0,
      wins: acc.account.wins,
      cardsScratched: acc.account.cardsScratched,
      totalWon: acc.account.totalWon.toNumber() / 1_000_000_000,
    }))

    return Response.json({ profiles }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
