import { useCallback, useRef, useState } from 'react'

export function useSound() {
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('scratch-muted') === 'true'
  })

  // Persistent AudioContext stored in a ref.
  // iOS only allows AudioContext creation/resume synchronously inside a user gesture.
  // Call unlockAudio() at the start of the tap handler (before any await), then
  // win/loss sounds can play freely after the async transaction completes.
  const ctxRef = useRef<AudioContext | null>(null)

  const unlockAudio = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      if (!ctxRef.current) {
        ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      if (ctxRef.current.state === 'suspended') {
        ctxRef.current.resume()
      }
    } catch {}
  }, [])

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m
      localStorage.setItem('scratch-muted', String(next))
      return next
    })
  }, [])

  // Scratch sound: plays /scratch.mp3 (HTML Audio, works on iOS from user gesture)
  const playScratch = useCallback(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('scratch-muted') === 'true') return
    try {
      const audio = new Audio('/scratch.mp3')
      audio.volume = 0.15
      audio.play().catch(() => {})
    } catch {}
  }, [])

  // Small win: warm ascending arpeggio
  const playSmallWin = useCallback(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('scratch-muted') === 'true') return
    const ctx = ctxRef.current
    if (!ctx) return

    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t = ctx.currentTime + i * 0.1
      gain.gain.setValueAtTime(0.3, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      osc.start(t)
      osc.stop(t + 0.35)
    })
  }, [])

  // Big win: fanfare + coin jingle
  const playBigWin = useCallback(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('scratch-muted') === 'true') return
    const ctx = ctxRef.current
    if (!ctx) return

    const fanfare = [392, 523, 659, 784, 1047, 1319, 1568]
    fanfare.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t = ctx.currentTime + i * 0.07
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.35, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      osc.start(t)
      osc.stop(t + 0.5)
    })

    const coins = [1200, 900, 1100, 850, 1050, 1300]
    coins.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t = ctx.currentTime + 0.55 + i * 0.12
      gain.gain.setValueAtTime(0.25, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      osc.start(t)
      osc.stop(t + 0.18)
    })
  }, [])

  // Loss: descending thud
  const playLoss = useCallback(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('scratch-muted') === 'true') return
    const ctx = ctxRef.current
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(280, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.45)
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.28, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.45)
  }, [])

  return { muted, toggleMute, unlockAudio, playScratch, playSmallWin, playBigWin, playLoss }
}
