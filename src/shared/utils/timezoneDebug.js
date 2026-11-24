// Timezone debugging utility
// Run this in browser console on the Pakistan system to diagnose timezone issues

export function debugTimezone() {
  const now = new Date();
  
  const debug = {
    // System info
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: now.getTimezoneOffset(), // in minutes from UTC
    
    // Date using various methods
    toISOString: now.toISOString(),
    toLocaleDateString: now.toLocaleDateString('en-CA'),
    toLocaleStringPK: now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }),
    
    // Component getters (local)
    localYear: now.getFullYear(),
    localMonth: now.getMonth() + 1,
    localDate: now.getDate(),
    localHours: now.getHours(),
    localMinutes: now.getMinutes(),
    
    // Component getters (UTC)
    utcYear: now.getUTCFullYear(),
    utcMonth: now.getUTCMonth() + 1,
    utcDate: now.getUTCDate(),
    utcHours: now.getUTCHours(),
    
    // Formatted local date
    localFormatted: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  };
  
  console.table(debug);
  return debug;
}

// Also export a simple check function
export function getSystemTimezoneInfo() {
  const now = new Date();
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: now.getTimezoneOffset(),
    localDate: now.toLocaleDateString('en-CA'),
    isoDate: now.toISOString().slice(0, 10),
    hour: now.getHours(),
  };
}
