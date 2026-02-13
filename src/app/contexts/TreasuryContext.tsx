'use client'

import { createContext, useContext, useEffect, useState, useCallback, FC, ReactNode } from 'react'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { PROGRAM_ID, TREASURY_SEED } from '../lib/constants'

interface TreasuryContextType {
  treasuryBalance: number | null
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
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null)

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [TREASURY_SEED],
    PROGRAM_ID
  )

  const refreshTreasury = useCallback(async () => {
    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed')
      const accountInfo = await connection.getAccountInfo(treasuryPda)
      
      if (accountInfo && accountInfo.data) {
        const dataView = new DataView(accountInfo.data.buffer, accountInfo.data.byteOffset)
        const balanceLamports = dataView.getBigUint64(40, true)
        const balanceSol = Number(balanceLamports) / LAMPORTS_PER_SOL
        setTreasuryBalance(balanceSol)
      }
    } catch (err) {
      console.error('Failed to fetch treasury:', err)
    }
  }, [treasuryPda])

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