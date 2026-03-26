import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import * as fs from 'fs'
import * as os from 'os'

const PROGRAM_ID = new PublicKey('3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC')
const RPC = 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'
const TREASURY_SEED = Buffer.from('scratch_treasury_v2')
const MASTER_CONFIG_SEED = Buffer.from('master_config')

const IDL = {
  version: '0.1.0',
  name: 'seeker_scratch',
  instructions: [
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

async function main() {
  const keypairPath = `${os.homedir()}/.config/solana/id.json`
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  )
  console.log('Admin  :', admin.publicKey.toBase58())

  const connection = new Connection(RPC, 'confirmed')
  const balance = await connection.getBalance(admin.publicKey)
  console.log('Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL')

  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)
  const [masterConfigPda] = PublicKey.findProgramAddressSync([MASTER_CONFIG_SEED], PROGRAM_ID)
  console.log('Treasury    :', treasuryPda.toBase58())
  console.log('MasterConfig:', masterConfigPda.toBase58())

  // Check if MasterConfig already exists
  const existing = await connection.getAccountInfo(masterConfigPda)
  if (existing) {
    console.log('\nℹ️  MasterConfig already exists (', existing.data.length, 'bytes), fetching state...')
    const wallet = new Wallet(admin)
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
    const program = new Program(IDL as any, PROGRAM_ID, provider)
    try {
      const mc = await (program.account as any).masterConfig.fetch(masterConfigPda)
      console.log('   Quickpick cost  :', (mc.costQuickpick.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
      console.log('   Hotshot cost    :', (mc.costHotshot.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
      console.log('   Megagold cost   :', (mc.costMegagold.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
      console.log('   Free play cd    :', mc.freePlayCooldownSeconds.toNumber(), 'seconds')
      console.log('   Double points   :', mc.doublePointsActive)
      console.log('   Banner active   :', mc.bannerActive)
    } catch (e: any) {
      console.log('   (could not decode — instruction may not exist in deployed binary)')
      console.log('   Error:', e?.message?.split('\n')[0])
    }
    return
  }

  const wallet = new Wallet(admin)
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  const program = new Program(IDL as any, PROGRAM_ID, provider)

  console.log('\nInitializing MasterConfig on mainnet...')
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
    console.log('✅ MasterConfig initialized:', tx)

    const mc = await (program.account as any).masterConfig.fetch(masterConfigPda)
    console.log('\n📊 MasterConfig state:')
    console.log('   Quickpick cost  :', (mc.costQuickpick.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
    console.log('   Hotshot cost    :', (mc.costHotshot.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
    console.log('   Megagold cost   :', (mc.costMegagold.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL')
    console.log('   Free play cd    :', mc.freePlayCooldownSeconds.toNumber(), 'seconds')
    console.log('   Double points   :', mc.doublePointsActive)
  } catch (e: any) {
    console.error('❌ initializeMasterConfig failed:', e?.message?.split('\n')[0])
    const logs: string[] = e?.logs ?? []
    if (logs.length) console.error('   Logs:\n  ', logs.join('\n   '))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
