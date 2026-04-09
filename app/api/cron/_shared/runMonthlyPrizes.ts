import { Connection, PublicKey, Keypair } from '@solana/web3.js'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { Resend } from 'resend'
import { IDL, PROGRAM_ID, TREASURY_SEED, MONTHLY_PRIZE_SEED, MASTER_CONFIG_SEED, PROFILE_SEED } from '../../../lib/constants'

const resend = new Resend(process.env.RESEND_API_KEY)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const FALLBACK_RPC = 'https://api.mainnet-beta.solana.com'

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 4): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      const msg = err?.message ?? ''
      const is429 = msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('rate limit')
      if (is429 && i < retries - 1) {
        const delay = 1000 * Math.pow(2, i) // 1s, 2s, 4s, 8s
        console.warn(`[${label}] 429 rate limit — retrying in ${delay}ms (attempt ${i + 1}/${retries})`)
        await sleep(delay)
        continue
      }
      throw err
    }
  }
  throw new Error(`[${label}] exhausted retries`)
}

// Wallets that can't be resolved via tx history (e.g. admin wallet with old txs).
// Checked as a final fallback in resolveWalletFromPda.
const KNOWN_WALLETS = [
  'AkrDdxzqeaPre4QUA1W4pVyyu41UJvgQMomeyDJM7WvM', // new admin
  'HqdMKswjwXAkSe6rDuStz2fRxKvoAnghpNTvG4p5yjs1', // eligible player — add to known for reliable resolution
]

// Excluded from prizes but still visible on leaderboard.
// Derived to profile PDAs at runtime so we can filter the profiles array by PDA pubkey.
const EXCLUDED_WALLETS = [
  '6RhLQikkjzace4ti4D458iSmKofbPdMGNB7VKHmWwYPP', // old admin
  'AkrDdxzqeaPre4QUA1W4pVyyu41UJvgQMomeyDJM7WvM', // new admin
  'DBH2VpbjWLdrJnau4RjdpYBTcLy9pMGa1qQr4U9dDgER', // house wallet
  'A6CqGe7oeEqctqqiJJn7ep4H64gKUzipKaARssD4hcFx', // playground
  'F6H2mTqL3HvmtRB77w5TTJ48MMjvxaxg2gKxEHyBATpm', // SKR distribution wallet
  'CtrRizJuJJGt76RXEHEhNpWduSFmWwWTrUDAQ1XFpnS7', // admin wallet
  'G26xR3MmZMvXT1pGmVctNumCDHFqF8BQ5QWL7xXFZfgn', // Seeker phone wallet
  'GTpPckfLivFsNZphqoBYknrwhwuTEHK49WQXyjRuszAn', // LFG wallet
  '6NmnJZj7TQGU36iXPG3QZxyerHmGWmierMQY87Y8LL36', // new playground wallet
]

