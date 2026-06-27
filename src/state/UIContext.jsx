import { createContext, useContext, useMemo, useState, useEffect } from 'react'
import toast from 'react-hot-toast'

const UIContext = createContext(null)

export function UIProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')

  // Sync with Electron's nativeTheme on mount
  useEffect(() => {
    const syncWithElectron = async () => {
      if (typeof window !== 'undefined' && window.theme?.get) {
        try {
          const electronTheme = await window.theme.get()
          if (electronTheme && electronTheme !== theme) {
            setTheme(electronTheme)
            localStorage.setItem('theme', electronTheme)
          }
        } catch {}
      }
    }
    syncWithElectron()
  }, [])

  const toggleTheme = async () => {
    setTheme(t => {
      const next = t === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', next)
      // Sync to Electron's nativeTheme
      if (typeof window !== 'undefined' && window.theme?.set) {
        window.theme.set(next).catch(() => {})
      }
      return next
    })
  }

  const value = useMemo(() => ({ theme, toggleTheme, toast }), [theme])
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export const useUI = () => useContext(UIContext)
