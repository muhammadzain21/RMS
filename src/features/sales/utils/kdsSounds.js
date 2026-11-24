/** Short Web Audio tones + spoken cue for KDS events. */

function getCtx() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    if (!getCtx._ctx) getCtx._ctx = new AC()
    if (getCtx._ctx.state === 'suspended') getCtx._ctx.resume().catch(() => {})
    return getCtx._ctx
  } catch {
    return null
  }
}

function beep(ctx, { freq = 880, start = 0, dur = 0.16, type = 'sine', gain = 0.18 } = {}) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start)
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(ctx.currentTime + start)
  osc.stop(ctx.currentTime + start + dur + 0.02)
}

function playTone(kind) {
  const ctx = getCtx()
  if (!ctx) return
  try {
    if (kind === 'completed') {
      // Soft descending success chime
      beep(ctx, { freq: 740, start: 0, dur: 0.14, gain: 0.16 })
      beep(ctx, { freq: 554, start: 0.14, dur: 0.2, gain: 0.14 })
    } else {
      // Bright "new order" double ding
      beep(ctx, { freq: 880, start: 0, dur: 0.14, gain: 0.2 })
      beep(ctx, { freq: 1175, start: 0.15, dur: 0.18, gain: 0.18 })
    }
  } catch {}
}

function speak(text) {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    u.pitch = 1
    u.volume = 1
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch {}
}

/** @param {'new'|'completed'} kind */
export function playKdsAlert(kind = 'new') {
  playTone(kind)
  speak(kind === 'completed' ? 'Order completed' : 'New order')
}
