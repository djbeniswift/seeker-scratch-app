import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { AnchorProvider, Program, BN, Wallet } from '@coral-xyz/anchor'
import * as fs from 'fs'
import * as os from 'os'

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
)
const TREASURY_SEED = Buffer.from('scratch_treasury_v2')
const MASTER_CONFIG_SEED = Buffer.from('master_config')

// Minimal IDL — only the instructions we need here
const IDL = {
  version: '0.1.0',
  name: 'seeker_scratch',
  instructions: [
    {
      name: 'initialize',
      accounts: [
        { name: 'treasury', isMut: true, isSigner: false },
        { name: 'admin', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: 'fundTreasury',
      accounts: [
        { name: 'treasury', isMut: true, isSigner: false },
        { name: 'admin', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
    {
      name: 'initializeMasterConfig',
      accounts: [
        { name: 'masterConfig', isMut: true, isSigner: false },
        { name: 'treasury', isMut: false, isSigner: false },
        { name: 'admin', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: 'Treasury',
      type: {
        kind: 'struct',
        fields: [
          { name: 'admin', type: 'publicKey' },
          { name: 'balance', type: 'u64' },
          { name: 'totalCardsSold', type: 'u64' },
          { name: 'totalPaidOut', type: 'u64' },
          { name: 'totalProfit', type: 'u64' },
          { name: 'dailyPaidOut', type: 'u64' },
          { name: 'dayStartTime', type: 'i64' },
          { name: 'paused', type: 'bool' },
          { name: 'monthStart', type: 'i64' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
    {
      name: 'MasterConfig',
      type: {
        kind: 'struct',
        fields: [
          { name: 'costQuickpick', type: 'u64' },
          { name: 'costHotshot', type: 'u64' },
          { name: 'costMegagold', type: 'u64' },
          { name: 'thresholdQuickpick', type: 'u16' },
          { name: 'thresholdHotshot', type: 'u16' },
          { name: 'thresholdMegagold', type: 'u16' },
          { name: 'houseFeeBps', type: 'u64' },
          { name: 'minTreasury', type: 'u64' },
          { name: 'dailyPayoutCap', type: 'u64' },
          { name: 'prize1stSol', type: 'u64' },
          { name: 'prize2ndSol', type: 'u64' },
          { name: 'prize3rdSol', type: 'u64' },
          { name: 'prize1stSkr', type: 'u64' },
          { name: 'prize2ndSkr', type: 'u64' },
          { name: 'prize3rdSkr', type: 'u64' },
          { name: 'sweep1stSkr', type: 'u64' },
          { name: 'sweep2ndSkr', type: 'u64' },
          { name: 'sweep3rdSkr', type: 'u64' },
          { name: 'freePlayCooldownSeconds', type: 'i64' },
          { name: 'quickpickEnabled', type: 'bool' },
          { name: 'hotshotEnabled', type: 'bool' },
          { name: 'megagoldEnabled', type: 'bool' },
          { name: 'doublePointsActive', type: 'bool' },
          { name: 'bannerText', type: 'string' },
          { name: 'bannerActive', type: 'bool' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
  ],
  errors: [],
  types: [],
}

function isAlreadyInUse(e: any): boolean {
  const msg: string = e?.message ?? ''
  const logs: string[] = e?.logs ?? []
  return (
    msg.includes('already in use') ||
    msg.includes('0x0') ||
    logs.some((l: string) => l.includes('already in use'))
  )
}

async function main() {
  // Load admin keypair — override with ADMIN_KEYPAIR env var if set
  const keypairPath = process.env.ADMIN_KEYPAIR
    ? process.env.ADMIN_KEYPAIR.replace('~', os.homedir())
    : `${os.homedir()}/.config/solana/id.json`
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  )
  console.log('Admin:', admin.publicKey.toBase58())

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
  const balance = await connection.getBalance(admin.publicKey)
  console.log('Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL')

  // Derive PDAs
  const [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)
  const [masterConfigPda] = PublicKey.findProgramAddressSync([MASTER_CONFIG_SEED], PROGRAM_ID)
  console.log('Treasury PDA:', treasuryPda.toBase58(), '(bump', treasuryBump + ')')
  console.log('MasterConfig PDA:', masterConfigPda.toBase58())

  const wallet = new Wallet(admin)
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  const program = new Program(IDL as any, PROGRAM_ID, provider)

  // ── Step 1: Initialize treasury ──────────────────────────────────────────
  console.log('\n1. Initializing treasury...')
  try {
    const tx = await (program.methods as any)
      .initialize()
      .accounts({
        treasury: treasuryPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' })
    console.log('   ✅ Treasury initialized:', tx)
  } catch (e: any) {
    if (isAlreadyInUse(e)) {
      console.log('   ℹ️  Treasury already initialized, skipping')
    } else {
      console.error('   ❌ initialize failed:', e?.message)
      console.error('   Logs:', e?.logs?.join('\n   ') ?? '(none)')
      process.exit(1)
    }
  }

  // ── Step 2: Fund treasury with 2 SOL ─────────────────────────────────────
  console.log('\n2. Funding treasury with 2 SOL...')
  try {
    const tx = await (program.methods as any)
      .fundTreasury(new BN(2 * LAMPORTS_PER_SOL))
      .accounts({
        treasury: treasuryPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' })
    console.log('   ✅ Funded:', tx)
  } catch (e: any) {
    console.error('   ❌ fundTreasury failed:', e?.message)
    console.error('   Logs:', e?.logs?.join('\n   ') ?? '(none)')
    process.exit(1)
  }

  // ── Step 3: Initialize MasterConfig ──────────────────────────────────────
  console.log('\n3. Initializing MasterConfig...')
  try {
    const tx = await (program.methods as any)
      .initializeMasterConfig()
      .accounts({
        masterConfig: masterConfigPda,
        treasury: treasuryPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' })
    console.log('   ✅ MasterConfig initialized:', tx)
  } catch (e: any) {
    if (isAlreadyInUse(e)) {
      console.log('   ℹ️  MasterConfig already initialized, skipping')
    } else {
      console.error('   ❌ initializeMasterConfig failed:', e?.message)
      console.error('   Logs:', e?.logs?.join('\n   ') ?? '(none)')
      process.exit(1)
    }
  }

  // ── Verify final state ────────────────────────────────────────────────────
  console.log('\n📊 Final state:')
  try {
    const t = await (program.account as any).treasury.fetch(treasuryPda)
    console.log('   Treasury admin  :', t.admin.toBase58())
    console.log('   Treasury balance:', (t.balance.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
    console.log('   Paused          :', t.paused)
  } catch (e: any) {
    console.log('   Treasury fetch error:', e?.message)
  }

  try {
    const mc = await (program.account as any).masterConfig.fetch(masterConfigPda)
    console.log('   Quickpick cost  :', (mc.costQuickpick.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
    console.log('   Hotshot cost    :', (mc.costHotshot.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
    console.log('   Megagold cost   :', (mc.costMegagold.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
    console.log('   Free play cd    :', mc.freePlayCooldownSeconds.toNumber(), 'seconds')
    console.log('   Double points   :', mc.doublePointsActive)
  } catch (e: any) {
    console.log('   MasterConfig fetch error:', e?.message)
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
