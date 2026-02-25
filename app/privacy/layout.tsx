import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Privacy Policy — Seeker Scratch',
  description: 'Privacy policy for the Seeker Scratch dApp on Solana',
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
