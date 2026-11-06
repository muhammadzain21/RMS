export default function PageHero({ title, subtitle, icon: Icon, actions, children, className = '' }) {
  return (
    <div className={`page-hero-compact flex flex-wrap items-center justify-between gap-4 ${className}`.trim()}>
      <div className="flex items-center gap-3">
        {Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-muted)] ring-1 ring-[var(--color-border)]">
            <Icon className="h-5 w-5 text-[var(--color-text-primary)]" />
          </div>
        ) : null}
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">{title}</h2>
          {subtitle ? <div className="text-xs font-medium text-[var(--color-text-muted)]">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      {children}
    </div>
  )
}
