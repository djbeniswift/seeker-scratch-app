'use client'

export default function PrizesTab() {
  const monthlyPrizes = [
    { place: '🥇 1ST PLACE', sol: '0.25 SOL', skr: '250 SKR', icon: '👑', color: '#FFD700' },
    { place: '🥈 2ND PLACE', sol: '0.15 SOL', skr: '150 SKR', icon: '🥈', color: '#C0C0C0' },
    { place: '🥉 3RD PLACE', sol: '0.05 SOL', skr: '100 SKR', icon: '🥉', color: '#CD7F32' },
  ]

  return (
    <div style={{ paddingBottom: 16 }}>
      <div style={{
        background: 'linear-gradient(135deg, #1a1a3e, #2d1b69)',
        border: '1px solid var(--gold)', borderRadius: 16,
        padding: 20, textAlign: 'center', marginBottom: 16
      }}>
        <div style={{ fontSize: 36, marginBottom: 6 }}>🎁</div>
        <div style={{ color: 'var(--gold)', fontSize: 24, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>
          PRIZE STORE
        </div>
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>
          Redeem your points for SOL rewards
        </div>
      </div>

      <div style={{ color: '#aaa', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
        Top 3 players by points each month win SOL + Seeker Points
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {monthlyPrizes.map(({ place, sol, skr, icon, color }) => (
          <div key={place} style={{
            background: 'var(--card-bg)', border: `1px solid ${color}44`,
            borderRadius: 12, padding: 16,
            display: 'flex', alignItems: 'center', gap: 14
          }}>
            <div style={{ fontSize: 36, flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color, fontSize: 16, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
                {place}
              </div>
              <div style={{ color: 'var(--green)', fontSize: 15, fontFamily: "'Bebas Neue', sans-serif", marginTop: 4 }}>
                {sol}
              </div>
              <div style={{ color: '#00d4ff', fontSize: 12, fontFamily: "'Bebas Neue', sans-serif", marginTop: 4 }}>+ {skr} <span style={{ color: '#555', fontSize: 10 }}>SKR TOKEN</span></div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: 14, background: 'rgba(245,200,66,0.05)',
        border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10,
        color: '#aaa', fontSize: 12, textAlign: 'center', lineHeight: 1.6
      }}>
        🏆 Monthly prizes paid out on the 1st of each month.<br/>
        Keep playing to earn points and climb the leaderboard!
      </div>
    </div>
  )
}