// Resolve the player wallet for a profile PDA by checking transaction history.
// The profile PDA is derived as [PROFILE_SEED, wallet.toBytes()], but the on-chain
// program never writes the wallet into profile.owner — so we can't read it from
// account data. Instead, get the oldest transaction for the profile PDA and check
// accounts[0] — the fee payer is always the first account and is always the player.
// Returns null (never throws) so callers can skip failed resolutions gracefully.
async function resolveWalletFromPda(connection: Connection, profilePda: PublicKey): Promise<PublicKey | null> {
  const pdaStr = profilePda.toBase58()
  console.log(`[resolveWallet] Resolving wallet for profile PDA: ${pdaStr}`)

  let sigs: Awaited<ReturnType<typeof connection.getSignaturesForAddress>>
  try {
    sigs = await withRetry(
      () => connection.getSignaturesForAddress(profilePda, { limit: 10 }, 'confirmed'),
      `resolveWallet:sigs:${pdaStr.slice(0, 8)}`
    )
  } catch (err) {
    console.error(`[resolveWallet] Failed to fetch signatures for ${pdaStr}:`, err)
    return null
  }

  console.log(`[resolveWallet] Found ${sigs.length} signatures for ${pdaStr}`)

  if (sigs.length === 0) {
    console.warn(`[resolveWallet] No transactions found for profile PDA: ${pdaStr}`)
    return null
  }

  const ordered = [...sigs].reverse()

  for (const { signature } of ordered) {
    try {
      console.log(`[resolveWallet] Checking tx ${signature}`)
      const tx = await withRetry(
        () => connection.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }),
        `resolveWallet:tx:${signature.slice(0, 8)}`
      )
      const accounts = (tx?.transaction?.message as any)?.accountKeys ?? []
      if (accounts.length === 0) {
        console.log(`[resolveWallet] Tx ${signature} has no accounts, skipping`)
        continue
      }

      // accounts[0] is always the fee payer — the player wallet
      const feePayer: PublicKey = accounts[0].pubkey
      console.log(`[resolveWallet] Fee payer (accounts[0]): ${feePayer.toBase58()}`)

      const [derived] = PublicKey.findProgramAddressSync([PROFILE_SEED, feePayer.toBytes()], PROGRAM_ID)
      console.log(`[resolveWallet] Derived PDA from fee payer: ${derived.toBase58()}`)

      if (derived.equals(profilePda)) {
        console.log(`[resolveWallet] Match! Wallet = ${feePayer.toBase58()}`)
        return feePayer
      }

      console.log(`[resolveWallet] No match for tx ${signature}, trying next`)
    } catch (err) {
      console.warn(`[resolveWallet] Error fetching tx ${signature}:`, err)
    }
  }

  // Fallback: check known wallets by brute-force PDA derivation
  console.log(`[resolveWallet] Trying known wallet fallback for ${pdaStr}`)
  for (const known of KNOWN_WALLETS) {
    const knownPubkey = new PublicKey(known)
    const [derived] = PublicKey.findProgramAddressSync([PROFILE_SEED, knownPubkey.toBytes()], PROGRAM_ID)
    if (derived.equals(profilePda)) {
      console.log(`[resolveWallet] Resolved via known wallet list: ${known}`)
      return knownPubkey
    }
  }

  console.error(`[resolveWallet] Could not resolve wallet for ${pdaStr} — exhausted tx history and known wallet list`)
  return null
}

