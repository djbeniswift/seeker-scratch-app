export default function Terms() {
  return (
    <div style={{
      maxWidth: 600,
      margin: '0 auto',
      padding: '40px 20px 80px',
      color: '#ffffff',
      fontFamily: 'monospace',
      lineHeight: 1.7,
    }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3, color: '#f5c842', marginBottom: 4 }}>
          🎰 SEEKER SCRATCH
        </div>
        <h1 style={{ fontSize: 20, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, color: '#ffffff', marginBottom: 8 }}>
          TERMS OF SERVICE
        </h1>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 24 }}>
          Last updated: March 2026
        </div>
        <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.1)', marginBottom: 32 }} />
      </div>

      {[
        {
          title: '1. Acceptance',
          body: `By using Seeker Scratch you agree to these terms.`
        },
        {
          title: '2. Eligibility',
          body: `You must be 18 or older to use this app. By using Seeker Scratch you confirm you are of legal age to participate in games of chance in your jurisdiction.`
        },
        {
          title: '3. Nature of the Game',
          body: `Seeker Scratch is a game of chance. There is no guarantee of winning. Play responsibly.`
        },
        {
          title: '4. No Refunds',
          body: `All SOL transactions on the Solana blockchain are irreversible. We cannot reverse or refund any purchases.`
        },
        {
          title: '5. Responsible Gaming',
          body: `Do not spend more than you can afford to lose. If you feel you have a gambling problem, please seek help.`
        },
        {
          title: '6. Limitation of Liability',
          body: `Seeker Scratch Labs is not liable for any losses incurred through use of this application.`
        },
        {
          title: '7. Contact',
          body: `seekerscratch@gmail.com`
        },
      ].map(section => (
        <div key={section.title} style={{ marginBottom: 28 }}>
          <h2 style={{
            fontSize: 13,
            color: '#00d4ff',
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: 2,
            marginBottom: 10,
          }}>
            {section.title}
          </h2>
          <p style={{ fontSize: 13, color: '#cccccc', lineHeight: 1.8 }}>
            {section.body}
          </p>
        </div>
      ))}

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
        <a href="/" style={{ color: '#f5c842', fontSize: 13, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, textDecoration: 'none' }}>
          ← BACK TO SEEKER SCRATCH
        </a>
      </div>
    </div>
  )
}
