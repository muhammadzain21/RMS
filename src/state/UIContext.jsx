import { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

const UIContext = createContext(null)

function applyThemeClass(theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
}

export function UIProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'light' } catch { return 'light' }
  })

  // Keep <html class="dark"> in sync for the whole app (not only when ThemeToggle mounts)
  useEffect(() => {
    applyThemeClass(theme)
  }, [theme])

  // Sync with Electron's nativeTheme on mount
  useEffect(() => {
    const syncWithElectron = async () => {
      if (typeof window !== 'undefined' && window.theme?.get) {
        try {
          const electronTheme = await window.theme.get()
          if (electronTheme && (electronTheme === 'dark' || electronTheme === 'light') && electronTheme !== theme) {
            setTheme(electronTheme)
            localStorage.setItem('theme', electronTheme)
          }
        } catch {}
      }
    }
    syncWithElectron()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(t => {
      const next = t === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', next)
      applyThemeClass(next)
      if (typeof window !== 'undefined' && window.theme?.set) {
        window.theme.set(next).catch(() => {})
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ theme, toggleTheme, toast }), [theme, toggleTheme])
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export const useUI = () => useContext(UIContext)
