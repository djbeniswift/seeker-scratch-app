import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js'
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

  // Read-only provider for building instructions — no wallet attached.
  // This prevents Anchor from injecting the provider wallet (the MWA session key,
  // which differs from wallet.publicKey) as a required signer into instruction
  // account metas, which causes "Missing signature for public key <MWA key>" errors.
  const getReadOnlyProgram = useCallback(() => {
    const readProvider = new AnchorProvider(connection, {
      publicKey: PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    } as any, { commitment: 'confirmed' })
    return new Program(IDL as any, PROGRAM_ID, readProvider)
  }, [connection])

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
      let paused = false
      try {
        const readProvider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' })
        const readProgram = new Program(IDL as any, PROGRAM_ID, readProvider)
        const data = await (readProgram.account as any).treasury.fetch(treasuryPda)
        totalCardsSold = data.totalCardsSold.toNumber()
        paused = data.paused
      } catch {}
      setTreasury({
        balance: lamports / LAMPORTS_PER_SOL,
        totalCardsSold,
        totalWins: Math.floor(totalCardsSold * 0.18),
        paused,
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

  const creditReferrer = useCallback(async () => {
    const program = getProgram()
    if (!program || !wallet.publicKey) { console.log('creditReferrer: no program/wallet'); return }
    const profilePda = getProfilePda(wallet.publicKey)
    let profileData: any
    try {
      profileData = await (program.account as any).playerProfile.fetch(profilePda)
    } catch (e: any) { console.log('creditReferrer: profile not found', e.message); return }
    console.log('creditReferrer check:', {
      hasBeenReferred: profileData.hasBeenReferred,
      referralBonusPaid: profileData.referralBonusPaid,
      totalSpentLamports: profileData.totalSpent.toNumber(),
      referredBy: profileData.referredBy?.toBase58(),
    })
    if (!profileData.hasBeenReferred) { console.log('creditReferrer: not referred'); return }
    if (profileData.totalSpent.toNumber() < 100_000_000) { console.log('creditReferrer: totalSpent too low', profileData.totalSpent.toNumber()); return }
    // Note: do NOT gate on referralBonusPaid — buyAndScratch sets it to true on-chain
    // before JS runs, so we'd always skip. Let the on-chain instruction handle idempotency.
    const referrerKey = profileData.referredBy
    const referrerProfile = getProfilePda(referrerKey)
    console.log('creditReferrer: calling on-chain instruction, referrer:', referrerKey?.toBase58())
    try {
      await (program.methods as any).creditReferrer().accounts({
        referrerProfile,
        referrerKey,
        callerProfile: profilePda,
        caller: wallet.publicKey,
      }).rpc({ commitment: 'confirmed' })
      await fetchProfile()
      console.log('✅ Referrer credited!')
    } catch (e: any) {
      console.log('creditReferrer tx failed:', e.message)
    }
  }, [getProgram, wallet.publicKey, getProfilePda, fetchProfile])

  // Auto-fetch when wallet connects or changes
  useEffect(() => {
    fetchTreasury()
    if (wallet.publicKey) {
      fetchProfile()
    }
  }, [wallet.publicKey])

  const buyCard = useCallback(async (cardType: string, pendingReferrer?: string) => {
    const program = getProgram()
    // Capture publicKey into a local variable immediately — MWA sessions can drift
    // and wallet.publicKey accessed later may differ from the account that signs
    const publicKey = wallet.publicKey
    if (!program || !publicKey) throw new Error('Wallet not connected')

    setLoading(true)
    try {
      console.log('🎰 buyCard started for:', cardType, 'feePayer:', publicKey.toBase58())
      const profilePda = getProfilePda(publicKey)
      console.log('Profile PDA:', profilePda.toBase58())

      // Get referrer profile PDA — fall back to admin's profile (always a valid PlayerProfile) if no referrer
      const ADMIN_PUBKEY = new PublicKey('6RhLQikkjzace4ti4D458iSmKofbPdMGNB7VKHmWwYPP')
      let referrerProfilePda: PublicKey = getProfilePda(ADMIN_PUBKEY)
      let shouldRegisterReferral = false
      try {
        const profileData = await (program.account as any).playerProfile.fetch(profilePda)
        if (profileData.hasBeenReferred) {
          referrerProfilePda = getProfilePda(profileData.referredBy)
        } else if (pendingReferrer) {
          // Profile exists but not yet referred — will register in this tx
          const referrerKey = new PublicKey(pendingReferrer)
          referrerProfilePda = getProfilePda(referrerKey)
          shouldRegisterReferral = true
        }
      } catch {
        // Profile doesn't exist yet — if a referrer was passed, register in this tx
        if (pendingReferrer) {
          const referrerKey = new PublicKey(pendingReferrer)
          referrerProfilePda = getProfilePda(referrerKey)
          shouldRegisterReferral = true
        }
      }

      const cardTypeArg = {
        QuickPick: { quickPick: {} },
        HotShot: { hotShot: {} },
        MegaGold: { megaGold: {} },
      }[cardType]
      console.log('Card type arg:', cardTypeArg)

      const instructions = []

      // Bundle referral registration as first instruction if needed — one signature, no second prompt
      if (shouldRegisterReferral && pendingReferrer) {
        const referrerKey = new PublicKey(pendingReferrer)
        const registerIx = await (getReadOnlyProgram().methods as any).registerReferral().accounts({
          refereeProfile: profilePda,
          referee: publicKey,
          referrer: referrerKey,
          systemProgram: SystemProgram.programId,
        }).instruction()
        instructions.push(registerIx)
        console.log('Bundled registerReferral instruction for referrer:', pendingReferrer)
      }

      // Build buyAndScratch instruction
      const ix = await (getReadOnlyProgram().methods as any).buyAndScratch(cardTypeArg).accounts({
        treasury: treasuryPda,
        profile: profilePda,
        referrerProfile: referrerProfilePda,
        houseWallet: new PublicKey("DBH2VpbjWLdrJnau4RjdpYBTcLy9pMGa1qQr4U9dDgER"),
        player: publicKey,
        systemProgram: SystemProgram.programId,
      }).instruction()
      instructions.push(ix)
      console.log('Instructions built:', instructions.length)

      // Build transaction object first with the captured publicKey as feePayer.
      // Then fetch blockhash as the LAST async step and set it immediately before
      // signing — minimises the window between blockhash issue and MWA prompt.
      const tx = new Transaction()
      tx.add(...instructions)
      tx.feePayer = publicKey   // explicit local var — avoids MWA session drift

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash  // set immediately before signing
      console.log('Transaction compiled — feePayer:', publicKey.toBase58(), 'blockhash:', blockhash)

      // === DETAILED MWA DIAGNOSTICS ===
      console.log('=== WALLET DIAGNOSTICS ===')
      console.log('wallet.publicKey:', publicKey.toBase58())
      console.log('wallet.signTransaction:', typeof wallet.signTransaction)
      console.log('wallet.signAllTransactions:', typeof wallet.signAllTransactions)
      console.log('wallet.sendTransaction:', typeof wallet.sendTransaction)
      console.log('wallet.wallet?.adapter?.name:', (wallet as any).wallet?.adapter?.name)
      console.log('tx.feePayer:', tx.feePayer?.toBase58())
      console.log('tx.signatures before sign:', tx.signatures.map(s => ({ pubkey: s.publicKey.toBase58(), sig: s.signature?.toString('hex') ?? 'null' })))

      // CRITICAL MWA FIX: The v2.x @solana-mobile/wallet-adapter-mobile calls
      // tx.serialize() internally with DEFAULT options (requireAllSignatures: true)
      // before sending to the wallet app. This fails on unsigned transactions.
      // Patch tx.serialize to force requireAllSignatures: false so the adapter
      // can package the tx without needing it pre-signed.
      const origSerialize = (tx as any).serialize.bind(tx)
      ;(tx as any).serialize = (config?: any) =>
        origSerialize({ requireAllSignatures: false, verifySignatures: false, ...config })

      let sig: string
      try {
        if (wallet.signTransaction) {
          console.log('Attempting signTransaction (serialize-patched)...')
          const signedTx = await wallet.signTransaction(tx)
          console.log('signedTx.signatures:', signedTx.signatures.map((s: any) => ({ pubkey: s.publicKey.toBase58(), sig: s.signature?.toString('hex') ?? 'null' })))
          const serialized = origSerialize({ requireAllSignatures: false, verifySignatures: false })
          console.log('Serialized tx length:', serialized.length)
          sig = await connection.sendRawTransaction(serialized, { skipPreflight: true, maxRetries: 3 })
        } else {
          console.log('Using sendTransaction fallback')
          sig = await wallet.sendTransaction(tx, connection, { skipPreflight: true, maxRetries: 3 })
        }
      } catch (signErr: any) {
        console.error('=== SIGN ERROR DETAILS ===')
        console.error('signErr.name:', signErr?.name)
        console.error('signErr.message:', signErr?.message)
        console.error('signErr.error:', JSON.stringify(signErr?.error, null, 2))
        console.error('signErr.cause:', signErr?.cause)
        console.error('Full error:', JSON.stringify(signErr, Object.getOwnPropertyNames(signErr), 2))
        throw signErr
      }
      console.log('Transaction sent, signature:', sig)

      const confirmed = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
      console.log('Transaction confirmed:', confirmed)

      await fetchTreasury()
      await fetchProfile()

      // Treasury health check — auto-pause + email alert if balance drops below 6 SOL
      const postBuyLamports = await connection.getBalance(treasuryPda)
      const postBuyBalanceSol = postBuyLamports / LAMPORTS_PER_SOL
      if (postBuyBalanceSol < 6) {
        // Fire-and-forget email alert
        fetch('/api/treasury-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balance: postBuyBalanceSol.toFixed(3) }),
        }).catch(() => {})

        // Auto-pause if the admin wallet is the one buying
        const ADMIN_KEY = '6RhLQikkjzace4ti4D458iSmKofbPdMGNB7VKHmWwYPP'
        if (publicKey.toBase58() === ADMIN_KEY) {
          try {
            await (program.methods as any).setPaused(true).accounts({
              treasury: treasuryPda,
              admin: publicKey,
            }).rpc()
            console.log('⏸ Treasury low — game auto-paused')
          } catch (e) {
            console.error('Auto-pause failed:', e)
          }
        }
      }

      console.log('✅ buyCard completed successfully')

    } catch (err) {
      console.error('❌ buyCard error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getProgram, getReadOnlyProgram, wallet.publicKey, treasuryPda, getProfilePda, fetchTreasury, fetchProfile, creditReferrer])

  return { treasury, profile, loading, fetchTreasury, fetchProfile, buyCard, registerReferral, creditReferrer, getProgram }
}
