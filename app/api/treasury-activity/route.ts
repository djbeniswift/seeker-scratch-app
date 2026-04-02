const HELIUS_API_KEY = '0b4b8765-216d-4304-b433-34df430427f7'
const TREASURY_ADDR = 'H5icwcoysjVVVfzKxfJnPFBmn5wzMEzEDSJo66p2LkMv'

export async function GET() {
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${TREASURY_ADDR}/transactions?api-key=${HELIUS_API_KEY}&limit=50`,
      { next: { revalidate: 30 } }
    )
    if (!res.ok) {
      const text = await res.text()
      return Response.json({ error: `Helius ${res.status}: ${text.slice(0, 100)}` }, { status: res.status })
    }
    const data = await res.json()
    return Response.json(data)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
