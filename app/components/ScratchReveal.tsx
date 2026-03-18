'use client'
import { useEffect, useRef } from 'react'

type Props = {
  onRevealed: () => void
}

export default function ScratchReveal({ onRevealed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDown = useRef(false)
  const revealed = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    // Silver diagonal-stripe scratch coating
    const g = ctx.createLinearGradient(0, 0, canvas.width, 0)
    g.addColorStop(0, '#b0b0b0')
    g.addColorStop(0.5, '#d8d8d8')
    g.addColorStop(1, '#b0b0b0')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 2
    for (let x = -canvas.height; x < canvas.width + canvas.height; x += 12) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + canvas.height, canvas.height)
      ctx.stroke()
    }

    // Prompt text
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.font = `bold ${Math.floor(canvas.width * 0.065)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🪙  SCRATCH TO REVEAL', canvas.width / 2, canvas.height / 2)
  }, [])

  const getXY = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect()
    const src = 'touches' in e ? e.touches[0] : (e as React.MouseEvent)
    return {
      x: (src.clientX - r.left) * (canvas.width / r.width),
      y: (src.clientY - r.top) * (canvas.height / r.height),
    }
  }

  const scratch = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas || revealed.current) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getXY(e, canvas)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(x, y, 32, 0, Math.PI * 2)
    ctx.fill()

    // Sample coverage on a 20×20 grid — cheaper than full pixel scan
    let cleared = 0
    const n = 20
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const px = Math.floor((i / n) * canvas.width)
        const py = Math.floor((j / n) * canvas.height)
        if (ctx.getImageData(px, py, 1, 1).data[3] < 128) cleared++
      }
    }
    if (cleared / (n * n) >= 0.5 && !revealed.current) {
      revealed.current = true
      // Fade out the remaining coating
      const fadeOut = () => {
        if (!ctx || !canvas) return
        ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = 'rgba(0,0,0,0.15)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        if (!revealed.current) return
        setTimeout(fadeOut, 30)
      }
      fadeOut()
      setTimeout(onRevealed, 200)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        borderRadius: 14,
        cursor: 'crosshair',
        touchAction: 'none',
        display: 'block',
      }}
      onMouseDown={(e) => { isDown.current = true; scratch(e) }}
      onMouseMove={(e) => { if (isDown.current) scratch(e) }}
      onMouseUp={() => { isDown.current = false }}
      onMouseLeave={() => { isDown.current = false }}
      onTouchStart={(e) => { e.preventDefault(); scratch(e) }}
      onTouchMove={(e) => { e.preventDefault(); scratch(e) }}
    />
  )
}
