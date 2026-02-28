import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const { balance } = await req.json()

    await resend.emails.send({
      from: 'Seeker Scratch <onboarding@resend.dev>',
      to: 'labswift@gmail.com',
      subject: 'Seeker Scratch Treasury Alert',
      text: `⚠️ Treasury Low Balance Warning\n\nCurrent balance: ${balance} SOL\n\nThe treasury has dropped below 6 SOL. The game has been automatically paused.\n\nLog in to the admin panel at https://seekerscratch.vercel.app to fund the treasury and unpause the game.`,
    })

    return Response.json({ ok: true })
  } catch (err: any) {
    console.error('Treasury alert failed:', err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
