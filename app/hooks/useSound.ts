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

  // Scratching noise: 4 rapid overlapping bursts with varying frequencies — multiple scratch strokes
  const playScratch = useCallback(() => {
    if (typeof window === 'undefined') return
    const m = localStorage.getItem('scratch-muted') === 'true'
    if (m) return
    const ctx = getCtx()
    if (!ctx) return

    const sr = ctx.sampleRate
    // Base frequencies for each stroke — each gets a random ±15% variation
    const baseFreqs = [400, 700, 1000, 1300]
    const strokeDuration = 0.07  // 70ms each
    const strokeSpacing = 0.04   // 40ms apart (overlap by 30ms)

    baseFreqs.forEach((baseFreq, i) => {
      const startTime = ctx.currentTime + i * strokeSpacing
      // Randomize frequency so no two scratches sound identical
      const freq = baseFreq * (0.85 + Math.random() * 0.3)
      const bufLen = Math.floor(sr * strokeDuration)
      const buf = ctx.createBuffer(1, bufLen, sr)
      const data = buf.getChannelData(0)

      for (let j = 0; j < bufLen; j++) {
        // Sharp attack (first 6ms), then fast decay
        const attack = Math.min(j / (sr * 0.006), 1)
        const decay = Math.pow(1 - j / bufLen, 1.8)
        data[j] = (Math.random() * 2 - 1) * attack * decay
      }

      const src = ctx.createBufferSource()
      src.buffer = buf

      const bandpass = ctx.createBiquadFilter()
      bandpass.type = 'bandpass'
      // Each stroke starts at its freq and drops slightly — fingernail drag
      bandpass.frequency.setValueAtTime(freq, startTime)
      bandpass.frequency.exponentialRampToValueAtTime(freq * 0.75, startTime + strokeDuration)
      bandpass.Q.value = 2.0 + Math.random() * 1.5

      const gain = ctx.createGain()
      // Slightly vary volume per stroke for natural feel
      const vol = 0.38 + Math.random() * 0.15
      gain.gain.setValueAtTime(vol, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + strokeDuration)

      src.connect(bandpass)
      bandpass.connect(gain)
      gain.connect(ctx.destination)
      src.start(startTime)
      src.stop(startTime + strokeDuration)
    })
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
