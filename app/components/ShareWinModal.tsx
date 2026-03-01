'use client'
import { useState } from 'react'

export default function ShareWinModal({ amount, onClose }: { amount: number; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const shareText = `🎰 I just won ${amount.toFixed(3)} SOL on Seeker Scratch!\n\nInstant wins on Solana — provably fair. Try your luck 👇`
  const shareUrl = 'https://seekerscratch.com'
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  const handleShare = async () => {
    try {
      await navigator.share({ title: '🎰 Seeker Scratch Win!', text: shareText, url: shareUrl })
    } catch {}
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {}
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 380, width: '100%', borderRadius: 24,
          background: '#0a0a0f',
          border: '2px solid #ffd700',
          boxShadow: '0 0 60px rgba(255,215,0,0.25), 0 0 120px rgba(255,215,0,0.1)',
          overflow: 'hidden',
          animation: 'slideUp 0.3s ease',
        }}
      >
        {/* Shareable win card */}
        <div style={{
          background: 'linear-gradient(160deg, #0f0c00 0%, #1a1208 40%, #0a0a0f 100%)',
          padding: '36px 24px 28px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255,215,0,0.15)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Diagonal gold shimmer lines */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'repeating-linear-gradient(55deg, transparent, transparent 22px, rgba(255,215,0,0.025) 22px, rgba(255,215,0,0.025) 23px)',
          }} />

          {/* Corner stars */}
          {['✦','✦','✦','✦'].map((s, i) => (
            <span key={i} style={{
              position: 'absolute',
              top: i < 2 ? 14 : undefined, bottom: i >= 2 ? 14 : undefined,
              left: i % 2 === 0 ? 16 : undefined, right: i % 2 === 1 ? 16 : undefined,
              color: 'rgba(255,215,0,0.35)', fontSize: 11,
            }}>{s}</span>
          ))}

          <div style={{ fontSize: 44, marginBottom: 6, filter: 'drop-shadow(0 0 12px rgba(255,215,0,0.5))' }}>🎰</div>
          <div style={{
            fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,215,0,0.6)',
            letterSpacing: 4, marginBottom: 20, textTransform: 'uppercase',
          }}>
            SEEKER SCRATCH
          </div>

          <div style={{
            fontFamily: "'Bebas Neue', monospace", fontSize: 18,
            color: '#aaa', letterSpacing: 3, marginBottom: 6,
          }}>
            I JUST WON
          </div>

          <div style={{
            fontFamily: "'Bebas Neue', monospace",
            fontSize: 80, lineHeight: 1,
            color: '#ffd700',
            letterSpacing: 2,
            textShadow: '0 0 40px rgba(255,215,0,0.7), 0 0 80px rgba(255,215,0,0.3)',
            marginBottom: 2,
          }}>
            {amount.toFixed(3)}
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 22,
            color: 'rgba(255,215,0,0.7)', marginBottom: 22, letterSpacing: 2,
          }}>
            SOL
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px',
            background: 'rgba(255,215,0,0.08)',
            border: '1px solid rgba(255,215,0,0.25)',
            borderRadius: 20,
            fontFamily: 'monospace', fontSize: 11,
            color: 'rgba(255,215,0,0.6)', letterSpacing: 1,
          }}>
            ⚡ INSTANT WIN ON SOLANA
          </div>

          <div style={{
            marginTop: 14, fontFamily: 'monospace',
            fontSize: 12, color: 'rgba(255,255,255,0.2)', letterSpacing: 2,
          }}>
            seekerscratch.com
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {canShare ? (
            <>
              <button
                onClick={handleShare}
                style={{
                  padding: '14px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
                  color: '#000', fontSize: 15, fontWeight: 'bold',
                  fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 1,
                }}
              >
                📤 Share Your Win
              </button>
              <button
                onClick={handleCopy}
                style={{
                  padding: '12px', borderRadius: 12,
                  background: copied ? 'rgba(0,255,136,0.1)' : 'rgba(255,215,0,0.07)',
                  border: `1px solid ${copied ? 'var(--green)' : 'rgba(255,215,0,0.25)'}`,
                  color: copied ? 'var(--green)' : 'rgba(255,215,0,0.8)',
                  fontSize: 14, fontFamily: 'monospace', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {copied ? '✓ Copied!' : '📋 Copy Link'}
              </button>
            </>
          ) : (
            <button
              onClick={handleCopy}
              style={{
                padding: '14px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
                color: '#000', fontSize: 15, fontWeight: 'bold',
                fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 1,
              }}
            >
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
          )}

          <button
            onClick={onClose}
            style={{
              padding: '11px', borderRadius: 12,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.35)', fontSize: 13,
              fontFamily: 'monospace', cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
