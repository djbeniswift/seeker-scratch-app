'use client'
import { useEffect, useRef } from 'react'

const COLORS = ['#ffd700', '#00d4ff', '#ff006e', '#00ff88', '#ff8c00', '#a855f7', '#ffffff']

type Particle = {
  x: number; y: number; vx: number; vy: number
  color: string; rotation: number; rotSpeed: number
  w: number; h: number; life: number
}

export default function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(animRef.current)
      particlesRef.current = []
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // Burst from center-top and edges
    particlesRef.current = Array.from({ length: 150 }, (_, i) => {
      const side = i % 3 // 0=center, 1=left, 2=right
      const x = side === 0 ? canvas.width / 2 + (Math.random() - 0.5) * 200
              : side === 1 ? Math.random() * canvas.width * 0.3
              : canvas.width * 0.7 + Math.random() * canvas.width * 0.3
      return {
        x,
        y: -10 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * 5 + 2,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.25,
        w: Math.random() * 10 + 5,
        h: Math.random() * 5 + 3,
        life: 1,
      }
    })

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particlesRef.current = particlesRef.current.filter(p => p.life > 0.02)

      particlesRef.current.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.12
        p.vx *= 0.99
        p.rotation += p.rotSpeed
        p.life -= 0.007

        ctx.save()
        ctx.globalAlpha = Math.min(p.life * 2, 1)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      })

      if (particlesRef.current.length > 0) {
        animRef.current = requestAnimationFrame(animate)
      }
    }

    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [active])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 9999,
        display: active ? 'block' : 'none',
      }}
    />
  )
}
