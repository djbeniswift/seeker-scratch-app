'use client'

import { createContext, useContext, useEffect, useState, useCallback, FC, ReactNode } from 'react'
import { Connection, PublicKey } from '@solana/web3.js'
import { PROGRAM_ID } from '../lib/constants'

interface LeaderboardEntry {
  wallet: string
  walletShort: string
  displayName: string
  pfpUrl: string
  pointsThisMonth: number
  pointsAllTime: number
  cardsScratched: number
  totalWon: number
  wins: number
}

interface LeaderboardContextType {
  leaderboard: LeaderboardEntry[]
  isLoading: boolean
  lastUpdated: Date | null
  refreshLeaderboard: () => Promise<void>
  getUserRank: (wallet: string) => number | null
}

const LeaderboardContext = createContext<LeaderboardContextType | null>(null)

export const useLeaderboard = () => {
  const context = useContext(LeaderboardContext)
  if (!context) {
    throw new Error('useLeaderboard must be used within LeaderboardProvider')
  }
  return context
}

const RPC_ENDPOINT = `https://devnet.helius-rpc.com/?api-key=${process.env.next_public_helius_api_key || process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
function shortenWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
}

export const LeaderboardProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refreshLeaderboard = useCallback(async () => {
    setIsLoading(true)
    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed')

      // Fetch all program accounts
      const accounts = await connection.getProgramAccounts(PROGRAM_ID)

      const entries: LeaderboardEntry[] = []

      for (const { pubkey, account } of accounts) {
        try {
          const data = account.data

          // Skip if too small - PlayerProfile should be at least 150 bytes
          if (data.length < 150) continue

          // Skip Treasury accounts (they're smaller and have different structure)
          // PlayerProfile has owner at offset 8, check if it looks like a valid pubkey
          
          let offset = 8 // Skip discriminator

          // owner: Pubkey (32 bytes)
          const ownerBytes = data.slice(offset, offset + 32)
          const owner = new PublicKey(ownerBytes).toString()
          offset += 32

          // Skip if owner is system program (not a real profile)
          if (owner === '11111111111111111111111111111111') continue

          // display_name: String (4-byte length prefix + utf8 bytes)
          const nameLen = data.readUInt32LE(offset)
          offset += 4
          
          // Sanity check - name shouldn't be longer than 16
          if (nameLen > 16) continue
          
          const displayName = nameLen > 0 ? new TextDecoder().decode(data.slice(offset, offset + nameLen)) : ''
          offset += nameLen

          // pfp_url: String (4-byte length prefix + utf8 bytes)
          const pfpLen = data.readUInt32LE(offset)
          offset += 4
          
          // Sanity check - pfp shouldn't be longer than 128
          if (pfpLen > 128) continue
          
          const pfpUrl = pfpLen > 0 ? new TextDecoder().decode(data.slice(offset, offset + pfpLen)) : ''
          offset += pfpLen

          // points_this_month: u64 (8 bytes)
          const pointsThisMonth = Number(data.readBigUInt64LE(offset))
          offset += 8

          // points_all_time: u64 (8 bytes)
          const pointsAllTime = Number(data.readBigUInt64LE(offset))
          offset += 8

          // referrals_count: u32 (4 bytes)
          offset += 4

          // cards_scratched: u32 (4 bytes)
          const cardsScratched = data.readUInt32LE(offset)
          offset += 4

          // total_spent: u64 (8 bytes)
          offset += 8

          // total_won: u64 (8 bytes)
          const totalWon = Number(data.readBigUInt64LE(offset)) / 1_000_000_000
          offset += 8

          // wins: u32 (4 bytes)
          const wins = data.readUInt32LE(offset)

          // Only include profiles that have played OR have set a name
          if (cardsScratched > 0 || displayName) {
            entries.push({
              wallet: owner,
              walletShort: shortenWallet(owner),
              displayName,
              pfpUrl,
              pointsThisMonth,
              pointsAllTime,
              cardsScratched,
              totalWon,
              wins,
            })
          }
        } catch (e) {
          // Skip malformed accounts
          continue
        }
      }

      // Sort by points this month (descending)
      entries.sort((a, b) => b.pointsThisMonth - a.pointsThisMonth)

      setLeaderboard(entries)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getUserRank = useCallback((wallet: string): number | null => {
    const index = leaderboard.findIndex(e => e.wallet === wallet)
    return index >= 0 ? index + 1 : null
  }, [leaderboard])

  useEffect(() => {
    refreshLeaderboard()
    const interval = setInterval(refreshLeaderboard, 60000)
    return () => clearInterval(interval)
  }, [refreshLeaderboard])

  return (
    <LeaderboardContext.Provider value={{ leaderboard, isLoading, lastUpdated, refreshLeaderboard, getUserRank }}>
      {children}
    </LeaderboardContext.Provider>
  )
}