import type { Metadata } from 'next'
import { WalletContextProvider } from './components/WalletProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Seeker Scratch — Instant Win on Solana',
  description: 'Instant win scratch cards on Solana. Buy, scratch, win SOL instantly.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </body>
    </html>
  )
}