import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toMonth(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function fromISO(s) {
  if (!s) return null
  const parts = String(s).slice(0, 10).split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  const d = parts[2] || 1
  if (!y || !m) return null
  return new Date(y, m - 1, d)
}

/**
 * Shared date / month picker used across the app.
 * mode="date"  → YYYY-MM-DD
 * mode="month" → YYYY-MM
 */
export default function DatePicker({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  className = '',
  compact = false,
  allowClear = true,
  mode = 'date', // 'date' | 'month'
}) {
  const isMonth = mode === 'month'
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const d = fromISO(value)
    return d || new Date()
  })
  const [popPos, setPopPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  const popRef = useRef(null)
  const btnRef = useRef(null)

  const minDate = fromISO(min)
  const maxDate = fromISO(max)
  const todayISO = toISO(new Date())
  const thisMonth = toMonth(new Date())
  const defaultPlaceholder = isMonth ? 'Select month' : 'Select date'

  useEffect(() => {
    if (open && value) {
      const d = fromISO(value)
      if (d) setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
    }
  }, [open, value])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const place = () => {
      const rect = btnRef.current.getBoundingClientRect()
      const width = isMonth ? 260 : 304
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
      const below = rect.bottom + 6
      const approxH = isMonth ? 220 : 340
      const top = below + approxH > window.innerHeight - 8
        ? Math.max(8, rect.top - approxH - 6)
        : below
      setPopPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, isMonth])

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      const t = e.target
      if (ref.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    // Use click (not mousedown) so day/month buttons can receive the press first
    document.addEventListener('click', handleOutside, true)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', handleOutside, true)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
    return days
  }, [viewDate])

  const isDisabled = (d) => {
    if (!d) return true
    if (minDate && d < minDate) return true
    if (maxDate && d > maxDate) return true
    return false
  }

  const isMonthDisabled = (y, mIndex) => {
    const start = new Date(y, mIndex, 1)
    const end = new Date(y, mIndex + 1, 0)
    if (minDate && end < minDate) return true
    if (maxDate && start > maxDate) return true
    return false
  }

  const selectDate = (d) => {
    if (isDisabled(d)) return
    onChange(toISO(d))
    setOpen(false)
  }

  const selectMonth = (y, mIndex) => {
    if (isMonthDisabled(y, mIndex)) return
    onChange(`${y}-${String(mIndex + 1).padStart(2, '0')}`)
    setOpen(false)
  }

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
  const prevYear = () => setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1))
  const nextYear = () => setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1))

  const yearOptions = useMemo(() => {
    const nowY = new Date().getFullYear()
    const years = []
    for (let y = nowY + 1; y >= nowY - 12; y--) years.push(y)
    return years
  }, [])

  const displayValue = value ? (() => {
    const d = fromISO(value)
    if (!d) return placeholder || defaultPlaceholder
    if (isMonth) return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
    if (compact) return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`
    return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`
  })() : (placeholder || defaultPlaceholder)

  const selectClass =
    'rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm font-semibold px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  const popup = open
    ? createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: popPos.top, left: popPos.left, zIndex: 10000 }}
          className={`p-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border-2 border-indigo-200 dark:border-indigo-700 ${isMonth ? 'w-[16.5rem]' : 'w-[19rem]'}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {isMonth ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={prevYear}
                  className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="Previous year"
                >
                  <ChevronLeft size={18} />
                </button>
                <select
                  className={`${selectClass} flex-1 min-w-0`}
                  value={viewDate.getFullYear()}
                  onChange={(e) => setViewDate(new Date(Number(e.target.value), viewDate.getMonth(), 1))}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={nextYear}
                  className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="Next year"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((name, idx) => {
                  const y = viewDate.getFullYear()
                  const iso = `${y}-${String(idx + 1).padStart(2, '0')}`
                  const selected = String(value || '').slice(0, 7) === iso
                  const isCurrent = thisMonth === iso
                  const disabled = isMonthDisabled(y, idx)
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectMonth(y, idx)}
                      className={`h-9 rounded-lg text-xs font-semibold transition-all
                        ${selected
                          ? 'ui-btn ui-btn-primary'
                          : isCurrent
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-700'
                          : disabled
                          ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                        }`}
                    >
                      {name.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => { onChange(thisMonth); setOpen(false) }}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                >
                  This month
                </button>
                {allowClear ? (
                  <button
                    type="button"
                    onClick={() => { onChange(''); setOpen(false) }}
                    className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Clear
                  </button>
                ) : <span />}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <select
                  className={`${selectClass} flex-1 min-w-0`}
                  value={viewDate.getMonth()}
                  onChange={(e) => setViewDate(new Date(viewDate.getFullYear(), Number(e.target.value), 1))}
                >
                  {MONTHS.map((name, idx) => (
                    <option key={name} value={idx}>{name}</option>
                  ))}
                </select>
                <select
                  className={`${selectClass} w-[5.5rem]`}
                  value={viewDate.getFullYear()}
                  onChange={(e) => setViewDate(new Date(Number(e.target.value), viewDate.getMonth(), 1))}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((d, i) => {
                  if (!d) return <div key={i} />
                  const iso = toISO(d)
                  const isSelected = value === iso
                  const isToday = todayISO === iso
                  const disabled = isDisabled(d)
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectDate(d)}
                      className={`
                          relative h-8 w-8 rounded-lg text-sm font-medium transition-all
                          ${isSelected
                            ? 'ui-btn ui-btn-primary scale-105'
                            : isToday
                            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-700'
                            : disabled
                            ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:scale-105'
                          }
                        `}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => { onChange(todayISO); setOpen(false) }}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                >
                  Today
                </button>
                {allowClear ? (
                  <button
                    type="button"
                    onClick={() => { onChange(''); setOpen(false) }}
                    className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Clear
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </>
          )}
        </div>,
        document.body
      )
    : null

  return (
    <div className={`flex flex-col ${compact ? 'gap-0 h-full' : 'gap-1'} ${className}`} ref={ref}>
      {label && !compact && (
        <label className="text-xs font-semibold text-[var(--color-text-muted)] whitespace-nowrap tracking-wide">{label}</label>
      )}
      <div className={`${compact ? 'h-full' : ''}`}>
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`flex items-center border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all w-full cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 ${
            compact
              ? 'h-full gap-1.5 rounded-xl border-0 pl-2.5 pr-1.5 text-xs font-semibold min-w-0 shadow-none'
              : 'gap-1.5 rounded-lg border-2 pl-3 pr-2 py-2 text-sm min-w-0 w-full sm:min-w-[10rem]'
          }`}
        >
          <Calendar size={compact ? 14 : 16} className="text-indigo-400 flex-shrink-0" />
          <span className={`flex-1 text-left truncate ${!value ? 'text-gray-400 dark:text-gray-500' : ''}`}>{displayValue}</span>
          {value && !compact && allowClear && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange('') }}
              className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
            >
              <X size={14} />
            </span>
          )}
          <ChevronRight size={compact ? 12 : 14} className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {popup}
      </div>
    </div>
  )
}
