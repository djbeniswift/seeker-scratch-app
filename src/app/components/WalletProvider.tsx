'use client'

import { FC, ReactNode, useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { TreasuryProvider } from '../contexts/TreasuryContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LeaderboardProvider } from '../contexts/LeaderboardContext'

require('@solana/wallet-adapter-react-ui/styles.css')

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
const endpoint = `https://devnet.helius-rpc.com/?api-key=${process.env.next_public_helius_api_key || process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
  const config = {
    commitment: 'confirmed' as const,
    confirmTransactionInitialTimeout: 60000,
  }

  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], [])

  return (
    <ConnectionProvider endpoint={endpoint} config={config}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <TreasuryProvider>
            <SettingsProvider>
              <LeaderboardProvider>
                {children}
              </LeaderboardProvider>
            </SettingsProvider>
          </TreasuryProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}