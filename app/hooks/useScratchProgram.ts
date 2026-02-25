import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js'
import { useCallback, useState } from 'react'
import { PROGRAM_ID, TREASURY_SEED, PROFILE_SEED, IDL } from '../lib/constants'

export function useScratchProgram() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [treasury, setTreasury] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Read-only provider for fetching accounts (no signing needed)
  const getReadonlyProgram = useCallback(() => {
    const dummyWallet = {
      publicKey: wallet.publicKey || PublicKey.default,
      signTransaction: async (tx: Transaction) => tx,
      signAllTransactions: async (txs: Transaction[]) => txs,
    }
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: 'confirmed' })
    return new Program(IDL as any, PROGRAM_ID, provider)
  }, [connection, wallet.publicKey])

  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)

  const fetchTreasury = useCallback(async () => {
    const program = getReadonlyProgram()
    try {
      const data = await (program.account as any).treasury.fetch(treasuryPda)
      setTreasury({
        balance: data.balance.toNumber() / LAMPORTS_PER_SOL,
        totalCardsSold: data.totalCardsSold.toNumber(),
      })
    } catch (err) {
      console.error('Failed to fetch treasury:', err)
    }
  }, [getReadonlyProgram, treasuryPda])

  const fetchProfile = useCallback(async () => {
    if (!wallet.publicKey) return
    const program = getReadonlyProgram()
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
  }, [wallet.publicKey, getReadonlyProgram])

  const buyCard = useCallback(async (cardType: string) => {
    if (!wallet.publicKey) throw new Error('Wallet not connected')
    if (!wallet.signTransaction) throw new Error('Wallet does not support signing')

    setLoading(true)
    try {
      const program = getReadonlyProgram()

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

      // Build transaction using readonly program (no provider signing)
      const ix = await (program.methods as any).buyAndScratch(cardTypeArg).accounts({
        treasury: treasuryPda,
        profile: profilePda,
        player: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      }).instruction()

      const tx = new Transaction()
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = wallet.publicKey
      tx.add(ix)

      // Sign via MWA / wallet adapter
      const signed = await wallet.signTransaction(tx)
      const sig = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')

      await fetchTreasury()
      await fetchProfile()
    } finally {
      setLoading(false)
    }
  }, [getReadonlyProgram, wallet, connection, treasuryPda, fetchTreasury, fetchProfile])

  return { treasury, profile, loading, fetchTreasury, fetchProfile, buyCard, getProgram: getReadonlyProgram }
}
