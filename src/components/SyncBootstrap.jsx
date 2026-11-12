import { useEffect, useState } from 'react'
import { useAuth } from '../state/AuthContext.jsx'
import { startSyncEngine, stopSyncEngine, getSyncStatus, syncOnce } from '../sync/SyncEngine.js'

/**
 * Starts cloud↔local sync when localStorage.cloud_sync_url is set
 * and differs from the local API base.
 */
export default function SyncBootstrap() {
  const { token } = useAuth()
  const [st, setSt] = useState(() => getSyncStatus())

  useEffect(() => {
    if (!token) {
      stopSyncEngine()
      return
    }
    startSyncEngine(() => token)
    const onSync = () => setSt(getSyncStatus())
    const onConfig = () => {
      startSyncEngine(() => token)
      setSt(getSyncStatus())
    }
    window.addEventListener('epicspire:sync', onSync)
    window.addEventListener('cloud_sync_config_changed', onConfig)
    return () => {
      window.removeEventListener('epicspire:sync', onSync)
      window.removeEventListener('cloud_sync_config_changed', onConfig)
      stopSyncEngine()
    }
  }, [token])

  useEffect(() => {
    const onOnline = () => {
      if (!token) return
      syncOnce(token).then(() => setSt(getSyncStatus())).catch(() => setSt(getSyncStatus()))
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [token])

  // Tiny status chip only when cloud sync is configured
  if (!st.cloud) return null

  const offline = !!st.offline
  const title = offline
    ? 'Offline — will sync when internet returns'
    : (st.lastError || (st.lastOkAt ? `Last sync ${st.lastOkAt}` : 'Cloud sync ready'))

  return (
    <button
      type="button"
      title={title}
      onClick={() => token && syncOnce(token).then(() => setSt(getSyncStatus()))}
      className={`fixed bottom-3 right-3 z-40 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-lg ${
        offline ? 'bg-amber-500 text-white' : st.lastError ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
      }`}
    >
      {st.busy ? 'Syncing…' : offline ? 'Offline' : st.lastError ? 'Sync error' : 'Cloud sync'}
    </button>
  )
}
