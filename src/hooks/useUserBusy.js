import { useEffect } from 'react'
import { beginUserBusy, endUserBusy } from '../utils/userBusy.js'

/** Hold the global "user is editing" lock while `active` is true (e.g. modal open). */
export function useUserBusy(active) {
  useEffect(() => {
    if (!active) return undefined
    beginUserBusy()
    return () => endUserBusy()
  }, [active])
}
