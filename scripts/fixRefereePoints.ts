/**
 * fixRefereePoints.ts
 * Adds 90 points to all profiles where hasBeenReferred=true AND referralBonusPaid=true.
 *
 * Approach:
 *   1. Fetch all PlayerProfile accounts on-chain
 *   2. Filter: hasBeenReferred && referralBonusPaid
 *   3. Resolve the player wallet for each PDA by checking the fee payer
 *      of the oldest transaction that touched the profile account
 *   4. Call adminAdjustPoints(90, false) using the actual PDA from step 1
 *
 * Usage:
 *   ADMIN_KEYPAIR='[1,2,3,...]' npx ts-node --project scripts/tsconfig.json scripts/fixRefereePoints.ts
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor'
import IDL from '../app/lib/idl.json'

const RPC         = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'
const PROGRAM_ID  = new PublicKey('3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC')
const TREASURY_SEED = Buffer.from('scratch_treasury_v2')
const POINTS      = new BN(90)
const SKIP_WALLET = 'HqdMKswjwXAkSe6rDuStz2fRxKvoAnghpNTvG4p5yjs1'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Resolve the player wallet for a given profile PDA by fetching the oldest
 * transaction that touched the account and returning its fee payer (index 0),
 * which is always the player who created the profile.
 */
async function resolveWalletFromPda(connection: Connection, pda: PublicKey): Promise<string | null> {
  try {
    // getSignaturesForAddress returns newest-first; we want the oldest (creation tx)
    const sigs = await connection.getSignaturesForAddress(pda, { limit: 1000 })
    if (!sigs.length) return null

    const oldestSig = sigs[sigs.length - 1].signature
    const tx = await connection.getParsedTransaction(oldestSig, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    })
    if (!tx) return null

    // accountKeys[0] is always the fee payer = the player wallet
    return tx.transaction.message.accountKeys[0]?.pubkey?.toBase58() ?? null
  } catch {
    return null
  }
}

async function main() {
  const rawKey = process.env.ADMIN_KEYPAIR
  if (!rawKey) {
    console.error('❌  ADMIN_KEYPAIR env var not set (expected JSON byte array)')
    process.exit(1)
  }

  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(rawKey)))
  console.log('Admin:', admin.publicKey.toBase58())

  const connection = new Connection(RPC, 'confirmed')
  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)

  const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: 'confirmed' })
  const program  = new Program(IDL as any, PROGRAM_ID, provider)

  // ── Step 1: fetch all profiles ────────────────────────────────────────────
  console.log('\nFetching all PlayerProfile accounts...')
  const all: any[] = await (program.account as any).playerProfile.all()
  console.log(`  ${all.length} total profiles found`)

  // ── Step 2: filter ────────────────────────────────────────────────────────
  const targets = all.filter(p => p.account.hasBeenReferred && p.account.referralBonusPaid)
  console.log(`  ${targets.length} with hasBeenReferred=true AND referralBonusPaid=true`)

  // ── Step 3: resolve wallets via tx history ────────────────────────────────
  console.log('\nResolving player wallets from oldest PDA transaction...')

  type Entry = { pda: PublicKey; playerKey: PublicKey; label: string }
  const queue: Entry[] = []

  for (const p of targets) {
    const pda: PublicKey = p.publicKey
    const name: string   = p.account.displayName || ''
    const pdaShort       = pda.toBase58().slice(0, 8)

    const wallet = await resolveWalletFromPda(connection, pda)
    await sleep(300) // respect Helius rate limits

    if (!wallet) {
      console.log(`  ⚠️  ${pdaShort}...  could not resolve wallet — skipping`)
      continue
    }
    if (wallet === SKIP_WALLET) {
      console.log(`  ⏭  ${wallet.slice(0, 8)}...  (${name || 'no name'})  — skip wallet`)
      continue
    }

    const label = name ? `"${name}"` : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
    console.log(`  ✓  PDA ${pdaShort}...  wallet ${wallet.slice(0, 8)}...  ${label}`)
    queue.push({ pda, playerKey: new PublicKey(wallet), label })
  }

  console.log(`\n${queue.length} profiles queued for +${POINTS} points\n`)

  if (!queue.length) {
    console.log('Nothing to do.')
    return
  }

  // ── Step 4: adjust points ─────────────────────────────────────────────────
  let success = 0, failed = 0

  for (const { pda, playerKey, label } of queue) {
    try {
      const sig = await (program.methods as any)
        .adminAdjustPoints(POINTS, false)
        .accounts({
          playerProfile: pda,
          playerKey,
          treasury: treasuryPda,
          admin: admin.publicKey,
        })
        .rpc({ commitment: 'confirmed' })

      console.log(`✅  ${label}  +90 pts  https://solscan.io/tx/${sig}`)
      success++
    } catch (e: any) {
      const msg   = (e?.message ?? String(e)).split('\n')[0]
      const logs: string[] = e?.logs ?? []
      console.error(`❌  ${label}  FAILED: ${msg}`)
      if (logs.length) console.error('   logs:', logs.slice(-3).join(' | '))
      failed++
    }

    await sleep(1000)
  }

  console.log(`\n── Summary ──────────────────────────────`)
  console.log(`  Success : ${success}`)
  console.log(`  Failed  : ${failed}`)
  console.log(`─────────────────────────────────────────`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
