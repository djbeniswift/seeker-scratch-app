'use client'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { SolanaMobileWalletAdapter, createDefaultAuthorizationResultCache, createDefaultAddressSelector } from '@solana-mobile/wallet-adapter-mobile'
import { clusterApiUrl } from '@solana/web3.js'
import { useMemo } from 'react'
import '@solana/wallet-adapter-react-ui/styles.css'

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const network = WalletAdapterNetwork.Devnet
  const endpoint = useMemo(() => clusterApiUrl(network), [network])

  const wallets = useMemo(() => [
    new SolanaMobileWalletAdapter({
      addressSelector: createDefaultAddressSelector(),
      appIdentity: {
        name: 'Seeker Scratch',
        uri: 'https://seekerscratch.vercel.app',
        icon: '/icon-192.png',
      },
      authorizationResultCache: createDefaultAuthorizationResultCache(),
      cluster: network,
    }),
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
  ], [network])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