export async function runMonthlyPrizes() {
  const rpcUrl = process.env.SOLANA_RPC_URL
    || 'https://mainnet.helius-rpc.com/?api-key=0b4b8765-216d-4304-b433-34df430427f7'
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY
  if (!adminPrivateKey) throw new Error('ADMIN_PRIVATE_KEY env var not set')

  const connection = new Connection(rpcUrl, 'confirmed')
  const adminKeypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(adminPrivateKey)))

  const provider = new AnchorProvider(
    connection,
    {
      publicKey: adminKeypair.publicKey,
      signTransaction: async (tx: any) => { tx.sign(adminKeypair); return tx },
      signAllTransactions: async (txs: any) => txs.map((tx: any) => { tx.sign(adminKeypair); return tx }),
    } as any,
    { commitment: 'confirmed' }
  )
  const program = new Program(IDL as any, PROGRAM_ID, provider)

  // Fetch prize amounts from MasterConfig on-chain (stored in lamports).
  // Use safe BN construction via .toString() to avoid "Cannot read properties of undefined
  // (reading 'toArrayLike')" when the field comes back as a raw number instead of a BN object.
  const [masterConfigPda] = PublicKey.findProgramAddressSync([MASTER_CONFIG_SEED], PROGRAM_ID)
  const masterConfig = await (program.account as any).masterConfig.fetch(masterConfigPda)
  console.log(`[runMonthlyPrizes] MasterConfig prize amounts (raw):`, {
    prize1stSol: masterConfig.prize1stSol?.toString?.() ?? masterConfig.prize1stSol,
    prize2ndSol: masterConfig.prize2ndSol?.toString?.() ?? masterConfig.prize2ndSol,
    prize3rdSol: masterConfig.prize3rdSol?.toString?.() ?? masterConfig.prize3rdSol,
  })
  const prizeAmounts: [BN, BN, BN] = [
    masterConfig.prize1stSol ? new BN(masterConfig.prize1stSol.toString()) : new BN(250_000_000),
    masterConfig.prize2ndSol ? new BN(masterConfig.prize2ndSol.toString()) : new BN(150_000_000),
    masterConfig.prize3rdSol ? new BN(masterConfig.prize3rdSol.toString()) : new BN(50_000_000),
  ]
  // SKR amounts for SOL leaderboard (token, sent manually)
  const solSkr = [
    masterConfig.prize1stSkr ? masterConfig.prize1stSkr.toNumber() : 500,
    masterConfig.prize2ndSkr ? masterConfig.prize2ndSkr.toNumber() : 250,
    masterConfig.prize3rdSkr ? masterConfig.prize3rdSkr.toNumber() : 100,
  ]
  // SKR amounts for Sweep leaderboard (token, sent manually)
  const sweepSkr = [
    masterConfig.sweep1stSkr ? masterConfig.sweep1stSkr.toNumber() : 500,
    masterConfig.sweep2ndSkr ? masterConfig.sweep2ndSkr.toNumber() : 250,
    masterConfig.sweep3rdSkr ? masterConfig.sweep3rdSkr.toNumber() : 100,
  ]

  // Fetch all profiles — retry with exponential backoff, fall back to public RPC on persistent 429
  let profiles: any[]
  try {
    profiles = await withRetry(
      () => (program.account as any).playerProfile.all(),
      'fetchProfiles:helius'
    )
  } catch (err: any) {
    const is429 = (err?.message ?? '').includes('429') || (err?.message ?? '').includes('Too Many Requests')
    if (is429) {
      console.warn('[runMonthlyPrizes] Helius still rate-limiting after retries — switching to fallback RPC')
      const fallbackConnection = new Connection(FALLBACK_RPC, 'confirmed')
      const fallbackProvider = new AnchorProvider(
        fallbackConnection,
        {
          publicKey: adminKeypair.publicKey,
          signTransaction: async (tx: any) => { tx.sign(adminKeypair); return tx },
          signAllTransactions: async (txs: any) => txs.map((tx: any) => { tx.sign(adminKeypair); return tx }),
        } as any,
        { commitment: 'confirmed' }
      )
      const fallbackProgram = new Program(IDL as any, PROGRAM_ID, fallbackProvider)
      profiles = await withRetry(
        () => (fallbackProgram.account as any).playerProfile.all(),
        'fetchProfiles:fallback'
      )
    } else {
      throw err
    }
  }

  // Derive excluded profile PDAs from wallet addresses so we can filter by PDA pubkey
  const excludedPdaSet = new Set(
    EXCLUDED_WALLETS.map(w => {
      const [pda] = PublicKey.findProgramAddressSync([PROFILE_SEED, new PublicKey(w).toBytes()], PROGRAM_ID)
      return pda.toBase58()
    })
  )
  const isExcluded = (p: any) => excludedPdaSet.has(p.publicKey.toBase58())

  // SOL leaderboard: top 5 by pointsThisMonth — resolve top 5 so we have backups if any fail
  const sorted = profiles
    .filter((p: any) => p.account.pointsThisMonth.toNumber() > 0 && !isExcluded(p))
    .sort((a: any, b: any) => b.account.pointsThisMonth.toNumber() - a.account.pointsThisMonth.toNumber())
    .slice(0, 5)

  console.log(`[runMonthlyPrizes] Top ${sorted.length} SOL leaderboard players this month (after exclusions)`)

  // Sweep leaderboard: top 5 by sweepPointsThisMonth
  const sweepSorted = profiles
    .filter((p: any) => (p.account.sweepPointsThisMonth?.toNumber?.() ?? 0) > 0 && !isExcluded(p))
    .sort((a: any, b: any) => (b.account.sweepPointsThisMonth?.toNumber?.() ?? 0) - (a.account.sweepPointsThisMonth?.toNumber?.() ?? 0))
    .slice(0, 5)

  console.log(`[runMonthlyPrizes] Top ${sweepSorted.length} sweep leaderboard players this month`)

  if (sorted.length === 0) {
    return { message: 'No players with points this month', winners: [] }
  }

  // Resolve top 5 wallets — use first 3 that succeed as winners (backups fill in if any fail)
  const resolvedAll: { wallet: PublicKey; profile: any }[] = []
  for (const p of sorted) {
    const wallet = await resolveWalletFromPda(connection, p.publicKey)
    if (wallet === null) {
      console.error(`[runMonthlyPrizes] Could not resolve wallet for PDA ${p.publicKey.toBase58()} — trying next`)
    } else {
      resolvedAll.push({ wallet, profile: p })
    }
  }
  const top3 = resolvedAll.slice(0, 3)

  // Build padded 3-slot arrays for setMonthlyWinners
  const winners: [PublicKey, PublicKey, PublicKey] = [
    top3[0]?.wallet ?? PublicKey.default,
    top3[1]?.wallet ?? PublicKey.default,
    top3[2]?.wallet ?? PublicKey.default,
  ]
  const amounts: [BN, BN, BN] = [
    top3[0] ? prizeAmounts[0] : new BN(0),
    top3[1] ? prizeAmounts[1] : new BN(0),
    top3[2] ? prizeAmounts[2] : new BN(0),
  ]
  const resolved = [top3[0]?.wallet ?? null, top3[1]?.wallet ?? null, top3[2]?.wallet ?? null]

  const resolvedCount = resolved.filter(Boolean).length
  console.log(`[runMonthlyPrizes] Resolved ${resolvedCount}/${sorted.length} wallets`)
  console.log(`[runMonthlyPrizes] winners array:`, winners.map(w => w.toBase58()))
  console.log(`[runMonthlyPrizes] amounts array:`, amounts.map(a => a.toString()))
  console.log(`[runMonthlyPrizes] Calling setMonthlyWinners...`)

  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)
  const [monthlyPrizePda] = PublicKey.findProgramAddressSync([MONTHLY_PRIZE_SEED], PROGRAM_ID)

  let tx: string
  try {
    tx = await (program.methods as any)
      .setMonthlyWinners(winners, amounts)
      .accounts({
        monthlyPrize: monthlyPrizePda,
        treasury: treasuryPda,
        admin: adminKeypair.publicKey,
        systemProgram: PublicKey.default,
      })
      .rpc({ commitment: 'confirmed' })
  } catch (err: any) {
    console.error(`[runMonthlyPrizes] setMonthlyWinners failed:`, err?.message ?? err)
    console.error(`[runMonthlyPrizes] Program logs:`, err?.logs ?? 'none')
    throw err
  }

  console.log(`[runMonthlyPrizes] setMonthlyWinners tx: ${tx}`)

  // Reset monthly points — only for profiles that actually have non-zero points.
  // This avoids resolving wallets for all 107+ profiles (huge RPC cost).
  // Profiles with 0 points need no reset. Missed resets are non-critical.
  const profilesToReset = profiles.filter((p: any) =>
    p.account.pointsThisMonth.toNumber() > 0 ||
    (p.account.sweepPointsThisMonth?.toNumber?.() ?? 0) > 0
  )
  console.log(`[runMonthlyPrizes] Resetting monthly points for ${profilesToReset.length}/${profiles.length} profiles with non-zero points...`)
  let resetCount = 0
  let resetErrors = 0
  for (const p of profilesToReset) {
    const wallet = await resolveWalletFromPda(connection, p.publicKey)
    if (!wallet) {
      console.warn(`[runMonthlyPrizes] Could not resolve wallet for ${p.publicKey.toBase58()} — skipping reset`)
      resetErrors++
      continue
    }
    try {
      await withRetry(
        () => (program.methods as any)
          .resetMonthlyPoints()
          .accounts({
            playerProfile: p.publicKey,
            playerKey: wallet,
            treasury: treasuryPda,
            admin: adminKeypair.publicKey,
          })
          .rpc({ commitment: 'confirmed' }),
        `resetMonthlyPoints:${p.publicKey.toBase58().slice(0, 8)}`
      )
      resetCount++
    } catch (err: any) {
      console.error(`[runMonthlyPrizes] resetMonthlyPoints failed for ${p.publicKey.toBase58()}:`, err?.message ?? err)
      resetErrors++
    }
    await sleep(200) // avoid hammering RPC
  }
  console.log(`[runMonthlyPrizes] Points reset complete: ${resetCount} succeeded, ${resetErrors} failed/skipped`)

  // Set month_start on treasury to mark the beginning of the new period.
  try {
    const monthStartTx = await (program.methods as any)
      .setMonthStart()
      .accounts({
        treasury: treasuryPda,
        admin: adminKeypair.publicKey,
      })
      .rpc({ commitment: 'confirmed' })
    console.log(`[runMonthlyPrizes] setMonthStart tx: ${monthStartTx}`)
  } catch (err: any) {
    console.error(`[runMonthlyPrizes] setMonthStart failed:`, err?.message ?? err)
    // Non-fatal — continue to sweep resolution and email
  }

  // Resolve sweep top 5, use first 3 that succeed
  const sweepResolvedAll: (PublicKey | null)[] = []
  for (const p of sweepSorted) {
    const wallet = await resolveWalletFromPda(connection, p.publicKey)
    if (wallet === null) {
      console.error(`[runMonthlyPrizes] Could not resolve sweep winner wallet for PDA ${p.publicKey.toBase58()} — trying next`)
    }
    sweepResolvedAll.push(wallet)
  }
  const sweepResolved = sweepResolvedAll.filter(Boolean).slice(0, 3) as (PublicKey | null)[]
  // Pad to 3
  while (sweepResolved.length < 3) sweepResolved.push(null)

  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const placeLabels = ['1st', '2nd', '3rd']

  // SOL leaderboard rows
  const solRows = winners.map((w, i) => {
    if (!resolved[i]) return `  ${placeLabels[i]}: SKIPPED (wallet resolution failed)`
    const pts = sorted[i]?.account?.pointsThisMonth?.toNumber?.() ?? 0
    const sol = amounts[i].toNumber() / 1_000_000_000
    return `  ${placeLabels[i]}: ${w.toBase58()} — ${sol} SOL + ${solSkr[i]} SKR (${pts} pts)`
  })

  // Sweep leaderboard rows
  const sweepRows = [0, 1, 2].map(i => {
    if (!sweepResolved[i]) return `  ${placeLabels[i]}: ${sweepSorted[i] ? 'SKIPPED (wallet resolution failed)' : 'no winner'}`
    const pts = sweepSorted[i]?.account?.sweepPointsThisMonth?.toNumber?.() ?? 0
    return `  ${placeLabels[i]}: ${sweepResolved[i]!.toBase58()} — ${sweepSkr[i]} SKR (${pts} sweep pts)`
  })

  // Total SKR to send manually
  const solSkrTotal = resolved.reduce((sum, r, i) => sum + (r ? solSkr[i] : 0), 0)
  const sweepSkrTotal = sweepResolved.reduce((sum, r, i) => sum + (r ? sweepSkr[i] : 0), 0)
  const totalSkr = solSkrTotal + sweepSkrTotal

  // Build SKR checklist
  const skrLines: string[] = []
  winners.forEach((w, i) => {
    if (resolved[i]) skrLines.push(`  [ ] ${w.toBase58()} — ${solSkr[i]} SKR (SOL ${placeLabels[i]})`)
  })
  sweepResolved.forEach((w, i) => {
    if (w) skrLines.push(`  [ ] ${w.toBase58()} — ${sweepSkr[i]} SKR (Sweep ${placeLabels[i]})`)
  })

  await resend.emails.send({
    from: 'Seeker Scratch <onboarding@resend.dev>',
    to: 'labswift@gmail.com',
    subject: `🏆 Monthly Winners — ${monthLabel}`,
    text: [
      `=== SOL LEADERBOARD WINNERS (auto-set on-chain) ===`,
      ...solRows,
      '',
      `=== SWEEP LEADERBOARD WINNERS (SKR only) ===`,
      ...sweepRows,
      '',
      `=== SKR TO SEND MANUALLY ===`,
      `Send from your SKR wallet to each address above.`,
      `Total SKR this month: ${totalSkr} SKR`,
      '',
      ...skrLines,
      '',
      `Tx: ${tx}`,
    ].join('\n'),
  })

  return {
    success: true,
    tx,
    resolvedCount,
    totalSkr,
    solWinners: winners.map((w, i) => ({
      place: i + 1,
      wallet: w.toBase58(),
      resolved: resolved[i] !== null,
      amountSol: amounts[i].toNumber() / 1_000_000_000,
      amountSkr: resolved[i] ? solSkr[i] : 0,
      pointsThisMonth: sorted[i]?.account?.pointsThisMonth?.toNumber?.() ?? 0,
    })),
    sweepWinners: [0, 1, 2].map(i => ({
      place: i + 1,
      wallet: sweepResolved[i]?.toBase58() ?? null,
      resolved: sweepResolved[i] !== null && sweepResolved[i] !== undefined,
      amountSkr: sweepResolved[i] ? sweepSkr[i] : 0,
      sweepPointsThisMonth: sweepSorted[i]?.account?.sweepPointsThisMonth?.toNumber?.() ?? 0,
    })),
  }
}
