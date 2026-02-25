import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'
import { useCallback, useState } from 'react'
import { PROGRAM_ID, TREASURY_SEED, PROFILE_SEED, IDL } from '../lib/constants'

// Dummy pubkey used as referrerProfile when player has no referrer
const DUMMY_PUBKEY = new PublicKey('11111111111111111111111111111111')

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

  const getProfilePda = useCallback((owner: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [PROFILE_SEED, owner.toBuffer()],
      PROGRAM_ID
    )
    return pda
  }, [])

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
      const profilePda = getProfilePda(wallet.publicKey)
      const data = await (program.account as any).playerProfile.fetch(profilePda)
      setProfile({
        pointsThisMonth: data.pointsThisMonth.toNumber(),
        pointsAllTime: data.pointsAllTime.toNumber(),
        cardsScratched: data.cardsScratched,
        totalSpent: data.totalSpent.toNumber() / LAMPORTS_PER_SOL,
        totalWon: data.totalWon.toNumber() / LAMPORTS_PER_SOL,
        wins: data.wins,
        hasBeenReferred: data.hasBeenReferred,
        referredBy: data.referredBy?.toBase58(),
        referralBonusPaid: data.referralBonusPaid,
        referralsCount: data.referralsCount,
      })
    } catch (err) {
      console.log('Profile not found yet')
      setProfile(null)
    }
  }, [wallet.publicKey, getProgram, getProfilePda])

  const registerReferral = useCallback(async (referrerPubkey: string) => {
    const program = getProgram()
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected')

    const referrer = new PublicKey(referrerPubkey)
    const refereeProfile = getProfilePda(wallet.publicKey)

    await (program.methods as any).registerReferral().accounts({
      refereeProfile,
      referee: wallet.publicKey,
      referrer,
      systemProgram: SystemProgram.programId,
    }).rpc({ commitment: 'confirmed' })

    await fetchProfile()
  }, [getProgram, wallet.publicKey, getProfilePda, fetchProfile])

  const buyCard = useCallback(async (cardType: string) => {
    const program = getProgram()
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected')

    setLoading(true)
    try {
      const profilePda = getProfilePda(wallet.publicKey)

      // Fetch current profile to get referredBy
      let referrerProfilePda: PublicKey
      try {
        const profileData = await (program.account as any).playerProfile.fetch(profilePda)
        const referredBy: PublicKey = profileData.referredBy
        // If referredBy is default pubkey (no referrer), use dummy
        if (referredBy.equals(DUMMY_PUBKEY)) {
          referrerProfilePda = getProfilePda(DUMMY_PUBKEY)
        } else {
          referrerProfilePda = getProfilePda(referredBy)
        }
      } catch {
        // Profile doesn't exist yet — no referrer
        referrerProfilePda = getProfilePda(DUMMY_PUBKEY)
      }

      const cardTypeArg = {
        QuickPick: { quickPick: {} },
        Lucky7s: { lucky7S: {} },
        HotShot: { hotShot: {} },
        MegaGold: { megaGold: {} },
      }[cardType]

      await (program.methods as any).buyAndScratch(cardTypeArg).accounts({
        treasury: treasuryPda,
        profile: profilePda,
        referrerProfile: referrerProfilePda,
        player: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc({ commitment: 'confirmed' })

      await fetchTreasury()
      await fetchProfile()
    } finally {
      setLoading(false)
    }
  }, [getProgram, wallet.publicKey, treasuryPda, getProfilePda, fetchTreasury, fetchProfile])

  return { treasury, profile, loading, fetchTreasury, fetchProfile, buyCard, registerReferral, getProgram }
}
