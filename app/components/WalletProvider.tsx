'use client'
import { WalletAdapterNetwork, WalletReadyState } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { SolanaMobileWalletAdapter, createDefaultAuthorizationResultCache, createDefaultAddressSelector } from '@solana-mobile/wallet-adapter-mobile'
import { useMemo } from 'react'
import '@solana/wallet-adapter-react-ui/styles.css'

// On Android without an injected wallet, redirect to the wallet's in-app browser
// so it opens seekerscratch.com inside the wallet (where the wallet IS injected).
function androidDeepLink(base: string) {
  const pageUrl = encodeURIComponent(window.location.href)
  const ref = encodeURIComponent(window.location.origin)
  window.location.href = `${base}${pageUrl}?ref=${ref}`
}
function isAndroidNoWallet(readyState: WalletReadyState) {
  return typeof window !== 'undefined'
    && /Android/i.test(navigator.userAgent)
    && readyState !== WalletReadyState.Installed
}

class PhantomDeepLinkAdapter extends PhantomWalletAdapter {
  async connect(): Promise<void> {
    if (isAndroidNoWallet(this.readyState)) {
      androidDeepLink('https://phantom.app/ul/v1/browse/')
      return
    }
    return super.connect()
  }
}

class SolflareDeepLinkAdapter extends SolflareWalletAdapter {
  async connect(): Promise<void> {
    if (isAndroidNoWallet(this.readyState)) {
      androidDeepLink('https://solflare.com/ul/v1/browse/')
      return
    }
    return super.connect()
  }
}

class BackpackDeepLinkAdapter extends BackpackWalletAdapter {
  async connect(): Promise<void> {
    if (isAndroidNoWallet(this.readyState)) {
      const pageUrl = encodeURIComponent(window.location.href)
      const ref = encodeURIComponent(window.location.origin)
      window.location.href = `https://backpack.app/browse?url=${pageUrl}&ref=${ref}`
      return
    }
    return super.connect()
  }
}

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const network = WalletAdapterNetwork.Mainnet
  const endpoint = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'

  const wallets = useMemo(() => {
    const isAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent)
    // If a wallet extension is already injected (e.g. Phantom in-app browser), skip MWA
    const hasInjectedWallet = typeof window !== 'undefined' && !!(
      (window as any).phantom?.solana || (window as any).solana || (window as any).backpack
    )
    const list: any[] = [
      new PhantomDeepLinkAdapter(),
      new SolflareDeepLinkAdapter(),
      new BackpackDeepLinkAdapter(),
    ]
    // MWA first on Android native browser (Seeker/Saga)
    if (isAndroid && !hasInjectedWallet) {
      const appUri = typeof window !== 'undefined'
        ? window.location.origin
        : 'https://seekerscratch.com'
      list.unshift(new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'Seeker Scratch',
          uri: appUri,
          icon: '/icon-192.png',
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        onWalletNotFound: async () => { window.open('https://solanamobile.com/wallets', '_blank') },
        cluster: network,
      }))
    }
    return list
  }, [network])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
