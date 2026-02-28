'use client'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useState, useEffect } from 'react'
import { PROGRAM_ID, TREASURY_SEED, IDL } from '../lib/constants'

const ADMIN = 'A6CqGe7oeEqctqqiJJn7ep4H64gKUzipKaARssD4hcFx'

export default function AdminPanel() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet()
  const { connection } = useConnection()
  const [status, setStatus] = useState('')
  const [fundAmount, setFundAmount] = useState('5')
  const [withdrawAmount, setWithdrawAmount] = useState('1')
  const [paused, setPaused] = useState(false)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID)

  const checkAndAlertTreasury = async () => {
    try {
      const lamports = await connection.getBalance(treasuryPda)
      const balanceSol = lamports / 1_000_000_000
      if (balanceSol < 6) {
        fetch('/api/treasury-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balance: balanceSol.toFixed(3) }),
        }).catch(() => {})
      }
    } catch {}
  }

  const getProgram = () => {
    if (!publicKey) return null
    const walletAdapter = {
      publicKey,
      signTransaction: signTransaction || (async (tx: any) => {
        const signed = await signAllTransactions?.([tx])
        return signed?.[0] ?? tx
      }),
      signAllTransactions: signAllTransactions || (async (txs: any[]) => txs),
    }
    const provider = new AnchorProvider(connection, walletAdapter as any, { commitment: 'confirmed' })
    return new Program(IDL as any, PROGRAM_ID, provider)
  }

  // Fetch current paused state when panel opens
  useEffect(() => {
    if (!open) return
    const readProvider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' })
    const readProgram = new Program(IDL as any, PROGRAM_ID, readProvider)
    ;(readProgram.account as any).treasury.fetch(treasuryPda)
      .then((data: any) => setPaused(data.paused))
      .catch(() => {})
  }, [open, connection, treasuryPda])

  if (!mounted) return null
  if (!publicKey || publicKey.toBase58() !== ADMIN) return null

  const initialize = async () => {
    try {
      setStatus('Initializing...')
      const program = getProgram()
      if (!program) return setStatus('❌ Wallet not connected')
      await (program.methods as any).initialize().accounts({
        treasury: treasuryPda,
        admin: publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc()
      setStatus('✅ Initialized!')
    } catch (e: any) {
      setStatus(`❌ ${e.message?.slice(0, 60)}`)
    }
  }

  const fund = async () => {
    try {
      setStatus('Funding...')
      const program = getProgram()
      if (!program) return setStatus('❌ Wallet not connected')
      const lamports = parseFloat(fundAmount) * LAMPORTS_PER_SOL
      await (program.methods as any).fundTreasury(new BN(lamports)).accounts({
        treasury: treasuryPda,
        admin: publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc()
      setStatus(`✅ Funded ${fundAmount} SOL!`)
    } catch (e: any) {
      setStatus(`❌ ${e.message?.slice(0, 60)}`)
    }
  }

  const withdraw = async () => {
    try {
      setStatus('Withdrawing...')
      const program = getProgram()
      if (!program) return setStatus('❌ Wallet not connected')
      const lamports = parseFloat(withdrawAmount) * LAMPORTS_PER_SOL
      await (program.methods as any).withdrawProfit(new BN(lamports)).accounts({
        treasury: treasuryPda,
        admin: publicKey,
      }).rpc()
      setStatus(`✅ Withdrew ${withdrawAmount} SOL!`)
      await checkAndAlertTreasury()
    } catch (e: any) {
      setStatus(`❌ ${e.message?.slice(0, 60)}`)
    }
  }

  const togglePause = async () => {
    try {
      const next = !paused
      setStatus(next ? 'Pausing...' : 'Unpausing...')
      const program = getProgram()
      if (!program) return setStatus('❌ Wallet not connected')
      await (program.methods as any).setPaused(next).accounts({
        treasury: treasuryPda,
        admin: publicKey,
      }).rpc()
      setPaused(next)
      setStatus(next ? '✅ Game paused' : '✅ Game unpaused')
    } catch (e: any) {
      setStatus(`❌ ${e.message?.slice(0, 60)}`)
    }
  }

  const btnBase = {
    padding: '8px 12px', border: 'none', borderRadius: 8,
    cursor: 'pointer', fontWeight: 'bold', fontSize: 13,
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 70, right: 16, zIndex: 9998,
          background: '#1a1a2e', border: '1px solid #ffd700',
          borderRadius: '50%', width: 44, height: 44,
          fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ⚙️
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 124, right: 16, zIndex: 9998,
          background: '#1a1a2e', border: '1px solid #ffd700',
          borderRadius: 12, padding: 16, width: 280,
        }}>
          <div style={{ color: '#ffd700', fontWeight: 'bold', marginBottom: 12 }}>⚙️ Admin Panel</div>

          <button onClick={initialize} style={{ ...btnBase, width: '100%', marginBottom: 8, background: '#333', color: '#fff', border: '1px solid #555' }}>
            Initialize Treasury
          </button>

          {/* Fund */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={fundAmount}
              onChange={e => setFundAmount(e.target.value)}
              style={{ flex: 1, padding: '8px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 8 }}
              placeholder="SOL"
            />
            <button onClick={fund} style={{ ...btnBase, background: '#4ade80', color: '#000' }}>Fund</button>
          </div>

          {/* Withdraw */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              style={{ flex: 1, padding: '8px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 8 }}
              placeholder="SOL"
            />
            <button onClick={withdraw} style={{ ...btnBase, background: '#f59e0b', color: '#000' }}>Withdraw</button>
          </div>

          {/* Pause toggle */}
          <button onClick={togglePause} style={{
            ...btnBase, width: '100%', marginBottom: 8,
            background: paused ? '#4ade80' : '#ef4444', color: '#fff',
          }}>
            {paused ? '▶ Unpause Game' : '⏸ Pause Game'}
          </button>

          {status && (
            <div style={{ color: status.startsWith('✅') ? '#4ade80' : '#f87171', fontSize: 12, marginTop: 4 }}>
              {status}
            </div>
          )}
        </div>
      )}
    </>
  )
}
