import type { Metadata } from "next";
import "./globals.css";
import { WalletProviders } from './components/WalletProvider'
import { LeaderboardProvider } from './contexts/LeaderboardContext'

export const metadata: Metadata = {
  title: "Seeker Scratch",
  description: "Instant win on Solana",
  manifest: "/manifest.json",
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
      </body>
    </html>
  );
}
