'use client'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useEffect, useState } from 'react'

export default function WalletButton() {
  const { connected, publicKey, disconnect } = useWallet()
  const { setVisible } = useWalletModal()
  const [isMobile, setIsMobile] = useState(false)
  const [isPhantomBrowser, setIsPhantomBrowser] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
    const phantom = !!(window as any).solana?.isPhantom
    setIsMobile(mobile)
    setIsPhantomBrowser(phantom)
  }, [])

  const handleClick = () => {
    if (connected) { disconnect(); return }
    if (isMobile && !isPhantomBrowser) {
      const currentUrl = encodeURIComponent(window.location.href)
      window.location.href = `https://phantom.app/ul/browse/${currentUrl}?ref=${currentUrl}`
      return
    }
    setVisible(true)
  }

  const short = publicKey
    ? `${publicKey.toString().slice(0, 4)}..${publicKey.toString().slice(-4)}`
    : null

  if (!mounted) return null

  return (
    <button
      onClick={handleClick}
      style={{
        padding: '10px 16px',
        background: '#9d4edd',
        border: 'none',
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
      <span>👻</span>
      {connected ? short : isMobile && !isPhantomBrowser ? 'Open in Phantom' : 'Connect Wallet'}
    </button>
  )
}
