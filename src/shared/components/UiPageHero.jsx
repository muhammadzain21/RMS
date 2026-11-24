export default function PageHero({ title, subtitle, icon: Icon, actions, children, className = '', compact = false }) {
  if (compact) {
    return (
      <div className={`page-hero-compact flex flex-wrap items-center justify-between gap-4 ${className}`.trim()}>
        <div className="flex items-center gap-3">
          {Icon ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-muted)] ring-1 ring-[var(--color-border)]">
              <Icon className="h-5 w-5 text-[var(--color-text-primary)]" />
            </div>
          ) : null}
          <div>
            <h2 className="text-xl font-black tracking-tight text-[var(--color-text-primary)]">{title}</h2>
            {subtitle ? <div className="text-sm font-bold text-[var(--color-text-muted)]">{subtitle}</div> : null}
          </div>
        </div>
        {actions ? <div className="page-hero-actions flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        {children}
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-700 px-6 py-8 shadow-2xl text-white ${className}`.trim()}>
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-blue-400/20 blur-3xl" />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {Icon ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md ring-1 ring-white/30">
              <Icon className="h-6 w-6 text-white" />
            </div>
          ) : null}
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h2>
            {subtitle ? (
              <div className="mt-1 flex flex-wrap items-center gap-1 text-sm font-bold text-white sm:text-base">
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="relative z-10 mt-4">{children}</div> : null}
    </div>
  )
}
