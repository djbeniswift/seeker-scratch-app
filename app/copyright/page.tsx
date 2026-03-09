export default function Copyright() {
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
          COPYRIGHT NOTICE
        </h1>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 24 }}>
          © 2026 Seeker Scratch Labs. All rights reserved.
        </div>
        <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.1)', marginBottom: 32 }} />
      </div>

      {[
        {
          title: 'Ownership',
          body: `Seeker Scratch, its branding, graphics, UI design, and associated content are the property of Seeker Scratch Labs.`
        },
        {
          title: 'Smart Contract',
          body: `The Seeker Scratch smart contract is deployed on the Solana blockchain at program ID: 3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC and is publicly auditable. All on-chain data is inherently public by nature of the Solana blockchain.`
        },
        {
          title: 'Restrictions',
          body: `You may not copy, reproduce, distribute, or create derivative works from Seeker Scratch's branding, graphics, or UI without explicit written permission from Seeker Scratch Labs.`
        },
        {
          title: 'Contact',
          body: `For licensing or copyright inquiries: seekerscratch@gmail.com`
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
