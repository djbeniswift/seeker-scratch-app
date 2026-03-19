import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { useCallback, useState, useEffect } from 'react'

// Pure-JS base64 → base58 conversion for MWA signatures (no external dep needed)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base64ToBase58(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  let num = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''))
  let result = ''
  const base = BigInt(58)
  const zero = BigInt(0)
  while (num > zero) { result = BASE58_ALPHABET[Number(num % base)] + result; num /= base }
  for (const b of bytes) { if (b !== 0) break; result = '1' + result }
  return result
}
import { PROGRAM_ID, TREASURY_SEED, PROFILE_SEED, GAME_CONFIG_SEED, IDL } from '../lib/constants'

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
  const [gameConfigPda] = PublicKey.findProgramAddressSync([GAME_CONFIG_SEED], PROGRAM_ID)

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
      let shouldCreditReferrer = false
      let creditReferrerKey: PublicKey | null = null
      try {
        const profileData = await (program.account as any).playerProfile.fetch(profilePda)
        if (profileData.hasBeenReferred) {
          const candidatePda = getProfilePda(profileData.referredBy)
          // Verify the referrer's PlayerProfile actually exists on-chain.
          // If it doesn't, buyAndScratch will fail (can't mutate an uninitialised account).
          // Fall back to admin profile in that case.
          try {
            await (program.account as any).playerProfile.fetch(candidatePda)
            referrerProfilePda = candidatePda
            console.log('Referrer profile found:', profileData.referredBy.toBase58())
          } catch {
            console.log('Referrer profile NOT found on-chain — falling back to admin profile')
            // referrerProfilePda stays as admin profile (default set above)
          }
          if (!profileData.referralBonusPaid) {
            shouldCreditReferrer = true
            creditReferrerKey = profileData.referredBy
          }
        } else if (pendingReferrer && pendingReferrer !== publicKey.toBase58()) {
          // Profile exists but not yet referred — will register in this tx (skip self-referral)
          const referrerKey = new PublicKey(pendingReferrer)
          referrerProfilePda = getProfilePda(referrerKey)
          shouldRegisterReferral = true
          shouldCreditReferrer = true
          creditReferrerKey = referrerKey
        }
      } catch {
        // Profile doesn't exist yet — if a referrer was passed, register in this tx
        if (pendingReferrer && pendingReferrer !== publicKey.toBase58()) {
          const referrerKey = new PublicKey(pendingReferrer)
          referrerProfilePda = getProfilePda(referrerKey)
          shouldRegisterReferral = true
          shouldCreditReferrer = true
          creditReferrerKey = referrerKey
        }
      }

      const cardTypeArg = {
        QuickPick: { quickPick: {} },
        HotShot: { hotShot: {} },
        MegaGold: { megaGold: {} },
      }[cardType]
      console.log('Card type arg:', cardTypeArg)

      const instructions = []

      // 1. Bundle referral registration as first instruction if needed — one signature, no second prompt
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

      // 2. Build buyAndScratch instruction
      const ix = await (getReadOnlyProgram().methods as any).buyAndScratch(cardTypeArg).accounts({
        treasury: treasuryPda,
        profile: profilePda,
        referrerProfile: referrerProfilePda,
        gameConfig: gameConfigPda,
        houseWallet: new PublicKey("DBH2VpbjWLdrJnau4RjdpYBTcLy9pMGa1qQr4U9dDgER"),
        player: publicKey,
        systemProgram: SystemProgram.programId,
      }).instruction()
      instructions.push(ix)
      console.log('Instructions built:', instructions.length)

      // Fetch blockhash last before signing — minimises blockhash staleness window
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

      const isMobile = typeof window !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)
      const isMWA = (wallet as any).wallet?.adapter?.name === 'Mobile Wallet Adapter'

      console.log('=== WALLET DIAGNOSTICS ===')
      console.log('wallet.publicKey:', publicKey.toBase58())
      console.log('adapterName:', (wallet as any).wallet?.adapter?.name, 'isMWA:', isMWA, 'isMobile:', isMobile)
      console.log('blockhash:', blockhash)

      let sig: string
      if (isMWA) {
        console.log('MWA path: signTransaction')
        const tx = new Transaction()
        tx.add(...instructions)
        tx.feePayer = publicKey
        tx.recentBlockhash = blockhash
        const origSerialize = (tx as any).serialize.bind(tx)
        ;(tx as any).serialize = (config?: any) =>
          origSerialize({ requireAllSignatures: false, verifySignatures: false, ...config })

        // Add feePayer signature slot manually — MWA requires it present before signing
        if (!tx.signatures.find(s => s.publicKey.equals(publicKey))) {
          tx.signatures.unshift({ publicKey, signature: null })
        }

        const signedTx = await wallet.signTransaction!(tx)
        console.log('MWA signedTx signatures:', signedTx.signatures.map(s => ({
          pubkey: s.publicKey.toBase58(),
          sig: s.signature ? 'present' : 'null'
        })))

        const serialized = signedTx.serialize({ requireAllSignatures: false, verifySignatures: false })
        sig = await connection.sendRawTransaction(serialized, { skipPreflight: true, maxRetries: 5 })
      } else {
        // All other wallets (Phantom, Backpack, Solflare in-browser):
        // VersionedTransaction — this is what worked at the last confirmed working
        // state (commit 743603c). Legacy Transaction causes -32603 in Phantom.
        const message = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message()
        const vtx = new VersionedTransaction(message)

        // Run simulation via Helius first — surfaces real program errors
        // before the wallet rejects with a generic -32603.
        // sigVerify: false because the tx is unsigned at this point.
        console.log('--- Pre-flight simulation ---')
        const simResult = await connection.simulateTransaction(vtx, {
          commitment: 'confirmed',
          sigVerify: false,
          replaceRecentBlockhash: true,
        } as any)
        console.log('Sim err:', JSON.stringify(simResult.value.err))
        console.log('Sim logs:', simResult.value.logs?.join(' | '))
        if (simResult.value.err) {
          const logs = simResult.value.logs?.slice(-6).join('\n') ?? ''
          throw new Error(`Simulation failed:\n${JSON.stringify(simResult.value.err)}\n${logs}`)
        }
        console.log('Simulation passed — submitting')

        // Sign via wallet then submit through Helius directly.
        // Avoids Phantom's signAndSendTransaction which routes via Phantom's own
        // RPC and ignores our skipPreflight — causing -32603 for specific accounts.
        console.log('Standard path: signTransaction → sendRawTransaction via Helius')
        if (!wallet.signTransaction) {
          // Fallback for wallets that don't expose signTransaction separately
          sig = await wallet.sendTransaction(vtx as any, connection, { skipPreflight: true, maxRetries: 5 })
        } else {
          const signedVtx = await wallet.signTransaction(vtx as any)
          sig = await connection.sendRawTransaction((signedVtx as any).serialize(), { skipPreflight: true, maxRetries: 5 })
        }
      }
      console.log('Transaction sent, signature:', sig)

      const confirmed = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
      console.log('Transaction confirmed:', confirmed)

      await fetchTreasury()
      await fetchProfile()

      // Note: creditReferrer is NOT called here — buyAndScratch already credits
      // the referrer on-chain via referrerProfile: isMut. Calling it again would
      // trigger a second wallet signing prompt and fail (referralBonusPaid is true).

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
