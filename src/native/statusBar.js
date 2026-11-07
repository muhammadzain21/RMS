/** Ensure Android/iOS status bar does not cover header buttons. */
export async function setupNativeChrome() {
  try {
    const isCap =
      typeof window !== 'undefined' &&
      !!(window.Capacitor || /Capacitor/i.test(navigator.userAgent))
    if (isCap) {
      document.documentElement.classList.add('capacitor-native')
    }
    try {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator?.standalone) {
        document.documentElement.classList.add('standalone-pwa')
      }
    } catch {}

    if (!isCap) return

    const { StatusBar, Style } = await import('@capacitor/status-bar')
    try {
      await StatusBar.setOverlaysWebView({ overlay: false })
    } catch {}
    try {
      await StatusBar.setBackgroundColor({ color: '#1d4ed8' })
    } catch {}
    try {
      await StatusBar.setStyle({ style: Style.Dark })
    } catch {}
    try {
      await StatusBar.show()
    } catch {}
  } catch {
    // Plugin may be unavailable in browser / Electron
  }
}
