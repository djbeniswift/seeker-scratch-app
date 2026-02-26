'use client'

export default function PrizesTab() {
  const prizes = [
    { points: 500, reward: '0.05 SOL', icon: '💰', desc: 'Redeem for devnet SOL' },
    { points: 1000, reward: '0.1 SOL', icon: '💎', desc: 'Double value bundle' },
    { points: 2500, reward: '0.3 SOL', icon: '🔥', desc: 'High roller reward' },
    { points: 5000, reward: '1 SOL', icon: '👑', desc: 'Elite player prize' },
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {prizes.map(({ points, reward, icon, desc }) => (
          <div key={points} style={{
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 16,
            display: 'flex', alignItems: 'center', gap: 14
          }}>
            <div style={{ fontSize: 32, flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 16, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
                {reward}
              </div>
              <div style={{ color: '#aaa', fontSize: 11, marginTop: 2 }}>{desc}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ color: 'var(--gold)', fontSize: 16, fontFamily: "'Bebas Neue', sans-serif" }}>
                {points.toLocaleString()}
              </div>
              <div style={{ color: '#555', fontSize: 9, letterSpacing: 1 }}>POINTS</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 16, padding: 14, background: '#0a0a1a',
        border: '1px solid var(--border)', borderRadius: 10,
        color: '#555', fontSize: 12, textAlign: 'center'
      }}>
        Point redemption coming soon. Keep earning! 🚀
      </div>
    </div>
  )
}
