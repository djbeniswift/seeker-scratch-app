/**
 * expand-profiles.ts
 *
 * One-time admin script: pre-fund all 310-byte PlayerProfile accounts so they
 * are rent-exempt at 320 bytes (PROFILE_SPACE).
 *
 * WHY THIS WORKS
 * --------------
 * FreeScratch (and BuyAndScratch) have `realloc = 320, realloc::payer = player`
 * on the profile account. When the profile is still 310 bytes, Anchor must CPI
 * into the System Program to transfer ~69k lamports from the player to the
 * account before resizing. Players with barely-above-minimum balances cannot
 * afford this, so the simulation fails with "This transaction couldn't be
 * simulated."
 *
 * Anchor's realloc only does the lamport transfer if the account is *under*
 * funded. By sending the deficit directly from admin → account now, the
 * account is fully funded at 320-byte rent levels. On the player's next
 * freeScratch or buyAndScratch call:
 *   1. Anchor checks: account lamports >= rent(320) → skips lamport transfer
 *   2. account_info.realloc(320, false) executes — data grows 310 → 320
 *   3. No lamports move from the player → simulation passes
 *
 * Admin cannot call freeScratch/buyAndScratch on behalf of arbitrary players
 * (those instructions require the player as Signer), so direct pre-funding is
 * the only viable approach without a program upgrade.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'
const PROGRAM_ID = new PublicKey('3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC')
const OLD_SIZE = 310
const NEW_SIZE = 320

function loadAdminKeypair(): Keypair {
  // Accept --keypair <path> as a CLI argument
  const flagIdx = process.argv.indexOf('--keypair')
  const explicitPath = flagIdx !== -1 ? process.argv[flagIdx + 1] : null

  const candidates = [
    ...(explicitPath ? [explicitPath] : []),
    path.join(os.homedir(), 'Documents/seeker-scratch-app/admin-keypair.json'),
    path.join(os.homedir(), '.config/solana/id.json'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`Keypair: ${p}`)
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
      return Keypair.fromSecretKey(Uint8Array.from(raw))
    }
  }
  throw new Error(
    `No keypair found. Pass the path explicitly:\n  ts-node expand-profiles.ts --keypair /path/to/admin.json`
  )
}

async function main() {
  const connection = new Connection(HELIUS_RPC, 'confirmed')
  const admin = loadAdminKeypair()
  console.log(`Admin:   ${admin.publicKey.toBase58()}`)

  const adminBalance = await connection.getBalance(admin.publicKey)
  console.log(`Balance: ${(adminBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL\n`)

  const rentFor320 = await connection.getMinimumBalanceForRentExemption(NEW_SIZE)
  const rentFor310 = await connection.getMinimumBalanceForRentExemption(OLD_SIZE)
  console.log(`Rent-exempt minimum:`)
  console.log(`  310 bytes: ${rentFor310} lamports`)
  console.log(`  320 bytes: ${rentFor320} lamports`)
  console.log(`  Deficit per account: ~${rentFor320 - rentFor310} lamports\n`)

  console.log(`Fetching all ${OLD_SIZE}-byte accounts owned by program...`)
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: OLD_SIZE }],
  })
  console.log(`Found ${accounts.length} account(s) still at ${OLD_SIZE} bytes.\n`)

  if (accounts.length === 0) {
    console.log('Nothing to do — all profile accounts are already at 320 bytes.')
    return
  }

  const totalDeficit = accounts.reduce((sum, { account }) => {
    const d = rentFor320 - account.lamports
    return sum + (d > 0 ? d : 0)
  }, 0)
  console.log(`Estimated total cost: ${totalDeficit} lamports (${(totalDeficit / LAMPORTS_PER_SOL).toFixed(6)} SOL)\n`)

  if (adminBalance < totalDeficit + 10_000) {
    throw new Error(
      `Admin has insufficient balance. Need ${(totalDeficit / LAMPORTS_PER_SOL).toFixed(6)} SOL + fees.`
    )
  }

  let funded = 0
  let alreadyFunded = 0
  let failed = 0
  let totalSpent = 0

  for (const { pubkey, account } of accounts) {
    const deficit = rentFor320 - account.lamports

    if (deficit <= 0) {
      console.log(`[SKIP] ${pubkey.toBase58()} — already has ${account.lamports} lamports`)
      alreadyFunded++
      continue
    }

    console.log(`[FUND] ${pubkey.toBase58()}`)
    console.log(`       lamports: ${account.lamports} → ${rentFor320}  (sending ${deficit})`)

    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: pubkey,
          lamports: deficit,
        })
      )
      const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
        commitment: 'confirmed',
      })
      console.log(`       ✓ ${sig}`)
      funded++
      totalSpent += deficit
    } catch (e: any) {
      console.error(`       ✗ FAILED: ${e.message}`)
      failed++
    }
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`DONE`)
  console.log(`${'─'.repeat(60)}`)
  console.log(`Found at 310 bytes:  ${accounts.length}`)
  console.log(`Pre-funded:          ${funded}`)
  console.log(`Already funded:      ${alreadyFunded}`)
  console.log(`Failed:              ${failed}`)
  console.log(`SOL spent:           ${(totalSpent / LAMPORTS_PER_SOL).toFixed(6)}`)
  if (funded > 0) {
    console.log(`\nThese players' accounts will resize 310 → 320 bytes automatically`)
    console.log(`on their next freeScratch or buyAndScratch call. No action needed from them.`)
  }
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
