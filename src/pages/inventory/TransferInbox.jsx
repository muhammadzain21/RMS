import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PackagePlus, RefreshCw } from 'lucide-react'
import PageHero from '../../components/ui/PageHero.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

/** Branch: one-click receive warehouse transfers into local inventory */
export default function TransferInbox() {
  const { token } = useAuth()
  const { activeBranchId, activeBranch } = useBranch()
  const [list, setList] = useState([])
  const [busyId, setBusyId] = useState('')

  const load = async () => {
    if (!activeBranchId) return
    try {
      const res = await fetch(`${api()}/api/warehouse/transfers?inbox=1&branchId=${encodeURIComponent(activeBranchId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Branch-Id': activeBranchId,
        },
      })
      if (!res.ok) throw new Error('Failed')
      setList(await res.json())
    } catch {
      toast.error('Could not load transfers')
    }
  }

  useEffect(() => { load() }, [token, activeBranchId])

  const receive = async (id) => {
    setBusyId(id)
    try {
      const res = await fetch(`${api()}/api/warehouse/transfers/${id}/receive`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Branch-Id': activeBranchId || '',
        },
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Receive failed')
      toast.success(j.already ? 'Already in inventory' : 'Added to branch inventory')
      load()
    } catch (e) {
      toast.error(e.message || 'Failed')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHero
        title="Stock transfers in"
        subtitle={activeBranch ? `${activeBranch.name} — one click adds warehouse transfer into inventory` : 'Select a branch'}
        icon={PackagePlus}
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="space-y-3">
        {list.map(t => (
          <div key={t._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div>
              <div className="font-bold">Transfer · {t.date || '—'}</div>
              <div className="mt-1 text-sm">{(t.items || []).map(i => `${i.name}×${i.qty} ${i.unit || ''}`).join(', ')}</div>
              {t.notes ? <div className="text-xs text-slate-500">{t.notes}</div> : null}
            </div>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => receive(t._id)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              <PackagePlus size={16} />
              {busyId === t._id ? 'Receiving…' : 'Add to inventory'}
            </button>
          </div>
        ))}
        {!list.length && (
          <div className="rounded-2xl border border-dashed px-4 py-12 text-center text-slate-400">
            No pending warehouse transfers
          </div>
        )}
      </div>
    </div>
  )
}
