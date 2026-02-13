'use client'

import { createContext, useContext, useEffect, useState, useCallback, FC, ReactNode } from 'react'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { PROGRAM_ID, TREASURY_SEED } from '../lib/constants'

interface TreasuryContextType {
  treasuryBalance: number
  treasuryPda: PublicKey
  refreshTreasury: () => Promise<void>
}

const TreasuryContext = createContext<TreasuryContextType | null>(null)

export const useTreasuryContext = () => {
  const context = useContext(TreasuryContext)
  if (!context) {
    throw new Error('useTreasuryContext must be used within TreasuryProvider')
  }
  return context
}

const RPC_ENDPOINT = 'https://devnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'

const [treasuryPda] = PublicKey.findProgramAddressSync(
  [TREASURY_SEED],
  PROGRAM_ID
)

export const TreasuryProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [treasuryBalance, setTreasuryBalance] = useState(0)

  const refreshTreasury = useCallback(async () => {
    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed')
      const balance = await connection.getBalance(treasuryPda)
      setTreasuryBalance(balance / LAMPORTS_PER_SOL)
    } catch (err) {
      console.error('Failed to fetch treasury:', err)
    }
  }, [])

  useEffect(() => {
    refreshTreasury()
    const interval = setInterval(refreshTreasury, 30000)
    return () => clearInterval(interval)
  }, [refreshTreasury])

  return (
    <TreasuryContext.Provider value={{ treasuryBalance, treasuryPda, refreshTreasury }}>
      {children}
    </TreasuryContext.Provider>
  )
}
