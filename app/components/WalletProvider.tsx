'use client'
import { WalletAdapterNetwork, WalletName, WalletReadyState } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { SolanaMobileWalletAdapter, createDefaultAuthorizationResultCache, createDefaultAddressSelector } from '@solana-mobile/wallet-adapter-mobile'
import { useEffect, useMemo } from 'react'
import '@solana/wallet-adapter-react-ui/styles.css'

// True only in Android native browser with NO wallet injected at all.
// If any wallet is injected (e.g. we're inside Phantom's browser) we must NOT
// deep-link to other wallets — they would just open a download page in Phantom's browser.
function hasAnyInjectedWallet() {
  return !!(
    (window as any).phantom?.solana ||
    (window as any).solana ||
    (window as any).backpack ||
    (window as any).solflare?.isSolflare ||  // Solflare in-app browser
    (window as any).SolflareApp               // Solflare legacy injection
  )
}

function isAndroidNoBrowserWallet() {
  if (typeof window === 'undefined') return false
  if (!/Android/i.test(navigator.userAgent)) return false
  return !hasAnyInjectedWallet()
}

// Phantom defaults to NotDetected on Android — the library never calls connect() for NotDetected wallets.
// Setting _readyState = Loadable on Android causes WalletProviderBase to call connect(),
// and PhantomWalletAdapter.connect() already handles Loadable by redirecting to phantom.app/ul/browse/.
class PhantomDeepLinkAdapter extends PhantomWalletAdapter {
  constructor() {
    super()
    if (isAndroidNoBrowserWallet()) {
      ;(this as any)._readyState = WalletReadyState.Loadable
      this.emit('readyStateChange', WalletReadyState.Loadable)
    }
  }
}

// SolflareWalletAdapter already defaults to Loadable in the browser — no readyState fix needed.
// Its built-in Loadable redirect only fires on iOS though, so we override connect() for Android.
class SolflareDeepLinkAdapter extends SolflareWalletAdapter {
  async connect(): Promise<void> {
    if (isAndroidNoBrowserWallet()) {
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
    if (isAndroidNoBrowserWallet()) {
      ;(this as any)._readyState = WalletReadyState.Loadable
      this.emit('readyStateChange', WalletReadyState.Loadable)
    }
  }
  async connect(): Promise<void> {
    if (isAndroidNoBrowserWallet()) {
      const url = encodeURIComponent(window.location.href)
      const ref = encodeURIComponent(window.location.origin)
      window.location.href = `https://backpack.app/ul/v1/browse/${url}?ref=${ref}`
      return
    }
    return super.connect()
  }
}

// Placed inside WalletProvider tree so it can use useWallet().
// When inside a wallet's in-app browser, detects which wallet is injected,
// selects it, and connects — bypassing the "Connect a wallet" modal entirely.
function InjectedWalletAutoConnect() {
  const { select, connect, wallet, connected, connecting } = useWallet()

  // On mount: select the injected wallet
  useEffect(() => {
    if (typeof window === 'undefined' || connected || connecting) return
    if (!hasAnyInjectedWallet()) return

    let name: WalletName | null = null
    if ((window as any).phantom?.solana)                          name = 'Phantom' as WalletName
    else if ((window as any).backpack)                            name = 'Backpack' as WalletName
    else if ((window as any).solflare?.isSolflare || (window as any).SolflareApp) name = 'Solflare' as WalletName
    else if ((window as any).solana)                              name = 'Phantom' as WalletName

    if (name) select(name)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // After wallet is selected, connect it
  useEffect(() => {
    if (!wallet || connected || connecting) return
    if (!hasAnyInjectedWallet()) return
    connect().catch(() => {})
  }, [wallet?.adapter.name]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
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
    const hasInjectedWallet = typeof window !== 'undefined' && hasAnyInjectedWallet()

    // Inside a wallet's in-app browser: use plain adapters only.
    // The injected wallet shows as Installed and connects directly.
    // Non-injected wallets show as NotDetected and do nothing — no deep linking.
    if (hasInjectedWallet) {
      return [
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
        new BackpackWalletAdapter(),
      ]
    }

    // Native Android Chrome (no injected wallet): offer MWA + deep link adapters.
    if (isAndroid) {
      const appUri = window.location.origin
      return [
        new SolanaMobileWalletAdapter({
          addressSelector: createDefaultAddressSelector(),
          appIdentity: {
            name: 'Seeker Scratch',
            uri: appUri,
            icon: '/icon-192.png',
          },
          authorizationResultCache: createDefaultAuthorizationResultCache(),
          onWalletNotFound: async () => { window.open('https://solanamobile.com/wallets', '_blank') },
          cluster: network,
        }),
        new PhantomDeepLinkAdapter(),
        new SolflareDeepLinkAdapter(),
        new BackpackDeepLinkAdapter(),
      ]
    }

    // Desktop / iOS: standard adapters.
    return [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ]
  }, [network])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect localStorageKey="walletName">
        <InjectedWalletAutoConnect />
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
