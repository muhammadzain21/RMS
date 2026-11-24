import { useEffect, useRef, useState } from 'react'
import { useData } from '@/state/DataContext.jsx'
import { useBranch } from '@/state/BranchContext.jsx'

/**
 * Date filters that track the operational business date after reload / branch switch.
 * - Primes From/To (or a single date) once businessDate is known
 * - Re-primes when the header branch changes
 * - Does not overwrite while the user is editing a custom range on the same branch/day
 */
export function useBusinessDateFilter() {
  const { businessDate } = useData()
  const { activeBranchId } = useBranch()
  const [from, setFrom] = useState(() => String(businessDate || '').slice(0, 10))
  const [to, setTo] = useState(() => String(businessDate || '').slice(0, 10))
  const primedKey = useRef('')

  useEffect(() => {
    const d = String(businessDate || '').slice(0, 10)
    if (!d) return
    const branchKey = String(activeBranchId || 'all')
    const key = `${branchKey}::${d}`
    const prev = primedKey.current
    const prevBranch = prev ? prev.split('::')[0] : ''
    const first = !prev
    const branchChanged = prev && prevBranch !== branchKey
    const dayChanged = prev && prev !== key && !branchChanged
    // Re-sync on first paint, branch change, or when business day settles after hydrate
    // (day change only if filters still match the previous primed day — user hasn't customized)
    const stillOnPrimedDay = !prev || (from === prev.split('::')[1] && to === prev.split('::')[1])
    if (first || branchChanged || (dayChanged && stillOnPrimedDay) || !from || !to) {
      setFrom(d)
      setTo(d)
      primedKey.current = key
    }
  }, [businessDate, activeBranchId, from, to])

  return { from, setFrom, to, setTo, businessDate }
}

/** Single date control synced to business date (same rules as the range hook). */
export function useBusinessDateValue() {
  const { businessDate } = useData()
  const { activeBranchId } = useBranch()
  const [date, setDate] = useState(() => String(businessDate || '').slice(0, 10))
  const primedKey = useRef('')

  useEffect(() => {
    const d = String(businessDate || '').slice(0, 10)
    if (!d) return
    const branchKey = String(activeBranchId || 'all')
    const key = `${branchKey}::${d}`
    const prev = primedKey.current
    const prevBranch = prev ? prev.split('::')[0] : ''
    const first = !prev
    const branchChanged = prev && prevBranch !== branchKey
    const dayChanged = prev && prev !== key && !branchChanged
    const stillOnPrimedDay = !prev || date === (prev.split('::')[1] || '')
    if (first || branchChanged || (dayChanged && stillOnPrimedDay) || !date) {
      setDate(d)
      primedKey.current = key
    }
  }, [businessDate, activeBranchId, date])

  return [date, setDate]
}
