'use client'

import { createContext, useContext, useEffect, useState, FC, ReactNode } from 'react'

interface SettingsContextType {
  soundEnabled: boolean
  hapticsEnabled: boolean
  toggleSound: () => void
  toggleHaptics: () => void
}

const SettingsContext = createContext<SettingsContextType | null>(null)

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}

export const SettingsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [hapticsEnabled, setHapticsEnabled] = useState(true)

  // Load from localStorage on mount
  useEffect(() => {
    const savedSound = localStorage.getItem('seeker-sound')
    const savedHaptics = localStorage.getItem('seeker-haptics')
    
    if (savedSound !== null) setSoundEnabled(savedSound === 'true')
    if (savedHaptics !== null) setHapticsEnabled(savedHaptics === 'true')
  }, [])

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const newValue = !prev
      localStorage.setItem('seeker-sound', String(newValue))
      return newValue
    })
  }

  const toggleHaptics = () => {
    setHapticsEnabled(prev => {
      const newValue = !prev
      localStorage.setItem('seeker-haptics', String(newValue))
      return newValue
    })
  }

  return (
    <SettingsContext.Provider value={{ soundEnabled, hapticsEnabled, toggleSound, toggleHaptics }}>
      {children}
    </SettingsContext.Provider>
  )
}