'use client'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useState } from 'react'
import { PROGRAM_ID, TREASURY_SEED, IDL } from '../lib/constants'

const ADMIN = '6RhLQikkjzace4ti4D458iSmKofbPdMGNB7VKHmWwYPP'

export default function AdminPanel() {
  const { wallet, publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const [status, setStatus] = useState('')
  const [fundAmount, setFundAmount] = useState('5')

  if (!publicKey || publicKey.toBase58() !== ADMIN) return null

  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' })
    return new Program(IDL as any, PROGRAM_ID, provider)
  }

  const initialize = async () => {
    try {
      setStatus('Initializing...')
      const program = getProgram()
      const tx = await (program.methods as any).initialize().accounts({
        treasury: treasuryPda,
        admin: publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc()
      setStatus(`✅ Initialized! ${tx.slice(0, 8)}...`)
    } catch (e: any) {
      setStatus(`❌ ${e.message}`)
    }
  }

  const fund = async () => {
    try {
      setStatus('Funding...')
      const program = getProgram()
      const lamports = parseFloat(fundAmount) * LAMPORTS_PER_SOL
      const tx = await (program.methods as any).fundTreasury(new BN(lamports)).accounts({
        treasury: treasuryPda,
        admin: publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc()
      setStatus(`✅ Funded ${fundAmount} SOL! ${tx.slice(0, 8)}...`)
    } catch (e: any) {
      setStatus(`❌ ${e.message}`)
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 16, zIndex: 50,
      background: '#1a1a2e', border: '1px solid #gold',
      borderColor: '#ffd700', borderRadius: 12, padding: 16, width: 260
    }}>
      <div style={{ color: '#ffd700', fontWeight: 'bold', marginBottom: 12 }}>⚙️ Admin Panel</div>
      <button onClick={initialize} style={{
        width: '100%', padding: '8px', marginBottom: 8,
        background: '#333', color: '#fff', border: '1px solid #555',
        borderRadius: 8, cursor: 'pointer'
      }}>Initialize Treasury</button>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={fundAmount}
          onChange={e => setFundAmount(e.target.value)}
          style={{ flex: 1, padding: '8px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 8 }}
          placeholder="SOL amount"
        />
        <button onClick={fund} style={{
          padding: '8px 12px', background: '#4ade80', color: '#000',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold'
        }}>Fund</button>
      </div>
      {status && <div style={{ color: status.startsWith('✅') ? '#4ade80' : '#f87171', fontSize: 12 }}>{status}</div>}
    </div>
  )
}
