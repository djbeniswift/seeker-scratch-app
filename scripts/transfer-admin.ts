/**
 * One-time script: transfer treasury.admin from old wallet to new wallet.
 *
 * Run AFTER deploying the updated program (which includes the transfer_admin instruction).
 * Sign with the OLD admin keypair (~/.config/solana/id.json).
 *
 * Usage:
 *   npx ts-node scripts/transfer-admin.ts
 *
 * DO NOT run until the new program (with transfer_admin) is deployed on mainnet.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor'
import fs from 'fs'
import os from 'os'
import { IDL, PROGRAM_ID, TREASURY_SEED } from '../app/lib/constants'

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=0b4b8765-216d-4304-b433-34df430427f7'
const NEW_ADMIN = new PublicKey('AkrDdxzqeaPre4QUA1W4pVyyu41UJvgQMomeyDJM7WvM')

async function main() {
  // Load old admin keypair from default Solana CLI location
  const keyPath = `${os.homedir()}/.config/solana/id.json`
  const raw = JSON.parse(fs.readFileSync(keyPath, 'utf-8'))
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(raw))
  console.log('Signing with:', adminKeypair.publicKey.toBase58())

  const connection = new Connection(HELIUS_RPC, 'confirmed')
  const provider = new AnchorProvider(connection, new Wallet(adminKeypair), {
    commitment: 'confirmed',
  })
  const program = new Program(IDL as any, PROGRAM_ID, provider)

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(TREASURY_SEED)],
    new PublicKey(PROGRAM_ID)
  )
  console.log('Treasury PDA:', treasuryPda.toBase58())
  console.log('New admin:', NEW_ADMIN.toBase58())

  const tx = await (program.methods as any)
    .transferAdmin(NEW_ADMIN)
    .accounts({
      treasury: treasuryPda,
      admin: adminKeypair.publicKey,
    })
    .rpc()

  console.log('✅ transfer_admin tx:', tx)
  console.log('treasury.admin is now:', NEW_ADMIN.toBase58())
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
