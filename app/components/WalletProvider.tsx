'use client'
import { WalletAdapterNetwork, WalletReadyState } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { SolanaMobileWalletAdapter, createDefaultAuthorizationResultCache, createDefaultAddressSelector } from '@solana-mobile/wallet-adapter-mobile'
import { useEffect, useMemo } from 'react'
import '@solana/wallet-adapter-react-ui/styles.css'

// Guard: only run on Android browser without the wallet injected
// Uses a lazy getter fn so window is never accessed during SSR
function isAndroidWithoutWallet(getInjected: () => boolean) {
  return typeof window !== 'undefined' && /Android/i.test(navigator.userAgent) && !getInjected()
}

// Phantom defaults to NotDetected on Android — the library never calls connect() for NotDetected wallets.
// Setting _readyState = Loadable on Android causes WalletProviderBase to call connect(),
// and PhantomWalletAdapter.connect() already handles Loadable by redirecting to phantom.app/ul/browse/.
class PhantomDeepLinkAdapter extends PhantomWalletAdapter {
  constructor() {
    super()
    if (isAndroidWithoutWallet(() => !!(window as any).phantom?.solana)) {
      ;(this as any)._readyState = WalletReadyState.Loadable
      this.emit('readyStateChange', WalletReadyState.Loadable)
    }
  }
}

// SolflareWalletAdapter already defaults to Loadable in the browser — no readyState fix needed.
// Its built-in Loadable redirect only fires on iOS though, so we override connect() for Android.
class SolflareDeepLinkAdapter extends SolflareWalletAdapter {
  async connect(): Promise<void> {
    if (isAndroidWithoutWallet(() => !!(window as any).solflare)) {
      const url = encodeURIComponent(window.location.href)
      const ref = encodeURIComponent(window.location.origin)
      window.location.href = `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`
      return
    }
    return super.connect()
  }
}

// Backpack defaults to NotDetected on Android — same fix as Phantom.
// Backpack has no built-in Loadable redirect, so we also override connect().
// Uses /ul/v1/browse/ path (same pattern as Phantom/Solflare).
class BackpackDeepLinkAdapter extends BackpackWalletAdapter {
  constructor() {
    super()
    if (isAndroidWithoutWallet(() => !!(window as any).backpack)) {
      ;(this as any)._readyState = WalletReadyState.Loadable
      this.emit('readyStateChange', WalletReadyState.Loadable)
    }
  }
  async connect(): Promise<void> {
    if (isAndroidWithoutWallet(() => !!(window as any).backpack)) {
      const url = encodeURIComponent(window.location.href)
      const ref = encodeURIComponent(window.location.origin)
      window.location.href = `https://backpack.app/ul/v1/browse/${url}?ref=${ref}`
      return
    }
    return super.connect()
  }
}

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const network = WalletAdapterNetwork.Mainnet
  const endpoint = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'

  // If the stored wallet name points to an adapter that can't connect in this browser context
  // (e.g. user previously connected via Phantom's in-app browser but now in native Chrome),
  // clear the stored selection so they get a clean wallet picker.
  useEffect(() => {
    const stored = localStorage.getItem('walletName')
    if (!stored) return
    const name = stored.replace(/^"|"$/g, '') // strip JSON quotes
    const isAndroid = /Android/i.test(navigator.userAgent)
    const hasInjected = !!(
      (window as any).phantom?.solana || (window as any).solana || (window as any).backpack
    )
    // In native Android Chrome without any injected wallet, "Phantom"/"Solflare"/"Backpack"
    // would just redirect away again — clear so the user sees all options fresh.
    const extensionOnlyWallets = ['Phantom', 'Solflare', 'Backpack']
    if (isAndroid && !hasInjected && extensionOnlyWallets.includes(name)) {
      localStorage.removeItem('walletName')
    }
  }, [])

  const wallets = useMemo(() => {
    const isAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent)
    const hasInjectedWallet = typeof window !== 'undefined' && !!(
      (window as any).phantom?.solana || (window as any).solana || (window as any).backpack
    )
    const list: any[] = [
      new PhantomDeepLinkAdapter(),
      new SolflareDeepLinkAdapter(),
      new BackpackDeepLinkAdapter(),
    ]
    // Always add MWA on Android — even inside a wallet's in-app browser the user may want
    // to switch to the native Seeker wallet. Skip only if MWA itself is the injected wallet.
    if (isAndroid) {
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
      <WalletProvider wallets={wallets} autoConnect localStorageKey="walletName">
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
