'use client'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useEffect, useState } from 'react'

export default function WalletButton() {
  const { connected, publicKey, disconnect, wallet } = useWallet()
  const { setVisible } = useWalletModal()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const handleClick = () => {
    if (connected) { disconnect(); return }
    setVisible(true)
  }

  const short = publicKey
    ? `${publicKey.toString().slice(0, 4)}..${publicKey.toString().slice(-4)}`
    : null

  // Detect: Phantom connected but NOT inside Phantom's in-app browser
  const isPhantom = wallet?.adapter?.name === 'Phantom'
  const isInPhantomBrowser = typeof window !== 'undefined' && (window as any).phantom?.solana?.isPhantom && navigator.userAgent.includes('Phantom')
  const isMobile = typeof window !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)
  const showPhantomBanner = connected && isPhantom && isMobile && !isInPhantomBrowser

  if (!mounted) return null
  return (
    <>
      {showPhantomBanner && (
        <a
          href={`https://phantom.app/ul/browse/${encodeURIComponent('https://seekerscratch.com')}`}
          style={{
            display: 'block',
            background: '#ab9ff2',
            color: '#000',
            textAlign: 'center',
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 'bold',
            textDecoration: 'none',
          }}
        >
          ⚠️ Open in Phantom browser for best experience →
        </a>
      )}
      <button
        onClick={handleClick}
        style={{
          padding: '10px 16px',
          background: connected ? '#1a1a2e' : '#9d4edd',
          border: connected ? '1px solid rgba(157,78,221,0.4)' : 'none',
          borderRadius: 12,
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 44,
        }}
      >
        <span>{connected ? '🔗' : '👛'}</span>
        {connected ? short : 'Connect Wallet'}
      </button>
    </>
  )
}
