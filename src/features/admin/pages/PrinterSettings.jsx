import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2, Printer, RefreshCw, Save, Wifi } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/state/AuthContext.jsx'
import { useBranch } from '@/state/BranchContext.jsx'
import { useData } from '@/state/DataContext.jsx'

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all'

function StatusBadge({ check, checking }) {
  if (checking) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Loader2 size={12} className="animate-spin" /> Checking…
      </span>
    )
  }
  if (!check) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800">
        Not checked
      </span>
    )
  }
  if (check.reachable) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 size={12} /> Connected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
      <CircleAlert size={12} /> Not reachable
    </span>
  )
}

function PrinterCard({
  title,
  nameLabel,
  name,
  onNameChange,
  ip,
  onIpChange,
  showIp,
  check,
  checking,
  onCheck,
  onUseInstalled,
  installed,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        <StatusBadge check={check} checking={checking} />
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{nameLabel}</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Paste exact name from Devices and Printers"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {showIp ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Network IP (TCP 9100)
            </label>
            <div className="relative">
              <Wifi size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputClass} pl-9`}
                value={ip}
                onChange={(e) => onIpChange(e.target.value)}
                placeholder="192.168.x.x"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
        ) : null}

        {installed?.length ? (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Installed on this PC</div>
            <div className="flex flex-wrap gap-2">
              {installed.map((p) => {
                const label = p.name || p.displayName || p.deviceName || ''
                if (!label) return null
                const active = String(name || '').trim().toLowerCase() === label.toLowerCase()
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onUseInstalled(label)}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                    title={label}
                  >
                    {label}{p.isDefault ? ' · Default' : ''}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {check?.message ? (
          <p className={`text-sm ${check.reachable ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
            {check.message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCheck}
            disabled={checking || (!String(name || '').trim() && !String(ip || '').trim())}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Check connection
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PrinterSettings() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { activeBranch, activeBranchId, isAllBranches, requireBranch } = useBranch()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const branchLabel = activeBranch?.name || activeBranch?.code || ''

  const [form, setForm] = useState({
    billPrinterName: '',
    kotPrinterName: '',
    kotPrinterIp: '',
    voidPrinterName: '',
    voidPrinterIp: '',
  })
  const [installed, setInstalled] = useState([])
  const [saving, setSaving] = useState(false)
  const [checks, setChecks] = useState({ bill: null, kot: null, void: null })
  const [checking, setChecking] = useState({ bill: false, kot: false, void: false })

  const applyFromSettings = useCallback((ns = {}) => {
    setForm({
      billPrinterName: ns.billPrinterName || '',
      kotPrinterName: ns.kotPrinterName || '',
      kotPrinterIp: ns.kotPrinterIp || '',
      voidPrinterName: ns.voidPrinterName || '',
      voidPrinterIp: ns.voidPrinterIp || '',
    })
  }, [])

  useEffect(() => {
    const ns = state.settings || {}
    if (activeBranchId && ns.branchId && String(ns.branchId) !== String(activeBranchId)) return
    applyFromSettings(ns)
  }, [state.settings, activeBranchId, applyFromSettings])

  const loadInstalled = useCallback(async () => {
    try {
      if (window?.printing?.listPrinters) {
        const list = await window.printing.listPrinters()
        setInstalled(Array.isArray(list) ? list : [])
        return
      }
      const res = await fetch(`${API}/api/print/printers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) setInstalled(await res.json())
    } catch {
      setInstalled([])
    }
  }, [API, token])

  useEffect(() => {
    loadInstalled()
  }, [loadInstalled])

  const headers = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeBranchId ? { 'X-Branch-Id': String(activeBranchId) } : {}),
  })

  const runCheck = async (key, deviceName, host) => {
    const name = String(deviceName || '').trim()
    const ip = String(host || '').trim()
    if (!name && !ip) {
      setChecks((c) => ({ ...c, [key]: null }))
      return null
    }
    setChecking((c) => ({ ...c, [key]: true }))
    try {
      let result
      if (window?.printing?.checkPrinter) {
        result = await window.printing.checkPrinter({ deviceName: name, host: ip })
      } else {
        // Browser fallback: only IP can be probed via server ESC/POS settings presence
        const listRes = await fetch(`${API}/api/print/printers`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch(() => null)
        const list = listRes?.ok ? await listRes.json() : []
        const found = name
          ? (Array.isArray(list) ? list : []).some((p) => {
            const n = String(p.name || p.deviceName || '').trim().toLowerCase()
            return n === name.toLowerCase()
          })
          : false
        result = {
          ok: true,
          found,
          reachable: found || Boolean(ip),
          message: found
            ? `Found in printer list${ip ? ` · IP ${ip}` : ''}`
            : (ip
              ? `Browser mode: saved IP ${ip} (open Electron app to verify Windows printer name)`
              : `Printer "${name}" not in list — use Electron app for full check`),
        }
      }
      setChecks((c) => ({ ...c, [key]: result }))
      return result
    } catch (e) {
      const result = { ok: false, reachable: false, message: e?.message || 'Check failed' }
      setChecks((c) => ({ ...c, [key]: result }))
      return result
    } finally {
      setChecking((c) => ({ ...c, [key]: false }))
    }
  }

  // Auto-check saved printer names whenever form values settle after load/save
  useEffect(() => {
    const t = setTimeout(() => {
      if (form.billPrinterName) runCheck('bill', form.billPrinterName, '')
      if (form.kotPrinterName || form.kotPrinterIp) runCheck('kot', form.kotPrinterName, form.kotPrinterIp)
      if (form.voidPrinterName || form.voidPrinterIp) runCheck('void', form.voidPrinterName || form.kotPrinterName, form.voidPrinterIp || form.kotPrinterIp)
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.billPrinterName, form.kotPrinterName, form.kotPrinterIp, form.voidPrinterName, form.voidPrinterIp])

  const save = async () => {
    if (!requireBranch('Select a branch in the header to edit printer settings')) return
    setSaving(true)
    try {
      const payload = {
        billPrinterName: String(form.billPrinterName || '').trim(),
        kotPrinterName: String(form.kotPrinterName || '').trim(),
        kotPrinterIp: String(form.kotPrinterIp || '').trim(),
        voidPrinterName: String(form.voidPrinterName || '').trim(),
        voidPrinterIp: String(form.voidPrinterIp || '').trim(),
      }
      const res = await fetch(`${API}/api/settings`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(payload),
      })
      const saved = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(saved.error || 'Failed to save')
      dispatch({ type: 'HYDRATE', payload: { settings: { ...saved, branchId: saved.branchId || activeBranchId } } })
      applyFromSettings(saved)
      toast.success(`Printer settings saved${branchLabel ? ` (${branchLabel})` : ''}`)

      await Promise.all([
        runCheck('bill', payload.billPrinterName, ''),
        runCheck('kot', payload.kotPrinterName, payload.kotPrinterIp),
        runCheck('void', payload.voidPrinterName || payload.kotPrinterName, payload.voidPrinterIp || payload.kotPrinterIp),
      ])
    } catch (e) {
      toast.error(e.message || 'Failed to save printer settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 shadow-lg dark:bg-white">
            <Printer className="text-white dark:text-slate-900" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Printers</h1>
            {branchLabel ? <p className="text-sm text-gray-500">{branchLabel}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadInstalled}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw size={14} /> Refresh list
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || isAllBranches}
            className="ui-btn ui-btn-primary inline-flex items-center gap-2 px-4 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save Settings
          </button>
        </div>
      </div>

      {isAllBranches ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          Select a branch in the header to edit printer settings.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PrinterCard
          title="Bill slip"
          nameLabel="Printer name"
          name={form.billPrinterName}
          onNameChange={(v) => setForm((f) => ({ ...f, billPrinterName: v }))}
          showIp={false}
          ip=""
          onIpChange={() => {}}
          check={checks.bill}
          checking={checking.bill}
          onCheck={() => runCheck('bill', form.billPrinterName, '')}
          onUseInstalled={(label) => setForm((f) => ({ ...f, billPrinterName: label }))}
          installed={installed}
        />
        <PrinterCard
          title="KOT slip"
          nameLabel="Printer name"
          name={form.kotPrinterName}
          onNameChange={(v) => setForm((f) => ({ ...f, kotPrinterName: v }))}
          showIp
          ip={form.kotPrinterIp}
          onIpChange={(v) => setForm((f) => ({ ...f, kotPrinterIp: v.trim() }))}
          check={checks.kot}
          checking={checking.kot}
          onCheck={() => runCheck('kot', form.kotPrinterName, form.kotPrinterIp)}
          onUseInstalled={(label) => setForm((f) => ({ ...f, kotPrinterName: label }))}
          installed={installed}
        />
        <PrinterCard
          title="Void slip"
          nameLabel="Printer name (blank = use KOT)"
          name={form.voidPrinterName}
          onNameChange={(v) => setForm((f) => ({ ...f, voidPrinterName: v }))}
          showIp
          ip={form.voidPrinterIp}
          onIpChange={(v) => setForm((f) => ({ ...f, voidPrinterIp: v.trim() }))}
          check={checks.void}
          checking={checking.void}
          onCheck={() => runCheck('void', form.voidPrinterName || form.kotPrinterName, form.voidPrinterIp || form.kotPrinterIp)}
          onUseInstalled={(label) => setForm((f) => ({ ...f, voidPrinterName: label }))}
          installed={installed}
        />
      </div>
    </div>
  )
}
