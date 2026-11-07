/** Shared Call Center order status labels + styles (HQ queue + branch inbox). */

export const CC_STATUS_LABEL = {
  pending: 'Pending',
  accepted: 'In cart',
  kot_created: 'KOT sent',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export const CC_STATUS_STYLE = {
  pending: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700',
  accepted: 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-900/40 dark:text-sky-100 dark:border-sky-700',
  kot_created: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-100 dark:border-indigo-700',
  preparing: 'bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-900/40 dark:text-violet-100 dark:border-violet-700',
  ready: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-700',
  completed: 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-500',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-100 dark:border-rose-700',
  expired: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600',
}

export function ccStatusLabel(status) {
  const key = String(status || '').trim()
  return CC_STATUS_LABEL[key] || (key ? key.replace(/_/g, ' ') : '—')
}

export function ccStatusStyle(status) {
  const key = String(status || '').trim()
  return CC_STATUS_STYLE[key] || 'bg-slate-100 text-slate-600 border-slate-200'
}
