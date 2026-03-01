import { useCallback, useState } from 'react'

function getCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)()
  } catch { return null }
}

export function useSound() {
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('scratch-muted') === 'true'
  })

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m
      localStorage.setItem('scratch-muted', String(next))
      return next
    })
  }, [])

  // Scratch sound: continuous white noise through bandpass + LFO modulation
  const playScratch = useCallback(() => {
    if (typeof window === 'undefined') return
    const m = localStorage.getItem('scratch-muted') === 'true'
    if (m) return
    const ctx = getCtx()
    if (!ctx) return

    const attack = 0.02   // 20ms
    const sustain = 0.20  // 200ms
    const release = 0.08  // 80ms
    const total = attack + sustain + release

    // White noise buffer
    const sr = ctx.sampleRate
    const buf = ctx.createBuffer(1, Math.floor(sr * total), sr)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    const src = ctx.createBufferSource()
    src.buffer = buf

    // Bandpass at 1000hz, wide Q for texture not clicks
    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 1000
    bandpass.Q.value = 0.5

    // LFO at 8hz modulates filter freq between 800-1200hz (±200hz)
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 8
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 200
    lfo.connect(lfoGain)
    lfoGain.connect(bandpass.frequency)

    // Amplitude envelope: attack / sustain / release
    const env = ctx.createGain()
    const t = ctx.currentTime
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.6, t + attack)
    env.gain.setValueAtTime(0.6, t + attack + sustain)
    env.gain.linearRampToValueAtTime(0, t + attack + sustain + release)

    src.connect(bandpass)
    bandpass.connect(env)
    env.connect(ctx.destination)

    lfo.start(t)
    src.start(t)
    lfo.stop(t + total)
    src.stop(t + total)
  }, [])

  // Small win: warm ascending arpeggio
  const playSmallWin = useCallback(() => {
    if (typeof window === 'undefined') return
    const m = localStorage.getItem('scratch-muted') === 'true'
    if (m) return
    const ctx = getCtx()
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
    const m = localStorage.getItem('scratch-muted') === 'true'
    if (m) return
    const ctx = getCtx()
    if (!ctx) return

    // Rising fanfare
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

    // Coin jingles after fanfare
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
    const m = localStorage.getItem('scratch-muted') === 'true'
    if (m) return
    const ctx = getCtx()
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

  return { muted, toggleMute, playScratch, playSmallWin, playBigWin, playLoss }
}
