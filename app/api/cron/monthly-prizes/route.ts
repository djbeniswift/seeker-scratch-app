import { NextResponse } from 'next/server'
import { runMonthlyPrizes } from '../_shared/runMonthlyPrizes'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMonthlyPrizes()
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Monthly prizes cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
