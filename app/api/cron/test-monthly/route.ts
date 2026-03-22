import { NextResponse } from 'next/server'
import { runMonthlyPrizes } from '../_shared/runMonthlyPrizes'

// Manual test endpoint — same logic as /api/cron/monthly-prizes
// Hit this to verify the cron works without waiting for the 1st of the month
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMonthlyPrizes()
    return NextResponse.json({ test: true, ...result })
  } catch (error: any) {
    console.error('Test monthly prizes error:', error)
    return NextResponse.json({ test: true, error: error.message }, { status: 500 })
  }
}
