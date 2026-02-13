'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { CARD_CONFIG } from '../lib/constants'
import { useSettings } from '../contexts/SettingsContext'
import {
  resumeAudio,
  playBuySound,
  playScratchSound,
  playWinSound,
  playLoseSound,
  playRevealSound,
  setSoundEnabled,
  setHapticsEnabled,
  vibrateLight,
  vibrateScratch,
  vibrateWin,
  vibrateLose,
} from '../lib/audio'

interface ScratchModalProps {
  cardType: string | null
  onClose: () => void
  onBuy: (cardType: string) => Promise<number>
  loading: boolean
  walletConnected: boolean
  solBalance: number
}

export default function ScratchModal({
  cardType,
  onClose,
  onBuy,
  loading,
  walletConnected,
  solBalance,
}: ScratchModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scratched, setScratched] = useState(false)
  const [scratchPercent, setScratchPercent] = useState(0)
  const [prize, setPrize] = useState<number | null>(null)
  const [bought, setBought] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [earlyReveal, setEarlyReveal] = useState(false)
  
  const lastScratchSound = useRef(0)

  const card = cardType ? CARD_CONFIG[cardType as keyof typeof CARD_CONFIG] : null

  // Get settings and sync to audio module
  const { soundEnabled, hapticsEnabled } = useSettings()
  
  useEffect(() => {
    setSoundEnabled(soundEnabled)
    setHapticsEnabled(hapticsEnabled)
  }, [soundEnabled, hapticsEnabled])

  // Reset all state when card type changes
  useEffect(() => {
    setScratched(false)
    setScratchPercent(0)
    setPrize(null)
    setBought(false)
    setBuying(false)
    setError(null)
    setEarlyReveal(false)
  }, [cardType])

  // Init canvas after buy
  useEffect(() => {
    if (!bought || !canvasRef.current || !card) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, '#1a1000')
    gradient.addColorStop(0.4, '#2a2000')
    gradient.addColorStop(0.7, '#1a1000')
    gradient.addColorStop(1, '#110d00')
    ctx.fillStyle = gradient
    ctx.roundRect(0, 0, canvas.width, canvas.height, 12)
    ctx.fill()

    ctx.globalAlpha = 0.05
    for (let i = 0; i < 30; i++) {
      ctx.beginPath()
      ctx.moveTo(Math.random() * canvas.width, 0)
      ctx.lineTo(Math.random() * canvas.width, canvas.height)
      ctx.strokeStyle = card.accentColor
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = `${card.accentColor}44`
    ctx.textAlign = 'center'
    ctx.fillText('✦ SCRATCH HERE ✦', canvas.width / 2, canvas.height / 2)
  }, [bought, card])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const source = 'touches' in e ? e.touches[0] : e
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const scratch = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current
    if (!canvas || scratched) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(x, y, 30, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

    const now = Date.now()
    if (now - lastScratchSound.current > 50) {
      playScratchSound()
      vibrateScratch()
      lastScratchSound.current = now
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let transparent = 0
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] < 128) transparent++
    }
    const pct = Math.round((transparent / (imageData.data.length / 4)) * 100)
    setScratchPercent(Math.min(pct, 100))

    if (pct >= 15 && prize === 0 && !earlyReveal) {
      setEarlyReveal(true)
      playLoseSound()
      vibrateLose()
    }

    if (pct >= 60 && !scratched) {
      setScratched(true)
      playRevealSound()
      
      setTimeout(() => {
        if (prize && prize > 0) {
          playWinSound(prize)
          vibrateWin(prize)
          confetti(prize >= 1 ? 80 : prize >= 0.1 ? 60 : 40, card?.accentColor || '#f5c842')
        } else if (!earlyReveal) {
          playLoseSound()
          vibrateLose()
        }
      }, 200)
    }
  }, [scratched, prize, card, earlyReveal])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const pos = getPos(e, e.currentTarget)
    scratch(pos.x, pos.y)
  }
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const pos = getPos(e, e.currentTarget)
    scratch(pos.x, pos.y)
  }
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    setIsDrawing(true)
    const pos = getPos(e, e.currentTarget)
    scratch(pos.x, pos.y)
  }
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!isDrawing) return
    const pos = getPos(e, e.currentTarget)
    scratch(pos.x, pos.y)
  }

  const handleBuy = async () => {
    if (!cardType || !card || buying) return
    
    resumeAudio()
    vibrateLight()
    
    setBuying(true)
    setError(null)
    
    const timeoutId = setTimeout(() => {
      setBuying(false)
      setError('Transaction timed out. Please try again.')
    }, 60000)
    
    try {
      const result = await onBuy(cardType)
      clearTimeout(timeoutId)
      
      playBuySound()
      
      setPrize(result)
      setBought(true)
      setBuying(false)
    } catch (err: any) {
      clearTimeout(timeoutId)
      setBuying(false)
      setError(err?.message || 'Transaction failed. Please try again.')
      console.error('Buy error:', err)
    }
  }

  const handlePlayAgain = () => {
    if (!cardType || !card) return
    resumeAudio()
    vibrateLight()
    setScratched(false)
    setScratchPercent(0)
    setPrize(null)
    setBought(false)
    setBuying(false)
    setError(null)
    setEarlyReveal(false)
  }

  const handleSkipToPlayAgain = () => {
    setScratched(true)
    setEarlyReveal(false)
  }

  if (!card || !cardType) return null

  const accentVar = card.color === 'gold' ? 'var(--gold)'
    : card.color === 'cyan' ? 'var(--cyan)'
    : card.color === 'purple' ? 'var(--purple)'
    : 'var(--red)'

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-handle" />
        <button className="close-btn" onClick={onClose}>✕</button>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 30,
            letterSpacing: 3,
            color: accentVar,
          }}>
            {card.emoji} {card.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>
            {card.subtitle}
          </div>
        </div>

        <div className="scratch-surface" style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', minHeight: 160, marginBottom: 16 }}>
          <div style={{
            background: prize && prize > 0
              ? 'linear-gradient(135deg, #0a2010, #051508)'
              : 'linear-gradient(135deg, #0d0d1a, #080810)',
            border: `1px solid ${prize && prize > 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.05)'}`,
            borderRadius: 12,
            minHeight: 160,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 16px',
          }}>
            {prize !== null ? (
              prize > 0 ? (
                <>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
                  <div style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 52,
                    color: 'var(--green)',
                    textShadow: '0 0 40px rgba(0,255,136,0.6)',
                    lineHeight: 1,
                    animation: 'zoomIn 0.5s cubic-bezier(0.16,1,0.3,1)',
                  }}>
                    +{prize.toFixed(3)} SOL
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--green)', fontFamily: 'monospace', marginTop: 6, letterSpacing: 2 }}>
                    WINNER!
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>😔</div>
                  <div style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 28,
                    color: 'var(--muted)',
                    letterSpacing: 2,
                  }}>
                    NO WIN
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 4, letterSpacing: 1 }}>
                    BETTER LUCK NEXT TIME
                  </div>
                </>
              )
            ) : (
              <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: 1 }}>
                {bought ? 'SCRATCH TO REVEAL' : 'BUY CARD TO PLAY'}
              </div>
            )}
          </div>

          {bought && !scratched && (
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '100%', height: '100%',
                borderRadius: 12,
                cursor: 'crosshair',
                touchAction: 'none',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={() => setIsDrawing(false)}
              onMouseLeave={() => setIsDrawing(false)}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={() => setIsDrawing(false)}
            />
          )}
        </div>

        {bought && !scratched && (
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 4, height: 3, marginBottom: 6, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: card.accentColor,
                width: `${scratchPercent}%`,
                transition: 'width 0.1s',
                boxShadow: `0 0 8px ${card.accentColor}66`,
              }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: 1 }}>
              {earlyReveal ? 'NO WIN — YOU CAN TRY AGAIN!'
                : scratchPercent < 30 ? 'SCRATCH TO REVEAL'
                : scratchPercent < 60 ? `${scratchPercent}% REVEALED...`
                : 'ALMOST THERE!'}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(255,60,60,0.1)',
            border: '1px solid rgba(255,60,60,0.3)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 12,
            color: '#ff6b6b',
            fontFamily: 'monospace',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <div className="modal-info" style={{ marginBottom: 16 }}>
          <div className="info-cell">
            <div className="info-cell-label">COST</div>
            <div className="info-cell-value" style={{ color: accentVar }}>{card.costLabel}</div>
          </div>
          <div className="info-cell">
            <div className="info-cell-label">TOP PRIZE</div>
            <div className="info-cell-value">{card.topPrize}</div>
          </div>
          <div className="info-cell">
            <div className="info-cell-label">ODDS</div>
            <div className="info-cell-value">{card.odds}</div>
          </div>
        </div>

        {!bought ? (
          <button
            className={`cta-btn ${card.btnClass}`}
            onClick={handleBuy}
            disabled={buying || loading || !walletConnected || solBalance < card.cost}
            style={{ opacity: (buying || loading) ? 0.7 : 1 }}
          >
            {!walletConnected
              ? 'CONNECT WALLET FIRST'
              : solBalance < card.cost
              ? 'INSUFFICIENT BALANCE'
              : buying || loading
              ? '⏳ PROCESSING...'
              : `BUY & SCRATCH — ${card.costLabel}`}
          </button>
        ) : scratched ? (
          <button
            className={`cta-btn ${prize && prize > 0 ? 'btn-green' : 'btn-gold'}`}
            onClick={handlePlayAgain}
          >
            {prize && prize > 0 ? `🎉 WON ${prize.toFixed(3)} SOL — PLAY AGAIN` : `TRY AGAIN — ${card.costLabel}`}
          </button>
        ) : earlyReveal ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="cta-btn btn-gold"
              onClick={handlePlayAgain}
              style={{ flex: 1 }}
            >
              🔄 TRY AGAIN
            </button>
            <button
              className="cta-btn"
              onClick={handleSkipToPlayAgain}
              style={{ 
                flex: 0, 
                padding: '14px 20px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              FINISH
            </button>
          </div>
        ) : (
          <button className="cta-btn btn-disabled" disabled>
            ← SCRATCH THE CARD ABOVE
          </button>
        )}
      </div>
    </div>
  )
}

function confetti(count: number, color: string) {
  if (count === 0) return
  const colors = [color, '#ffffff', '#f5c842', '#00ff88']
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const el = document.createElement('div')
      el.style.cssText = `
        position:fixed; pointer-events:none; z-index:9999;
        left:${Math.random() * 100}vw; top:-20px;
        width:${4 + Math.random() * 8}px; height:${4 + Math.random() * 8}px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
        animation: confetti-fall ${1.5 + Math.random() * 2}s linear forwards;
        animation-delay:${Math.random() * 0.5}s;
      `
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 3500)
    }, i * 25)
  }
}