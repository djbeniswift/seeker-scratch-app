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
        <div style={{ fontSize: 36, marginBottom: 6 }}>🏆</div>
        <div style={{ color: 'var(--gold)', fontSize: 26, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>MONTHLY PRIZES</div>
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>Top 3 players by points each month win SOL + SKR</div>
      </div>

      <div style={{ background: '#0a0a1a', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ color: 'var(--gold)', fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>HOW TO EARN POINTS</div>
        {[
          { card: 'Quick Pick (0.01 SOL)', pts: '1 pt' },
          { card: 'Hot Shot (0.05 SOL)', pts: '5 pts' },
          { card: 'Mega Gold (0.1 SOL)', pts: '10 pts' },
          { card: 'Refer a friend', pts: '+100 pts' },
        ].map(({ card, pts }) => (
          <div key={card} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #111' }}>
            <span style={{ color: '#aaa', fontSize: 12 }}>{card}</span>
            <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 'bold' }}>{pts}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {monthlyPrizes.map(({ place, sol, skr, icon, color }) => (
          <div key={place} style={{ background: 'var(--card-bg)', border: `1px solid ${color}44`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 36, flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color, fontSize: 16, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>{place}</div>
              <div style={{ color: 'var(--green)', fontSize: 15, fontFamily: "'Bebas Neue', sans-serif", marginTop: 4 }}>{sol}</div>
              <div style={{ color: '#00d4ff', fontSize: 15, fontFamily: "'Bebas Neue', sans-serif", marginTop: 2 }}>+ {skr}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 14, background: 'rgba(245,200,66,0.05)', border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, color: '#aaa', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
        🏆 Monthly prizes paid out on the 1st of each month.<br/>
        Check the Ranks tab to see your position!
      </div>
    </div>
  )
}
