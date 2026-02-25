import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'
import { useCallback, useState } from 'react'
import { PROGRAM_ID, TREASURY_SEED, PROFILE_SEED, IDL } from '../lib/constants'

export function useScratchProgram() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [treasury, setTreasury] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const getProvider = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null
    return new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' })
  }, [connection, wallet])

  const getProgram = useCallback(() => {
    const provider = getProvider()
    if (!provider) return null
    return new Program(IDL as any, PROGRAM_ID, provider)
  }, [getProvider])

  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)

  const fetchTreasury = useCallback(async () => {
    const program = getProgram()
    if (!program) return
    try {
      const data = await (program.account as any).treasury.fetch(treasuryPda)
      setTreasury({
        balance: data.balance.toNumber() / LAMPORTS_PER_SOL,
        totalCardsSold: data.totalCardsSold.toNumber(),
      })
    } catch (err) {
      console.error('Failed to fetch treasury:', err)
    }
  }, [getProgram, treasuryPda])

  const fetchProfile = useCallback(async () => {
    if (!wallet.publicKey) return
    const program = getProgram()
    if (!program) return
    try {
      const [profilePda] = PublicKey.findProgramAddressSync(
        [PROFILE_SEED, wallet.publicKey.toBuffer()],
        PROGRAM_ID
      )
      const data = await (program.account as any).playerProfile.fetch(profilePda)
      setProfile({
        pointsThisMonth: data.pointsThisMonth.toNumber(),
        pointsAllTime: data.pointsAllTime.toNumber(),
        cardsScratched: data.cardsScratched,
        totalSpent: data.totalSpent.toNumber() / LAMPORTS_PER_SOL,
        totalWon: data.totalWon.toNumber() / LAMPORTS_PER_SOL,
        wins: data.wins,
      })
    } catch (err) {
      console.log('Profile not found yet')
      setProfile(null)
    }
  }, [wallet.publicKey, getProgram])

  const buyCard = useCallback(async (cardType: string) => {
    const program = getProgram()
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected')

    setLoading(true)
    try {
      const [profilePda] = PublicKey.findProgramAddressSync(
        [PROFILE_SEED, wallet.publicKey.toBuffer()],
        PROGRAM_ID
      )

      const cardTypeArg = {
        QuickPick: { quickPick: {} },
        Lucky7s: { lucky7S: {} },
        HotShot: { hotShot: {} },
        MegaGold: { megaGold: {} },
      }[cardType]

      await (program.methods as any).buyAndScratch(cardTypeArg).accounts({
        treasury: treasuryPda,
        profile: profilePda,
        player: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc({ commitment: 'confirmed' })

      await fetchTreasury()
      await fetchProfile()
    } finally {
      setLoading(false)
    }
  }, [getProgram, wallet.publicKey, treasuryPda, fetchTreasury, fetchProfile])

  return { treasury, profile, loading, fetchTreasury, fetchProfile, buyCard, getProgram }
}
