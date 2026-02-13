// Audio context singleton
let audioContext: AudioContext | null = null

// Settings - controlled by SettingsContext
let soundEnabled = true
let hapticsEnabled = true

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled
}

export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled
}

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioContext
}

export function resumeAudio() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    ctx.resume()
  }
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
  if (!soundEnabled) return
  
  const ctx = getAudioContext()
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)
  
  oscillator.frequency.value = frequency
  oscillator.type = type
  
  gainNode.gain.setValueAtTime(volume, ctx.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
  
  oscillator.start(ctx.currentTime)
  oscillator.stop(ctx.currentTime + duration)
}

function playSequence(notes: { freq: number; dur: number; delay: number }[], type: OscillatorType = 'sine') {
  if (!soundEnabled) return
  notes.forEach(note => {
    setTimeout(() => playTone(note.freq, note.dur, type), note.delay)
  })
}

// ═══════════════════════════════════════════
// GAME SOUNDS
// ═══════════════════════════════════════════

export function playBuySound() {
  if (!soundEnabled) return
  playTone(880, 0.1, 'sine', 0.2)
  setTimeout(() => playTone(1100, 0.15, 'sine', 0.2), 80)
}

export function playScratchSound() {
  if (!soundEnabled) return
  
  const ctx = getAudioContext()
  const bufferSize = ctx.sampleRate * 0.05
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.3
  }
  
  const noise = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  
  noise.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = 1000 + Math.random() * 2000
  
  noise.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  
  gain.gain.setValueAtTime(0.15, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05)
  
  noise.start()
  noise.stop(ctx.currentTime + 0.05)
}

export function playWinSound(amount: number) {
  if (!soundEnabled) return
  
  if (amount >= 1) {
    // JACKPOT - triumphant fanfare
    playSequence([
      { freq: 523, dur: 0.15, delay: 0 },     // C5
      { freq: 659, dur: 0.15, delay: 100 },   // E5
      { freq: 784, dur: 0.15, delay: 200 },   // G5
      { freq: 1047, dur: 0.4, delay: 300 },   // C6
    ], 'triangle')
    setTimeout(() => {
      playSequence([
        { freq: 1047, dur: 0.2, delay: 0 },
        { freq: 1175, dur: 0.2, delay: 100 },
        { freq: 1319, dur: 0.5, delay: 200 },
      ], 'sine')
    }, 400)
  } else if (amount >= 0.1) {
    // Medium win - happy chime
    playSequence([
      { freq: 659, dur: 0.12, delay: 0 },
      { freq: 784, dur: 0.12, delay: 80 },
      { freq: 988, dur: 0.25, delay: 160 },
    ], 'triangle')
  } else {
    // Small win - simple ding
    playSequence([
      { freq: 880, dur: 0.1, delay: 0 },
      { freq: 1100, dur: 0.2, delay: 80 },
    ], 'sine')
  }
}

export function playLoseSound() {
  if (!soundEnabled) return
  // Gentle descending tone - not too sad
  playSequence([
    { freq: 400, dur: 0.15, delay: 0 },
    { freq: 350, dur: 0.2, delay: 100 },
  ], 'sine')
}

export function playButtonClick() {
  if (!soundEnabled) return
  playTone(600, 0.05, 'sine', 0.15)
}

export function playRevealSound() {
  if (!soundEnabled) return
  // Suspenseful reveal
  playSequence([
    { freq: 300, dur: 0.1, delay: 0 },
    { freq: 350, dur: 0.1, delay: 50 },
    { freq: 400, dur: 0.1, delay: 100 },
    { freq: 500, dur: 0.15, delay: 150 },
  ], 'triangle')
}

// ═══════════════════════════════════════════
// HAPTICS
// ═══════════════════════════════════════════

export function vibrateLight() {
  if (!hapticsEnabled || !('vibrate' in navigator)) return
  navigator.vibrate(10)
}

export function vibrateMedium() {
  if (!hapticsEnabled || !('vibrate' in navigator)) return
  navigator.vibrate(30)
}

export function vibrateHeavy() {
  if (!hapticsEnabled || !('vibrate' in navigator)) return
  navigator.vibrate(50)
}

export function vibratePattern(pattern: number[]) {
  if (!hapticsEnabled || !('vibrate' in navigator)) return
  navigator.vibrate(pattern)
}

export function vibrateWin(amount: number) {
  if (!hapticsEnabled || !('vibrate' in navigator)) return
  
  if (amount >= 1) {
    // Big win - celebration pattern
    navigator.vibrate([50, 30, 50, 30, 100, 50, 150])
  } else if (amount >= 0.1) {
    // Medium win
    navigator.vibrate([30, 20, 50, 20, 80])
  } else {
    // Small win
    navigator.vibrate([20, 15, 40])
  }
}

export function vibrateLose() {
  if (!hapticsEnabled || !('vibrate' in navigator)) return
  navigator.vibrate([15, 50, 15])
}

export function vibrateScratch() {
  if (!hapticsEnabled || !('vibrate' in navigator)) return
  navigator.vibrate(5)
}