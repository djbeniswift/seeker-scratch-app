'use client'

export default function PrivacyPolicy() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      padding: '40px 20px',
      fontFamily: 'monospace',
      maxWidth: 800,
      margin: '0 auto',
      lineHeight: 1.8,
    }}>
      <h1 style={{ 
        fontFamily: "'Bebas Neue', sans-serif", 
        fontSize: 36, 
        color: 'var(--gold)',
        marginBottom: 8,
        letterSpacing: 2,
      }}>
        PRIVACY POLICY
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 32, fontSize: 12 }}>
        Last updated: February 12, 2026
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>1. Introduction</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Seeker Scratch (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the Seeker Scratch application (the &quot;Service&quot;). 
          This page informs you of our policies regarding the collection, use, and disclosure of personal 
          information when you use our Service.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>2. Information We Collect</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>
          <strong style={{ color: 'var(--text)' }}>Blockchain Data:</strong> When you connect your wallet and 
          use our Service, your public wallet address and transaction history on the Solana blockchain are 
          publicly visible. This is inherent to blockchain technology.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>
          <strong style={{ color: 'var(--text)' }}>Profile Information:</strong> If you choose to set a display 
          name or profile picture, this information is stored on-chain and publicly visible.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          <strong style={{ color: 'var(--text)' }}>Local Storage:</strong> We store your preferences (sound 
          settings, haptic feedback) locally on your device. This data never leaves your device.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>3. How We Use Your Information</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          We use the collected information to: provide and maintain the Service, display leaderboards, 
          process referrals, and improve user experience. We do not sell your personal information to third parties.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>4. Blockchain Transparency</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          All game transactions, winnings, and profile data are recorded on the Solana blockchain. 
          This data is publicly accessible and immutable. We cannot delete or modify blockchain data.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>5. Third-Party Services</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          We use third-party services including: Helius (RPC provider), ImgBB (image hosting for profile pictures), 
          and Vercel (hosting). These services may collect usage data according to their own privacy policies.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>6. Security</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          We never have access to your private keys or seed phrases. All transactions are signed locally 
          in your wallet. However, no method of electronic transmission is 100% secure.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>7. Age Requirement</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Our Service is not intended for anyone under 18 years of age. We do not knowingly collect 
          information from children under 18.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>8. Changes to This Policy</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          We may update this Privacy Policy from time to time. We will notify you of any changes by 
          posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>9. Contact Us</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          If you have any questions about this Privacy Policy, please contact us at:{' '}
          <a href="mailto:seekerscratch@gmail.com" style={{ color: 'var(--gold)' }}>
            seekerscratch@gmail.com
          </a>
        </p>
      </section>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
        <a href="/" style={{ color: 'var(--gold)', fontSize: 14 }}>
          ← Back to Seeker Scratch
        </a>
      </div>
    </div>
  )
}
