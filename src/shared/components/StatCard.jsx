/** Dashboard-style KPI widget — reuse on list pages. */
export default function StatCard({ title, value, icon: Icon, iconColor = 'bg-blue-500' }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-body)]">{title}</span>
          <div className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] truncate">{value}</div>
        </div>
        {Icon ? (
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconColor} text-white shadow-md`}>
            <Icon className="h-6 w-6" />
          </div>
        ) : null}
      </div>
      <div className="absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-slate-50 opacity-50 dark:bg-slate-800" />
    </div>
  )
}
