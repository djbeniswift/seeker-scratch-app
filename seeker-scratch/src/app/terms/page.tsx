'use client'

export default function TermsOfService() {
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
        TERMS OF SERVICE
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 32, fontSize: 12 }}>
        Last updated: February 12, 2026
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>1. Acceptance of Terms</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          By accessing or using Seeker Scratch (the &quot;Service&quot;), you agree to be bound by these Terms of Service. 
          If you do not agree to these terms, do not use the Service.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>2. Eligibility</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          You must be at least 21 years old to use this Service. By using the Service, you represent and 
          warrant that you are at least 21 years of age and that gambling is legal in your jurisdiction. 
          It is your responsibility to ensure compliance with local laws.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>3. Nature of Service</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Seeker Scratch is a blockchain-based gambling application running on the Solana network. 
          All transactions are processed on-chain and are final. The Service uses provably fair 
          random number generation for game outcomes.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>4. Risks</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>
          <strong style={{ color: 'var(--text)' }}>Financial Risk:</strong> Gambling involves risk of financial loss. 
          Only gamble with funds you can afford to lose. Past results do not guarantee future outcomes.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>
          <strong style={{ color: 'var(--text)' }}>Blockchain Risk:</strong> Transactions on the Solana blockchain 
          are irreversible. Network congestion, smart contract bugs, or other technical issues may affect gameplay.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          <strong style={{ color: 'var(--text)' }}>Cryptocurrency Risk:</strong> The value of SOL and other 
          cryptocurrencies is volatile and may fluctuate significantly.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>5. User Responsibilities</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          You are responsible for: maintaining the security of your wallet and private keys, 
          ensuring sufficient SOL for transactions and fees, complying with applicable laws in your jurisdiction, 
          and any taxes that may apply to your winnings.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>6. Prohibited Activities</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          You agree not to: use the Service if gambling is illegal in your jurisdiction, 
          attempt to manipulate or exploit the Service, use automated systems or bots, 
          engage in money laundering or other illegal activities, or create multiple accounts to abuse promotions.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>7. Intellectual Property</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          The Service, including its design, graphics, and code, is owned by Seeker Scratch. 
          You may not copy, modify, or distribute any part of the Service without permission.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>8. Disclaimer of Warranties</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE 
          UNINTERRUPTED ACCESS, ERROR-FREE OPERATION, OR SPECIFIC OUTCOMES.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>9. Limitation of Liability</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, SEEKER SCRATCH SHALL NOT BE LIABLE FOR ANY 
          INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE SERVICE, 
          INCLUDING LOSS OF FUNDS, DATA, OR PROFITS.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>10. Modifications</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          We reserve the right to modify these Terms at any time. Continued use of the Service after 
          changes constitutes acceptance of the new Terms.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>11. Termination</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          We may suspend or terminate your access to the Service at any time, for any reason, 
          without prior notice. Any funds in the treasury at time of termination will be handled 
          according to the smart contract logic.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 18, marginBottom: 12 }}>12. Contact</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          For questions about these Terms, contact us at:{' '}
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
