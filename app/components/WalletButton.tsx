'use client'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useEffect, useState } from 'react'

export default function WalletButton() {
  const { connected, publicKey, disconnect } = useWallet()
  const { setVisible } = useWalletModal()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleClick = () => {
    if (connected) {
      disconnect()
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
        background: connected ? '#9d4edd' : '#9d4edd',
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
      {connected ? short : 'Connect Wallet'}
    </button>
  )
}
