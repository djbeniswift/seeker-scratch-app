import './globals.css'
import type { Metadata, Viewport } from 'next'
import { WalletContextProvider } from './components/WalletProvider'

export const metadata: Metadata = {
  title: 'Seeker Scratch | Instant Win on Solana',
  description: 'Instant win scratch cards on Solana. Provably fair, on-chain gambling with instant payouts.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Seeker Scratch',
  },
  openGraph: {
    title: 'Seeker Scratch | Instant Win on Solana',
    description: 'Instant win scratch cards on Solana. Provably fair, on-chain gambling with instant payouts.',
    type: 'website',
    siteName: 'Seeker Scratch',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Seeker Scratch | Instant Win on Solana',
    description: 'Instant win scratch cards on Solana. Provably fair, on-chain gambling with instant payouts.',
  },
  keywords: ['Solana', 'scratch cards', 'gambling', 'crypto', 'blockchain', 'instant win', 'Seeker'],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#f5c842',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Seeker Scratch" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#0d0d1a" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
      </head>
      <body>
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </body>
    </html>
  )
}
