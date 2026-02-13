import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useCallback, useEffect, useState } from 'react'
import { PROGRAM_ID, TREASURY_SEED, PROFILE_SEED, NFT_SEED, IDL } from '../lib/constants'

export interface TreasuryData {
  balance: number
  totalCardsSold: number
  totalPaidOut: number
  totalProfit: number
  paused: boolean
}

export interface ProfileData {
  pointsThisMonth: number
  pointsAllTime: number
  cardsScratched: number
  totalSpent: number
  totalWon: number
  wins: number
  referralsCount: number
  bonusNft: PublicKey | null
  nftMultiplierCache: number
  referredBy: PublicKey | null
  displayName: string
  pfpUrl: string
}

export function useScratchProgram() {
  const { connection } = useConnection()
  const wallet = useWallet()

  const [treasury, setTreasury] = useState<TreasuryData | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [solBalance, setSolBalance] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [lastPrize, setLastPrize] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const getProvider = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null
    return new AnchorProvider(
      connection,
      wallet as any,
      { commitment: 'confirmed' }
    )
  }, [connection, wallet])

  const getProgram = useCallback(() => {
    const provider = getProvider()
    if (!provider) return null
    return new Program(IDL as any, PROGRAM_ID, provider)
  }, [getProvider])

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [TREASURY_SEED],
    PROGRAM_ID
  )

  const getProfilePda = useCallback((owner: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [PROFILE_SEED, owner.toBuffer()],
      PROGRAM_ID
    )
    return pda
  }, [])

  const getNftPda = useCallback((owner: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [NFT_SEED, owner.toBuffer()],
      PROGRAM_ID
    )
    return pda
  }, [])

  // ── Fetch treasury ──
  const fetchTreasury = useCallback(async () => {
    const program = getProgram()
    if (!program) return
    try {
      const data = await (program.account as any).treasury.fetch(treasuryPda)
      setTreasury({
        balance: data.balance.toNumber() / LAMPORTS_PER_SOL,
        totalCardsSold: data.totalCardsSold.toNumber(),
        totalPaidOut: data.totalPaidOut.toNumber() / LAMPORTS_PER_SOL,
        totalProfit: data.totalProfit.toNumber() / LAMPORTS_PER_SOL,
        paused: data.paused,
      })
    } catch {
      setTreasury(null)
    }
  }, [getProgram, treasuryPda])

  // ── Fetch player profile ──
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
        referralsCount: data.referralsCount,
        bonusNft: data.bonusNft,
        nftMultiplierCache: data.nftMultiplierCache,
        referredBy: data.referredBy,
        displayName: data.displayName || '',
        pfpUrl: data.pfpUrl || '',
      })
    } catch {
      setProfile(null)
    }
  }, [wallet.publicKey, getProgram, getProfilePda])

  // ── Fetch SOL balance ──
  const fetchBalance = useCallback(async () => {
    if (!wallet.publicKey) return
    try {
      const bal = await connection.getBalance(wallet.publicKey)
      setSolBalance(bal / LAMPORTS_PER_SOL)
    } catch {
      setSolBalance(0)
    }
  }, [wallet.publicKey, connection])

  // ── Buy and scratch ──
  const buyAndScratch = useCallback(async (cardType: string): Promise<number> => {
    const program = getProgram()
    if (!program || !wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected')
    }

    setLoading(true)
    setTxStatus('pending')
    setLastError(null)
    setLastPrize(null)

    try {
      const profilePda = getProfilePda(wallet.publicKey)

      const cardTypeMap: Record<string, object> = {
        'QuickPick': { quickPick: {} },
        'Lucky7s': { lucky7S: {} },
        'HotShot': { hotShot: {} },
        'MegaGold': { megaGold: {} },
      }
      const cardTypeArg = cardTypeMap[cardType]

      if (!cardTypeArg) {
        throw new Error(`Unknown card type: ${cardType}`)
      }

      const balanceBefore = await connection.getBalance(wallet.publicKey)

      const tx = await (program.methods as any)
        .buyAndScratch(cardTypeArg)
        .accounts({
          treasury: treasuryPda,
          profile: profilePda,
          player: wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .transaction()

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash
      tx.feePayer = wallet.publicKey

      const signedTx = await wallet.signTransaction(tx)

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed')

      const balanceAfter = await connection.getBalance(wallet.publicKey)

      const costs: Record<string, number> = {
        QuickPick: 10_000_000,
        Lucky7s: 50_000_000,
        HotShot: 50_000_000,
        MegaGold: 100_000_000,
      }
      const cost = costs[cardType] || 0
      const diff = balanceAfter - balanceBefore + cost
      const prize = diff > 0 ? diff / LAMPORTS_PER_SOL : 0

      setLastPrize(prize)
      setTxStatus('success')

      await Promise.all([
        fetchTreasury(),
        fetchProfile(),
        fetchBalance(),
      ])

      return prize
    } catch (err: any) {
      setTxStatus('error')
      const msg = err?.message || 'Transaction failed'
      setLastError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getProgram, wallet.publicKey, wallet.signTransaction, treasuryPda, getProfilePda, connection, fetchTreasury, fetchProfile, fetchBalance])

  // ── Update profile (name/pfp) ──
  const updateProfile = useCallback(async (name: string | null, pfpUrl: string | null) => {
    const program = getProgram()
    if (!program || !wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected')
    }

    setLoading(true)
    try {
      const profilePda = getProfilePda(wallet.publicKey)

      const tx = await (program.methods as any)
        .updateProfile(name, pfpUrl)
        .accounts({
          profile: profilePda,
          player: wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .transaction()

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash
      tx.feePayer = wallet.publicKey

      const signedTx = await wallet.signTransaction(tx)

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed')

      await fetchProfile()
    } finally {
      setLoading(false)
    }
  }, [getProgram, wallet.publicKey, wallet.signTransaction, getProfilePda, connection, fetchProfile])

  // ── Register referral ──
  const registerReferral = useCallback(async (referrerAddress: string) => {
    const program = getProgram()
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected')

    setLoading(true)
    try {
      const referrer = new PublicKey(referrerAddress)
      const refereeProfilePda = getProfilePda(wallet.publicKey)
      const referrerProfilePda = getProfilePda(referrer)

      await (program.methods as any)
        .registerReferral()
        .accounts({
          refereeProfile: refereeProfilePda,
          referrerProfile: referrerProfilePda,
          referrer,
          referee: wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      await fetchProfile()
    } finally {
      setLoading(false)
    }
  }, [getProgram, wallet.publicKey, getProfilePda, fetchProfile])

  // ── Mint bonus NFT ──
  const mintBonusNft = useCallback(async (tier: string) => {
    const program = getProgram()
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected')

    setLoading(true)
    try {
      const profilePda = getProfilePda(wallet.publicKey)
      const nftPda = getNftPda(wallet.publicKey)
      const tierArg = { [tier.toLowerCase()]: {} }

      await (program.methods as any)
        .mintBonusNft(tierArg)
        .accounts({
          treasury: treasuryPda,
          bonusNft: nftPda,
          profile: profilePda,
          player: wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      await Promise.all([fetchProfile(), fetchBalance()])
    } finally {
      setLoading(false)
    }
  }, [getProgram, wallet.publicKey, getProfilePda, getNftPda, treasuryPda, fetchProfile, fetchBalance])

  // ── Auto-fetch on wallet connect ──
  useEffect(() => {
    if (wallet.publicKey) {
      fetchTreasury()
      fetchProfile()
      fetchBalance()
    }
  }, [wallet.publicKey])

  return {
    treasury,
    profile,
    solBalance,
    loading,
    txStatus,
    lastPrize,
    lastError,
    treasuryPda,
    buyAndScratch,
    updateProfile,
    registerReferral,
    mintBonusNft,
    fetchTreasury,
    fetchProfile,
    fetchBalance,
    setTxStatus,
    setLastPrize,
  }
}