/**
 * Rider GPS helpers — prefer a one-shot system "Allow" dialog when phone Location is ON.
 * No need to dig into App Settings unless the user previously chose Block.
 */

export const GEO_OPTS = { enableHighAccuracy: true, maximumAge: 8000, timeout: 25000 }
export const GEO_OPTS_SOFT = { enableHighAccuracy: false, maximumAge: 20000, timeout: 40000 }
export const GEO_OPTS_BG = { enableHighAccuracy: false, maximumAge: 15000, timeout: 35000 }

export function isCapacitor() {
  try {
    return typeof window !== 'undefined' && !!(window.Capacitor || /Capacitor/i.test(navigator.userAgent || ''))
  } catch {
    return false
  }
}

/** Ask once via the normal phone prompt (Allow / Block). Does not open Settings. */
export function requestLocationAccess() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, reason: 'unsupported', message: 'This phone/browser cannot share GPS' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, reason: 'granted', coords: pos.coords }),
      (err) => {
        const code = err?.code
        if (code === 1) {
          resolve({
            ok: false,
            reason: 'denied',
            message: 'Tap Allow when the phone asks for location. If you blocked it earlier, clear site permission once, then open Rider again.',
          })
          return
        }
        if (code === 2) {
          resolve({
            ok: false,
            reason: 'off',
            message: 'Turn ON Location (GPS) on your phone, then try again — no app settings needed.',
          })
          return
        }
        // timeout — Location may still be on; treat as soft fail and keep trying
        resolve({
          ok: false,
          reason: 'timeout',
          message: 'Waiting for GPS… keep Location ON. Sharing will continue automatically.',
          soft: true,
        })
      },
      GEO_OPTS_SOFT
    )
  })
}

/**
 * Start watchPosition. Returns { id, clear } using browser API.
 * Caller must keep wantShare and reconnect on transient errors.
 */
export function watchLocation({ onFix, onError, soft = false, background = false }) {
  if (!navigator.geolocation) {
    onError?.({ code: 2, message: 'GPS unavailable' })
    return { id: null, clear: () => {} }
  }
  const opts = background ? GEO_OPTS_BG : (soft ? GEO_OPTS_SOFT : GEO_OPTS)
  const id = navigator.geolocation.watchPosition(
    (pos) => onFix?.(pos.coords, pos),
    (err) => onError?.(err),
    opts
  )
  return {
    id,
    clear: () => {
      try { navigator.geolocation.clearWatch(id) } catch {}
    },
  }
}

export function getFixOnce(opts = GEO_OPTS_BG) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      () => resolve(null),
      opts
    )
  })
}
