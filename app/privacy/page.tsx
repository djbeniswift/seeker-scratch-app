export default function PrivacyPolicy() {
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
          PRIVACY POLICY
        </h1>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 24 }}>
          Last updated: February 24, 2026
        </div>
        <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.1)', marginBottom: 32 }} />
      </div>

      {[
        {
          title: '1. Overview',
          body: `Seeker Scratch ("we", "our", or "the app") is a decentralized application (dApp) built on the Solana blockchain. We are committed to protecting your privacy. This policy explains what information is collected, how it is used, and your rights.`
        },
        {
          title: '2. Information We Do NOT Collect',
          body: `We do not collect, store, or process any personally identifiable information (PII). We do not collect your name, email address, phone number, or physical address. We do not use cookies or tracking technologies. We do not use analytics services or third-party trackers.`
        },
        {
          title: '3. Blockchain Data',
          body: `Seeker Scratch interacts with the Solana blockchain. All transactions, including card purchases and prize payouts, are recorded publicly on-chain. Your Solana wallet public address is visible on-chain as part of normal blockchain operation. We do not control or store this data — it is inherent to how public blockchains work.`
        },
        {
          title: '4. Wallet Connection',
          body: `When you connect a wallet (Phantom, Solflare, Backpack, or Seeker Seed Vault), we only access your public wallet address to display your balance and interact with the smart contract. We never request, access, or store your private keys or seed phrase. Your wallet connection is managed entirely by your wallet provider.`
        },
        {
          title: '5. Smart Contract',
          body: `All game logic runs on a publicly auditable smart contract deployed on the Solana blockchain at program ID: 2oPCsxMuy85Q4tUiEuhJ3zkK8ZurRVjkEEj4CmMdgx1x. Outcomes are determined on-chain by the smart contract. We do not control or manipulate game outcomes.`
        },
        {
          title: '6. Third-Party Services',
          body: `The app uses Solana RPC endpoints to communicate with the blockchain. These are standard infrastructure services and do not receive any personal data from us. Wallet providers (Phantom, Solflare, Backpack, Solana Mobile) operate under their own privacy policies.`
        },
        {
          title: '7. Children\'s Privacy',
          body: `Seeker Scratch is not intended for users under the age of 18. We do not knowingly collect any information from minors. If you are under 18, please do not use this application.`
        },
        {
          title: '8. Changes to This Policy',
          body: `We may update this privacy policy from time to time. Any changes will be reflected on this page with an updated date. Continued use of the app after changes constitutes acceptance of the updated policy.`
        },
        {
          title: '9. Contact',
          body: `If you have questions about this privacy policy, please reach out via the Solana Mobile Discord or open an issue on our public repository.`
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
