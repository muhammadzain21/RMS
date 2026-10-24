import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.epicspire.rms',
  appName: 'Epicspire RMS',
  webDir: 'dist',
  server: {
    // Use capacitor:// scheme for Android, allow cleartext for local network HTTP
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#f97316',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#f97316',
    },
  },
}

export default config
