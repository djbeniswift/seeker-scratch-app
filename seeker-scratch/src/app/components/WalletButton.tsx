'use client'

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'

export default function WalletButton() {
  return (
    <WalletMultiButton style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 20,
      fontSize: 12,
      padding: '8px 16px',
      fontFamily: 'monospace',
    }} />
  )
}