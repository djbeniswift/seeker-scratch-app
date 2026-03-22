import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, BorshAccountsCoder } from '@coral-xyz/anchor'
import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
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
import { PROGRAM_ID, TREASURY_SEED, PROFILE_SEED, GAME_CONFIG_SEED, MASTER_CONFIG_SEED, IDL, FALLBACK_RPC_URL } from '../lib/constants'

// Fallback connection used when primary (Helius) is rate-limited
const fallbackConnection = new Connection(FALLBACK_RPC_URL, 'confirmed')

function isRateLimitError(err: any): boolean {
  return err?.message?.includes('429') ||
    err?.message?.includes('rate limit') ||
    err?.message?.includes('-32429') ||
    err?.code === -32429
}

// On rate-limit: immediately switch to fallback RPC, no delay.
// If fallback also fails, error propagates to the caller.
async function withRateLimitRetry<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary()
  } catch (err: any) {
    if (!isRateLimitError(err)) throw err
    return fallback()
  }
}

// Retry blockhash fetch — switches to fallback RPC on rate-limit, exponential
// backoff on other transient errors.
async function getBlockhashWithRetry(connection: any, commitment: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const conn = attempt >= 2 ? fallbackConnection : connection
      return await conn.getLatestBlockhash(commitment)
    } catch (err: any) {
      if (attempt === 3) throw err
      if (isRateLimitError(err) && attempt < 2) continue // next iteration uses fallback
      await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)))
    }
  }
  throw new Error('getLatestBlockhash failed after retries')
}

