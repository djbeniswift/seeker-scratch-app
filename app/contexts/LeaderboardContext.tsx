'use client'
import { createContext, useContext, useState, useCallback } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'

interface LeaderboardEntry {
  wallet: string
  pointsThisMonth: number
  pointsAllTime: number
  totalWon: number
  cardsScratched: number
  displayName: string
}

interface LeaderboardContextType {
  leaderboard: LeaderboardEntry[]
  isLoading: boolean
  refreshLeaderboard: () => Promise<void>
  getUserRank: (wallet: string) => number | null
}

const LeaderboardContext = createContext<LeaderboardContextType>({
  leaderboard: [],
  isLoading: false,
  refreshLeaderboard: async () => {},
  getUserRank: () => null,
})

// Mock leaderboard data
const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', displayName: 'SolanaMaster', pointsThisMonth: 2847, pointsAllTime: 8532, totalWon: 45.2, cardsScratched: 284 },
  { wallet: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', displayName: 'LuckyWhale', pointsThisMonth: 2134, pointsAllTime: 6821, totalWon: 38.7, cardsScratched: 213 },
  { wallet: 'Aw3uqGC8dLSJmDyLy6FkTvXEBDMfSmV5Lx8rXgPE3CsP', displayName: 'DiamondHands', pointsThisMonth: 1956, pointsAllTime: 5644, totalWon: 32.1, cardsScratched: 195 },
  { wallet: '8nqZvRXFzrPo3mGQVPm4Qq8D5fzrqmGZp6x5MtMBjbSL', displayName: 'CryptoKing', pointsThisMonth: 1723, pointsAllTime: 4932, totalWon: 28.5, cardsScratched: 172 },
  { wallet: 'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh', displayName: 'MoonShot', pointsThisMonth: 1489, pointsAllTime: 4321, totalWon: 24.3, cardsScratched: 148 },
  { wallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', displayName: '', pointsThisMonth: 1256, pointsAllTime: 3876, totalWon: 19.8, cardsScratched: 125 },
  { wallet: 'BjK7hXGhCqPxNWCPy5qzKMPzHJNuqUkBD9SWVWmfBJ6L', displayName: 'GoldenGambler', pointsThisMonth: 1087, pointsAllTime: 3254, totalWon: 17.2, cardsScratched: 108 },
  { wallet: 'FnRfieqqNhA5tSkdAUZmkCUjGKBkAq6HLH9rCBNTXYBN', displayName: '', pointsThisMonth: 943, pointsAllTime: 2987, totalWon: 15.6, cardsScratched: 94 },
  { wallet: 'HLn6yU7cCNb8Nf8e8GkpkPxdQTwMkDhKSJrHnBtqQPZp', displayName: 'ScratchPro', pointsThisMonth: 812, pointsAllTime: 2543, totalWon: 13.2, cardsScratched: 81 },
  { wallet: 'CckxW1C7mJqR3FQ6PbLVmLvBkZ1w5gJyMT7m8TpMPEjB', displayName: '', pointsThisMonth: 687, pointsAllTime: 2134, totalWon: 11.4, cardsScratched: 68 },
]

export function LeaderboardProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(MOCK_LEADERBOARD)
  const [isLoading, setIsLoading] = useState(false)

  const refreshLeaderboard = useCallback(async () => {
    setIsLoading(true)
    try {
      // Simulate loading delay
      await new Promise(resolve => setTimeout(resolve, 500))
      // In production, this would fetch real data
      setLeaderboard(MOCK_LEADERBOARD)
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err)
    } finally {
      setIsLoading(false)
    }
  }, [connection])

  const getUserRank = useCallback((wallet: string) => {
    const index = leaderboard.findIndex(entry => entry.wallet === wallet)
    return index >= 0 ? index + 1 : null
  }, [leaderboard])

  return (
    <LeaderboardContext.Provider value={{ leaderboard, isLoading, refreshLeaderboard, getUserRank }}>
      {children}
    </LeaderboardContext.Provider>
  )
}

export const useLeaderboard = () => useContext(LeaderboardContext)
