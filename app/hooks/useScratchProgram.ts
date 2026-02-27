import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js'
import { useCallback, useState, useEffect } from 'react'
import { PROGRAM_ID, TREASURY_SEED, PROFILE_SEED, IDL } from '../lib/constants'

export function useScratchProgram() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [treasury, setTreasury] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const getProvider = useCallback(() => {
    if (!wallet.publicKey) return null
    // MWA wallets may not have signTransaction but have signAllTransactions
    const walletAdapter = {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction || (async (tx: any) => {
        const signed = await wallet.signAllTransactions?.([tx])
        return signed?.[0] ?? tx
      }),
      signAllTransactions: wallet.signAllTransactions || (async (txs: any[]) => txs),
    }
    return new AnchorProvider(connection, walletAdapter as any, { commitment: 'confirmed' })
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
    try {
      const lamports = await connection.getBalance(treasuryPda)
      // Use read-only provider that doesn't need wallet
      let totalCardsSold = 0
      try {
        const readProvider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' })
        const readProgram = new Program(IDL as any, PROGRAM_ID, readProvider)
        const data = await (readProgram.account as any).treasury.fetch(treasuryPda)
        totalCardsSold = data.totalCardsSold.toNumber()
      } catch {}
      setTreasury({
        balance: lamports / LAMPORTS_PER_SOL,
        totalCardsSold,
        totalWins: Math.floor(totalCardsSold * 0.18),
      })
    } catch (err) {
      console.error('Failed to fetch treasury:', err)
    }
  }, [getProgram, treasuryPda, connection])

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

  // Auto-fetch when wallet connects or changes
  useEffect(() => {
    fetchTreasury()
    if (wallet.publicKey) {
      fetchProfile()
    }
  }, [wallet.publicKey])

  const buyCard = useCallback(async (cardType: string) => {
    const program = getProgram()
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected')

    setLoading(true)
    try {
      console.log('🎰 buyCard started for:', cardType)
      const profilePda = getProfilePda(wallet.publicKey)
      console.log('Profile PDA:', profilePda.toBase58())

      // Get referrer profile PDA — fall back to treasury PDA (always initialized) if no referrer
      let referrerProfilePda: PublicKey = treasuryPda
      try {
        const profileData = await (program.account as any).playerProfile.fetch(profilePda)
        if (profileData.hasBeenReferred) {
          referrerProfilePda = getProfilePda(profileData.referredBy)
        }
      } catch {
        // Profile doesn't exist yet - no referrer
      }

      const cardTypeArg = {
        QuickPick: { quickPick: {} },
        Lucky7s: { lucky7s: {} },
        HotShot: { hotShot: {} },
        MegaGold: { megaGold: {} },
      }[cardType]
      console.log('Card type arg:', cardTypeArg)

      // Build instruction manually to avoid any simulation
      const ix = await (program.methods as any).buyAndScratch(cardTypeArg).accounts({
        treasury: treasuryPda,
        profile: profilePda,
        referrerProfile: referrerProfilePda,
        houseWallet: new PublicKey("DBH2VpbjWLdrJnau4RjdpYBTcLy9pMGa1qQr4U9dDgER"),
        player: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      }).instruction()
      console.log('Instruction built')

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      console.log('Got blockhash:', blockhash)
      
      const message = new TransactionMessage({
        payerKey: wallet.publicKey!,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message()

      const vtx = new VersionedTransaction(message)
      console.log('Transaction compiled')
      
      const signed = await wallet.signTransaction!(vtx as any)
      console.log('Transaction signed')
      
      const sig = await connection.sendRawTransaction((signed as any).serialize(), { skipPreflight: true, maxRetries: 3 })
      console.log('Transaction sent, signature:', sig)
      
      const confirmed = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
      console.log('Transaction confirmed:', confirmed)

      await fetchTreasury()
      await fetchProfile()
      console.log('✅ buyCard completed successfully')

      // Note: creditReferrer is handled separately to avoid double-signing

    } catch (err) {
      console.error('❌ buyCard error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getProgram, wallet.publicKey, treasuryPda, getProfilePda, fetchTreasury, fetchProfile])

  return { treasury, profile, loading, fetchTreasury, fetchProfile, buyCard, registerReferral, getProgram }
}
