import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromISO(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DatePicker({ label, value, onChange, placeholder = 'Select date', min, max, className = '' }) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const d = fromISO(value)
    return d || new Date()
  })
  const ref = useRef(null)
  const popRef = useRef(null)

  const selected = fromISO(value)
  const minDate = fromISO(min)
  const maxDate = fromISO(max)
  const todayISO = toISO(new Date())

  useEffect(() => {
    if (open && value) {
      const d = fromISO(value)
      if (d) setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
    }
  }, [open, value])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
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

  const selectDate = (d) => {
    if (isDisabled(d)) return
    onChange(toISO(d))
    setOpen(false)
  }

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))

  const displayValue = value ? (() => {
    const d = fromISO(value)
    if (!d) return placeholder
    return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`
  })() : placeholder

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={ref}>
      {label && (
        <label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap tracking-wide">{label}</label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 pl-3 pr-2 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all w-full cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 min-w-[10rem]"
        >
          <Calendar size={16} className="text-indigo-400 flex-shrink-0" />
          <span className={`flex-1 text-left ${!value ? 'text-gray-400 dark:text-gray-500' : ''}`}>{displayValue}</span>
          {value && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange('') }}
              className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
            >
              <X size={14} />
            </span>
          )}
          <ChevronRight size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>

        {open && (
          <div
            ref={popRef}
            className="absolute z-50 mt-1 p-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border-2 border-indigo-200 dark:border-indigo-700 min-w-[18rem] left-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-400 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="font-semibold text-sm text-gray-800 dark:text-gray-100">
                {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </div>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-400 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
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
                        ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md scale-105'
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

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => { onChange(todayISO); setOpen(false) }}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
