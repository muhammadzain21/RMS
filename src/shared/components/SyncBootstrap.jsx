import { useEffect, useState } from 'react'
import { useAuth } from '@/state/AuthContext.jsx'
import {
  startSyncEngine,
  stopSyncEngine,
  getSyncStatus,
  syncOnce,
  isCloudSyncEnabled,
  getSavedCloudUrl,
} from '@/sync/SyncEngine.js'

/**
 * Starts cloud↔local sync when URL is saved and the sync toggle is on.
 */
export default function SyncBootstrap() {
  const { token } = useAuth()
  const [st, setSt] = useState(() => getSyncStatus())

  useEffect(() => {
    if (!token) {
      stopSyncEngine()
      return
    }
    if (isCloudSyncEnabled() && getSavedCloudUrl()) {
      startSyncEngine(() => token)
    } else {
      stopSyncEngine()
    }
    const onSync = () => setSt(getSyncStatus())
    const onConfig = () => {
      if (isCloudSyncEnabled() && getSavedCloudUrl()) {
        startSyncEngine(() => token)
      } else {
        stopSyncEngine()
      }
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
      if (!token || !isCloudSyncEnabled()) return
      syncOnce(token).then(() => setSt(getSyncStatus())).catch(() => setSt(getSyncStatus()))
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [token])

  // Status chip only when a cloud URL is saved and sync is enabled
  if (!st.cloud || !st.enabled) return null

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
