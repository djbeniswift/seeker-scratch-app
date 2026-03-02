import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"
import { WalletProviders } from './components/WalletProvider'
import { LeaderboardProvider } from './contexts/LeaderboardContext'

export const metadata: Metadata = {
  title: "Seeker Scratch | Instant Win Scratch Cards on Solana",
  description: "Provably fair instant win scratch cards on Solana. Win SOL instantly. Built for the Seeker phone.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  metadataBase: new URL("https://seekerscratch.vercel.app"),
  alternates: {
    canonical: "https://seekerscratch.com",
  },
  openGraph: {
    title: "Seeker Scratch | Instant Win Scratch Cards on Solana",
    description: "Provably fair instant win scratch cards on Solana. Win SOL instantly. Built for the Seeker phone.",
    url: "https://seekerscratch.com",
    siteName: "Seeker Scratch",
    type: "website",
    images: [
      {
        url: "https://seekerscratch.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Seeker Scratch — Instant Win Scratch Cards on Solana",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Seeker Scratch",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <WalletProviders>
          <LeaderboardProvider>
            {children}
          </LeaderboardProvider>
        </WalletProviders>
        <Analytics />
      </body>
    </html>
  );
}