export function useScratchProgram() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [treasury, setTreasury] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [masterConfig, setMasterConfig] = useState<any>(null)
  const [walletBalance, setWalletBalance] = useState<number>(0)
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
  const [masterConfigPda] = PublicKey.findProgramAddressSync([MASTER_CONFIG_SEED], PROGRAM_ID)

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

  const fetchMasterConfig = useCallback(async () => {
    try {
      const readProvider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' })
      const readProgram = new Program(IDL as any, PROGRAM_ID, readProvider)
      const data = await (readProgram.account as any).masterConfig.fetch(masterConfigPda)
      setMasterConfig({
        costQuickpick: data.costQuickpick.toNumber() / LAMPORTS_PER_SOL,
        costHotshot: data.costHotshot.toNumber() / LAMPORTS_PER_SOL,
        costMegagold: data.costMegagold.toNumber() / LAMPORTS_PER_SOL,
        thresholdQuickpick: data.thresholdQuickpick,
        thresholdHotshot: data.thresholdHotshot,
        thresholdMegagold: data.thresholdMegagold,
        houseFeeBps: data.houseFeeBps.toNumber(),
        minTreasury: data.minTreasury.toNumber() / LAMPORTS_PER_SOL,
        dailyPayoutCap: data.dailyPayoutCap.toNumber() / LAMPORTS_PER_SOL,
        prize1stSol: data.prize1stSol.toNumber() / LAMPORTS_PER_SOL,
        prize2ndSol: data.prize2ndSol.toNumber() / LAMPORTS_PER_SOL,
        prize3rdSol: data.prize3rdSol.toNumber() / LAMPORTS_PER_SOL,
        prize1stSkr: data.prize1stSkr.toNumber(),
        prize2ndSkr: data.prize2ndSkr.toNumber(),
        prize3rdSkr: data.prize3rdSkr.toNumber(),
        sweep1stSkr: data.sweep1stSkr.toNumber(),
        sweep2ndSkr: data.sweep2ndSkr.toNumber(),
        sweep3rdSkr: data.sweep3rdSkr.toNumber(),
        freePlayCooldownSeconds: data.freePlayCooldownSeconds.toNumber(),
        quickpickEnabled: data.quickpickEnabled,
        hotshotEnabled: data.hotshotEnabled,
        megagoldEnabled: data.megagoldEnabled,
        doublePointsActive: data.doublePointsActive,
        bannerText: data.bannerText,
        bannerActive: data.bannerActive,
      })
    } catch {
      setMasterConfig(null) // not yet initialized
    }
  }, [connection, masterConfigPda])

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
        lastFreePlayTimestamp: data.lastFreePlayTimestamp?.toNumber() ?? 0,
        sweepPointsThisMonth: data.sweepPointsThisMonth?.toNumber() ?? 0,
        sweepPointsAllTime: data.sweepPointsAllTime?.toNumber() ?? 0,
        freePlaysUsed: data.freePlaysUsed ?? 0,
        freePlayWins: data.freePlayWins ?? 0,
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

  // Single batched fetch — replaces 4+ separate RPC calls with one getMultipleAccountsInfo
  const fetchAll = useCallback(async () => {
    try {
      const coder = new BorshAccountsCoder(IDL as any)
      const pks: PublicKey[] = [treasuryPda, masterConfigPda]
      const profilePk = wallet.publicKey ? getProfilePda(wallet.publicKey) : null
      if (profilePk) pks.push(profilePk)
      if (wallet.publicKey) pks.push(wallet.publicKey)

      const infos = await withRateLimitRetry(
        () => connection.getMultipleAccountsInfo(pks, 'confirmed'),
        () => fallbackConnection.getMultipleAccountsInfo(pks, 'confirmed')
      )

      // Treasury
      const tInfo = infos[0]
      if (tInfo) {
        try {
          const t = coder.decode('Treasury', tInfo.data)
          setTreasury({
            balance: tInfo.lamports / LAMPORTS_PER_SOL,
            totalCardsSold: t.totalCardsSold.toNumber(),
            totalWins: Math.floor(t.totalCardsSold.toNumber() * 0.18),
            paused: t.paused,
          })
        } catch {}
      }

      // MasterConfig
      const mcInfo = infos[1]
      if (mcInfo && mcInfo.data.length >= 8) {
        try {
          const mc = coder.decode('MasterConfig', mcInfo.data)
          setMasterConfig({
            costQuickpick: mc.costQuickpick.toNumber() / LAMPORTS_PER_SOL,
            costHotshot: mc.costHotshot.toNumber() / LAMPORTS_PER_SOL,
            costMegagold: mc.costMegagold.toNumber() / LAMPORTS_PER_SOL,
            thresholdQuickpick: mc.thresholdQuickpick,
            thresholdHotshot: mc.thresholdHotshot,
            thresholdMegagold: mc.thresholdMegagold,
            houseFeeBps: mc.houseFeeBps.toNumber(),
            minTreasury: mc.minTreasury.toNumber() / LAMPORTS_PER_SOL,
            dailyPayoutCap: mc.dailyPayoutCap.toNumber() / LAMPORTS_PER_SOL,
            prize1stSol: mc.prize1stSol.toNumber() / LAMPORTS_PER_SOL,
            prize2ndSol: mc.prize2ndSol.toNumber() / LAMPORTS_PER_SOL,
            prize3rdSol: mc.prize3rdSol.toNumber() / LAMPORTS_PER_SOL,
            prize1stSkr: mc.prize1stSkr.toNumber(),
            prize2ndSkr: mc.prize2ndSkr.toNumber(),
            prize3rdSkr: mc.prize3rdSkr.toNumber(),
            sweep1stSkr: mc.sweep1stSkr.toNumber(),
            sweep2ndSkr: mc.sweep2ndSkr.toNumber(),
            sweep3rdSkr: mc.sweep3rdSkr.toNumber(),
            freePlayCooldownSeconds: mc.freePlayCooldownSeconds.toNumber(),
            quickpickEnabled: mc.quickpickEnabled,
            hotshotEnabled: mc.hotshotEnabled,
            megagoldEnabled: mc.megagoldEnabled,
            doublePointsActive: mc.doublePointsActive,
            bannerText: mc.bannerText,
            bannerActive: mc.bannerActive,
          })
        } catch { setMasterConfig(null) }
      } else {
        setMasterConfig(null)
      }

      // Profile + wallet balance
      if (profilePk) {
        const pInfo = infos[2]
        if (pInfo) {
          try {
            const p = coder.decode('PlayerProfile', pInfo.data)
            setProfile({
              pointsThisMonth: p.pointsThisMonth.toNumber(),
              pointsAllTime: p.pointsAllTime.toNumber(),
              cardsScratched: p.cardsScratched,
              totalSpent: p.totalSpent.toNumber() / LAMPORTS_PER_SOL,
              totalWon: p.totalWon.toNumber() / LAMPORTS_PER_SOL,
              wins: p.wins,
              hasBeenReferred: p.hasBeenReferred,
              referredBy: p.referredBy?.toBase58(),
              referralBonusPaid: p.referralBonusPaid,
              referralsCount: p.referralsCount,
              lastFreePlayTimestamp: p.lastFreePlayTimestamp?.toNumber() ?? 0,
              sweepPointsThisMonth: p.sweepPointsThisMonth?.toNumber() ?? 0,
              sweepPointsAllTime: p.sweepPointsAllTime?.toNumber() ?? 0,
              freePlaysUsed: p.freePlaysUsed ?? 0,
              freePlayWins: p.freePlayWins ?? 0,
            })
          } catch { setProfile(null) }
        } else {
          setProfile(null)
        }
        const wInfo = infos[3]
        if (wInfo) setWalletBalance(wInfo.lamports / LAMPORTS_PER_SOL)
      }
    } catch (err) {
      console.error('fetchAll failed, falling back to individual fetches:', err)
      fetchTreasury()
      fetchMasterConfig()
      if (wallet.publicKey) fetchProfile()
    }
  }, [connection, wallet.publicKey, treasuryPda, masterConfigPda, getProfilePda, fetchTreasury, fetchMasterConfig, fetchProfile])

  // Auto-fetch when wallet connects or changes
  useEffect(() => {
    fetchAll()
  }, [wallet.publicKey])

  const freeScratch = useCallback(async (): Promise<{ won: boolean; sweepPoints: number }> => {
    const program = getProgram()
    const publicKey = wallet.publicKey
    if (!program || !publicKey) throw new Error('Wallet not connected')

    const profilePda = getProfilePda(publicKey)

    // Read sweep points before tx to compute diff after
    let sweepBefore = 0
    try {
      const before = await (program.account as any).playerProfile.fetch(profilePda)
      sweepBefore = before.sweepPointsThisMonth?.toNumber() ?? 0
    } catch {}

    const ix = await (getReadOnlyProgram().methods as any).freeScratch().accounts({
      treasury: treasuryPda,
      profile: profilePda,
      masterConfig: masterConfigPda,
      player: publicKey,
      systemProgram: SystemProgram.programId,
    }).instruction()

    const { blockhash, lastValidBlockHeight } = await getBlockhashWithRetry(connection, 'confirmed')
    const isMWA = (wallet as any).wallet?.adapter?.name === 'Mobile Wallet Adapter'

    let sig: string
    if (isMWA) {
      const tx = new Transaction()
      tx.add(ix)
      tx.feePayer = publicKey
      tx.recentBlockhash = blockhash
      const origSerialize = (tx as any).serialize.bind(tx)
      ;(tx as any).serialize = (config?: any) =>
        origSerialize({ requireAllSignatures: false, verifySignatures: false, ...config })
      if (!tx.signatures.find(s => s.publicKey.equals(publicKey))) {
        tx.signatures.unshift({ publicKey, signature: null })
      }
      const signedTx = await wallet.signTransaction!(tx)
      const serialized = signedTx.serialize({ requireAllSignatures: false, verifySignatures: false })
      sig = await connection.sendRawTransaction(serialized, { skipPreflight: true, maxRetries: 5 })
    } else {
      const message = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message()
      const vtx = new VersionedTransaction(message)
      if (!wallet.signTransaction) {
        sig = await wallet.sendTransaction(vtx as any, connection, { skipPreflight: true })
      } else {
        const signedVtx = await wallet.signTransaction(vtx as any)
        sig = await connection.sendRawTransaction((signedVtx as any).serialize(), { skipPreflight: true })
      }
    }

    // Poll for confirmation — avoids TransactionExpiredBlockheightExceededError
    let freeConfirmed = false
    const freeDeadline = Date.now() + 15_000
    while (Date.now() < freeDeadline) {
      await new Promise(r => setTimeout(r, 2000))
      const statuses = await connection.getSignatureStatuses([sig])
      const status = statuses?.value?.[0]
      if (status) {
        if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`)
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          freeConfirmed = true
          break
        }
      }
    }
    if (!freeConfirmed) {
      throw new Error('Transaction timed out — please try again.')
    }

    // Wait for RPC to settle then read new sweep points
    await new Promise(r => setTimeout(r, 800))
    let sweepAfter = sweepBefore
    try {
      const after = await (program.account as any).playerProfile.fetch(profilePda)
      sweepAfter = after.sweepPointsThisMonth?.toNumber() ?? sweepBefore
    } catch {}

    await fetchAll()

    const gained = sweepAfter - sweepBefore
    return { won: gained > 1, sweepPoints: Math.max(gained, 1) }
  }, [getProgram, getReadOnlyProgram, wallet, connection, treasuryPda, masterConfigPda, getProfilePda, fetchProfile, fetchMasterConfig])

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
      // Card costs in lamports — must match on-chain MasterConfig defaults
      const CARD_COST_LAMPORTS: Record<string, number> = { QuickPick: 10_000_000, HotShot: 50_000_000, MegaGold: 100_000_000 }
      const cardCostLamports = CARD_COST_LAMPORTS[cardType] ?? 10_000_000
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
            // Only bundle creditReferrer when THIS purchase triggers the bonus
            const willTriggerBonus = profileData.totalSpent.toNumber() + cardCostLamports >= 100_000_000
            if (willTriggerBonus) {
              shouldCreditReferrer = true
              creditReferrerKey = profileData.referredBy
            }
          }
        } else if (pendingReferrer && pendingReferrer !== publicKey.toBase58()) {
          // Profile exists but not yet referred — will register in this tx (skip self-referral)
          const referrerKey = new PublicKey(pendingReferrer)
          referrerProfilePda = getProfilePda(referrerKey)
          shouldRegisterReferral = true
          creditReferrerKey = referrerKey
          // Only bundle creditReferrer if this first purchase hits the 0.1 SOL threshold
          const currentTotalSpent = profileData.totalSpent.toNumber()
          shouldCreditReferrer = currentTotalSpent + cardCostLamports >= 100_000_000
        }
      } catch {
        // Profile doesn't exist yet — if a referrer was passed, register in this tx
        if (pendingReferrer && pendingReferrer !== publicKey.toBase58()) {
          const referrerKey = new PublicKey(pendingReferrer)
          referrerProfilePda = getProfilePda(referrerKey)
          shouldRegisterReferral = true
          creditReferrerKey = referrerKey
          // totalSpent starts at 0 for new accounts — only MegaGold (0.1 SOL) triggers immediately
          shouldCreditReferrer = cardCostLamports >= 100_000_000
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
        masterConfig: masterConfigPda,
        houseWallet: new PublicKey("DBH2VpbjWLdrJnau4RjdpYBTcLy9pMGa1qQr4U9dDgER"),
        player: publicKey,
        systemProgram: SystemProgram.programId,
      }).instruction()
      instructions.push(ix)

      // 3. Bundle creditReferrer when this purchase triggers the referral bonus.
      // buyAndScratch sets referral_bonus_paid=true first; creditReferrer runs after in
      // the same tx and sees it as true — so the on-chain constraint passes.
      if (shouldCreditReferrer && creditReferrerKey) {
        const referrerProfileForCredit = getProfilePda(creditReferrerKey)
        const creditIx = await (getReadOnlyProgram().methods as any).creditReferrer().accounts({
          referrerProfile: referrerProfileForCredit,
          referrerKey: creditReferrerKey,
          callerProfile: profilePda,
          caller: publicKey,
        }).instruction()
        instructions.push(creditIx)
        console.log('Bundled creditReferrer for referrer:', creditReferrerKey.toBase58())
      }

      console.log('Instructions built:', instructions.length)

      // Fetch blockhash for simulation; will refresh again right before signing
      let { blockhash, lastValidBlockHeight } = await getBlockhashWithRetry(connection, 'confirmed')

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

        // Fresh blockhash right before signing
        ;({ blockhash, lastValidBlockHeight } = await getBlockhashWithRetry(connection, 'confirmed'))
        tx.recentBlockhash = blockhash

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

        // Fresh blockhash right before signing — simulation is async so the earlier
        // one may be stale by the time we reach here
        ;({ blockhash, lastValidBlockHeight } = await getBlockhashWithRetry(connection, 'confirmed'))
        const freshMessage = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message()
        const freshVtx = new VersionedTransaction(freshMessage)

        // Sign via wallet then submit through Helius directly.
        // Avoids Phantom's signAndSendTransaction which routes via Phantom's own
        // RPC and ignores our skipPreflight — causing -32603 for specific accounts.
        console.log('Standard path: signTransaction → sendRawTransaction via Helius')
        if (!wallet.signTransaction) {
          // Fallback for wallets that don't expose signTransaction separately
          sig = await wallet.sendTransaction(freshVtx as any, connection, { skipPreflight: true, maxRetries: 5 })
        } else {
          const signedVtx = await wallet.signTransaction(freshVtx as any)
          sig = await connection.sendRawTransaction((signedVtx as any).serialize(), { skipPreflight: true, maxRetries: 5 })
        }
      }
      console.log('Transaction sent, signature:', sig)

      // Poll for confirmation — avoids TransactionExpiredBlockheightExceededError
      // which throws even when the tx never landed (money never taken).
      let txConfirmed = false
      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000))
        const statuses = await connection.getSignatureStatuses([sig])
        const status = statuses?.value?.[0]
        if (status) {
          if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`)
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            txConfirmed = true
            break
          }
        }
      }
      if (!txConfirmed) {
        throw new Error('Transaction did not confirm in time. Your SOL was NOT charged — please try again.')
      }
      console.log('Transaction confirmed:', sig)

      await fetchAll()

      // creditReferrer is bundled into the same tx (above) when this purchase triggers the bonus.
      // No separate call needed here.

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

  return { treasury, profile, masterConfig, walletBalance, loading, fetchTreasury, fetchProfile, fetchMasterConfig, fetchAll, buyCard, freeScratch, registerReferral, creditReferrer, getProgram }
}
