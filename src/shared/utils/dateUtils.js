// Date utility helpers for handling local timezone dates
// Fixes issues when system timezone differs from local business timezone

/**
 * Get today's date as YYYY-MM-DD in LOCAL timezone
 * Unlike toISOString() which returns UTC date, this respects system local time
 */
export function getLocalDateString(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get current time as 12-hour clock in LOCAL timezone (e.g. "2:30 PM")
 */
export function getLocalTimeString(date = new Date()) {
  return formatClock12(date)
}

/**
 * Format a Date / ISO / timestamp as 12-hour clock.
 * @param {Date|string|number} value
 * @param {{ withSeconds?: boolean }} [opts]
 * @returns {string} e.g. "2:30 PM" or "2:30:05 PM"
 */
export function formatClock12(value, opts = {}) {
  if (value == null || value === '') return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const withSeconds = !!opts.withSeconds
  try {
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    })
  } catch {
    return ''
  }
}

/**
 * Format date + 12-hour time for UI / reports.
 * @param {Date|string|number} value
 * @param {{ withSeconds?: boolean }} [opts]
 * @returns {string} e.g. "2026-11-16 2:30 PM"
 */
export function formatDateTime12(value, opts = {}) {
  if (value == null || value === '') return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const datePart = getLocalDateString(d)
  const timePart = formatClock12(d, opts)
  return timePart ? `${datePart} ${timePart}` : datePart
}

/**
 * Get business date based on cutoff hour (default 4 AM)
 * Times before cutoff belong to previous business day
 * Uses LOCAL timezone
 */
export function getBusinessDate(date = new Date(), cutoffHour = 4) {
  const d = new Date(date);
  const hour = d.getHours();

  if (hour < cutoffHour) {
    d.setDate(d.getDate() - 1);
  }

  return getLocalDateString(d);
}

/**
 * Format a date to YYYY-MM-DD regardless of input type
 * Accepts Date object, ISO string, or date string
 */
export function formatDateYMD(dateInput) {
  if (!dateInput) return getLocalDateString();
  const d = new Date(dateInput);
  return getLocalDateString(d);
}

/**
 * Convert 24-hour time (HH:mm or HH:mm:ss) to 12-hour format (h:mm AM/PM)
 * @param {string} time24 - Time in 24-hour format like "09:00", "14:30", or "14:30:00"
 * @returns {string} Time in 12-hour format like "9:00 AM" or "2:30 PM"
 */
export function formatTime12(time24) {
  if (time24 == null || time24 === '') return '';
  const raw = String(time24).trim();
  if (!raw || raw === '-') return raw === '-' ? '-' : '';
  // Already 12-hour
  if (/am|pm/i.test(raw)) return raw.replace(/\s+/g, ' ').trim();

  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) return raw;

  let hours = Number(m[1]);
  const minutes = m[2];
  if (Number.isNaN(hours)) return raw;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

/**
 * Convert 12-hour time (h:mm AM/PM) to 24-hour format (HH:mm)
 * @param {string} time12 - Time in 12-hour format like "9:00 AM" or "2:30 PM"
 * @returns {string} Time in 24-hour format like "09:00" or "14:30"
 */
export function parseTime12(time12) {
  if (!time12) return '';
  const match = String(time12).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time12; // Return as-is if not matching expected format
  let [, hours, minutes, period] = match;
  hours = parseInt(hours, 10);
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}
