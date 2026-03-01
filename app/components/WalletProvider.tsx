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
  const network = WalletAdapterNetwork.Mainnet
  const endpoint = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'

  const wallets = useMemo(() => {
    const isAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent)
    // If a wallet extension is already injected (e.g. Phantom in-app browser), skip MWA
    const hasInjectedWallet = typeof window !== 'undefined' && !!(
      (window as any).phantom?.solana || (window as any).solana || (window as any).backpack
    )
    // Android native browser (Seeker/Saga) — MWA only; extension wallets have no app to open
    if (isAndroid && !hasInjectedWallet) {
      const appUri = typeof window !== 'undefined'
        ? window.location.origin
        : 'https://seekerscratch.com'
      return [new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'Seeker Scratch',
          uri: appUri,
          icon: '/icon-192.png',
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        onWalletNotFound: async () => { window.open('https://solanamobile.com/wallets', '_blank') },
        cluster: network,
      })]
    }
    // Desktop / Phantom in-app browser — extension wallets
    return [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ]
  }, [network])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
