import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Try to load .env from multiple possible locations
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config()
dotenv.config({ path: path.join(__dirname, '../../.env') })
dotenv.config({ path: path.join(__dirname, '../../../.env') })

// Mutable runtime config — populated from DB only (no .env fallback for biometric)
export const env = {
  BIOMETRIC_ENABLED: false,
  BIOMETRIC_IP: '',
  BIOMETRIC_PORT: 4370,
  BIOMETRIC_DEVICE_ID: 'ZK-01',
  BIOMETRIC_COMM_PASSWORD: 0,
  BIOMETRIC_POLL_INTERVAL_MS: 120000,
  BIOMETRIC_DUPLICATE_WINDOW_SEC: 60,
}

function applyConfig(cfg) {
  if (!cfg) return
  if (typeof cfg.enabled === 'boolean') env.BIOMETRIC_ENABLED = cfg.enabled
  if (cfg.ip !== undefined) env.BIOMETRIC_IP = cfg.ip
  if (cfg.port !== undefined) env.BIOMETRIC_PORT = Number(cfg.port) || 4370
  if (cfg.deviceId !== undefined) env.BIOMETRIC_DEVICE_ID = cfg.deviceId
  if (cfg.commPassword !== undefined) env.BIOMETRIC_COMM_PASSWORD = Number(cfg.commPassword) || 0
  if (cfg.pollIntervalMs !== undefined) env.BIOMETRIC_POLL_INTERVAL_MS = Number(cfg.pollIntervalMs) || 120000
  if (cfg.duplicateWindowSec !== undefined) env.BIOMETRIC_DUPLICATE_WINDOW_SEC = Number(cfg.duplicateWindowSec) || 60
}

// Load from DB once at startup (best-effort)
;(async () => {
  try {
    const BiometricConfig = (await import('../models/BiometricConfig.js')).default
    const cfg = await BiometricConfig.findOne({}, {}, { sort: { updatedAt: -1, createdAt: -1 } }).lean()
    if (cfg) applyConfig(cfg)
  } catch (e) {
    console.log('[env] BiometricConfig not yet available, using defaults:', e?.message || '')
  }
})()

export async function reloadBiometricConfig() {
  try {
    const BiometricConfig = (await import('../models/BiometricConfig.js')).default
    const cfg = await BiometricConfig.findOne({}, {}, { sort: { updatedAt: -1, createdAt: -1 } }).lean()
    if (cfg) applyConfig(cfg)
  } catch {
    // Keep current env values if DB is unreachable
  }
}

console.log('[env] Biometric config (initial):', {
  enabled: env.BIOMETRIC_ENABLED,
  ip: env.BIOMETRIC_IP || '(not set)',
  port: env.BIOMETRIC_PORT,
  deviceId: env.BIOMETRIC_DEVICE_ID,
})
