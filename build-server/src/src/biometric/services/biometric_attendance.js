import { env } from '../../config/env.js'
import { BiometricEvent } from '../models/BiometricEvent.js'
import { BiometricMapping } from '../models/BiometricMapping.js'
import Attendance from '../../models/Attendance.js'
import Staff from '../../models/Staff.js'
import StaffSettings from '../../models/StaffSettings.js'
import Settings from '../../models/Settings.js'

function dateIsoLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function hhmmLocal(d) {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function timeToMinutes(timeStr) {
  const [hh, mm] = timeStr.split(':').map(Number)
  return hh * 60 + mm
}

// Calculate business date based on cutoff hour
// If current time is before cutoff (e.g., 4 AM), business date is previous day
function getBusinessDate(timestamp, cutoffHour = 4) {
  const d = new Date(timestamp)
  const hour = d.getHours()
  
  // If before cutoff hour, business date is previous calendar day
  if (hour < cutoffHour) {
    const prevDay = new Date(d)
    prevDay.setDate(prevDay.getDate() - 1)
    return dateIsoLocal(prevDay)
  }
  
  return dateIsoLocal(d)
}

async function calculateAttendanceStatus(checkInTime, staffId) {
  try {
    const settings = await StaffSettings.findOne().lean()
    if (!settings) return { status: 'Present', lateMinutes: 0 }

    const lateThreshold = settings.lateThresholdMinutes || 15

    // Get staff and their shift
    const staff = await Staff.findById(staffId).lean()
    let standardCheckIn = '09:00' // fallback

    if (staff?.shiftId && settings.shifts?.length > 0) {
      const shift = settings.shifts.find(s => s.id === staff.shiftId)
      if (shift?.checkIn) {
        standardCheckIn = shift.checkIn
        console.log('[biometric] Using staff shift:', { shiftId: staff.shiftId, checkIn: shift.checkIn, checkOut: shift.checkOut })
      } else {
        console.log('[biometric] Staff shiftId not found in shifts, using default:', staff.shiftId)
      }
    } else {
      console.log('[biometric] No shiftId for staff, using default 09:00')
    }

    let checkInMinutes = timeToMinutes(checkInTime)
    const standardMinutes = timeToMinutes(standardCheckIn)

    // Handle night shifts: if standard check-in is evening (after 12 PM)
    // and actual check-in is early morning (before 6 AM), add 24 hours to check-in
    if (standardMinutes >= 720 && checkInMinutes < 360) { // standard >= 12:00, check-in < 6:00
      checkInMinutes += 1440 // Add 24 hours
    }

    const graceEndMinutes = standardMinutes + lateThreshold

    // If check-in is before or within grace period of standard time → Present
    if (checkInMinutes <= graceEndMinutes) {
      return { status: 'Present', lateMinutes: 0 }
    }

    // If check-in is after grace period → Late
    if (checkInMinutes > graceEndMinutes) {
      const lateMinutes = checkInMinutes - standardMinutes
      return { status: 'Late', lateMinutes }
    }

    return { status: 'Present', lateMinutes: 0 }
  } catch (e) {
    console.error('[biometric] Error calculating status:', e?.message)
    return { status: 'Present', lateMinutes: 0 }
  }
}

export async function processBiometricEvent(input) {
  const ts = input.timestamp
  console.log('[biometric] Processing event:', { deviceId: input.deviceId, enrollId: input.enrollId, ts: ts?.toISOString(), attState: input.attState })

  if (!input.deviceId || !input.enrollId || !(ts instanceof Date) || Number.isNaN(ts.getTime())) {
    console.log('[biometric] Invalid payload:', { deviceId: input.deviceId, enrollId: input.enrollId, ts })
    return { ok: false, reason: 'invalid_payload' }
  }

  // Get business date cutoff hour from Settings
  const appSettings = await Settings.findOne().lean()
  const cutoffHour = appSettings?.businessDayCutoffHour ?? 4
  
  // Use business date (shifts crossing midnight belong to previous day)
  const date = getBusinessDate(ts, cutoffHour)
  const time = hhmmLocal(ts)
  console.log('[biometric] Parsed date/time:', { date, time, cutoffHour, calendarDate: dateIsoLocal(ts) })

  const mapping = await BiometricMapping.findOne({ deviceId: input.deviceId, enrollId: input.enrollId, active: true }).lean()
  console.log('[biometric] Mapping lookup result:', { found: !!mapping, staffId: mapping?.staffId })

  if (!mapping) {
    console.log('[biometric] No mapping found for enrollId:', input.enrollId)
    try {
      await BiometricEvent.create({
        deviceId: input.deviceId,
        enrollId: input.enrollId,
        timestamp: ts,
        date,
        time,
        type: 'unknown_enroll',
        raw: input.raw,
      })
    } catch {}
    return { ok: true, mapped: false }
  }

  const staffId = String(mapping.staffId)
  console.log('[biometric] Found staffId:', staffId)

  const staff = await Staff.findById(staffId).lean()
  console.log('[biometric] Staff lookup:', { found: !!staff, name: staff?.name })

  if (!staff) {
    console.log('[biometric] Staff not found for staffId:', staffId)
    return { ok: true, mapped: false, reason: 'staff_not_found' }
  }

  // Attendance lookup for the day
  let att = await Attendance.findOne({ staffId, date }).lean()
  console.log('[biometric] Attendance lookup:', { found: !!att, existingClockIn: att?.checkIn, existingClockOut: att?.clockOut })

  let eventType = 'check_in'
  let status = 'Present'
  let update = { staffId, staffName: staff.name, date }

  // Determine event type from device attState if available (0=check-in, 1=check-out)
  // Otherwise fall back to auto-detection based on current attendance state
  const attState = input.attState
  const isCheckIn = attState === 0 || attState === '0'
  const isCheckOut = attState === 1 || attState === '1'
  const useAutoDetect = attState === null || attState === undefined

  console.log('[biometric] Determining event type:', { 
    hasAtt: !!att, 
    hasClockIn: !!att?.checkIn, 
    hasClockOut: !!att?.clockOut,
    attState,
    isCheckIn,
    isCheckOut,
    useAutoDetect 
  })

  // Handle Check-In mode
  if (isCheckIn || (useAutoDetect && (!att || !att.checkIn))) {
    // If already checked in today, ignore duplicate
    if (att?.checkIn) {
      console.log('[biometric] Already checked in - ignoring duplicate check-in')
      try {
        await BiometricEvent.create({
          deviceId: input.deviceId,
          enrollId: input.enrollId,
          staffId,
          timestamp: ts,
          date,
          time,
          type: 'ignored_duplicate_checkin',
          raw: input.raw,
        })
      } catch {}
      return { ok: true, mapped: true, ignored: true, reason: 'already_checked_in' }
    }

    // Calculate status based on check-in time using staff's shift
    const statusResult = await calculateAttendanceStatus(time, staffId)
    status = statusResult.status
    console.log('[biometric] Calculated status:', { checkIn: time, status, lateMinutes: statusResult.lateMinutes })

    update.checkIn = time
    update.status = status
    update.lateMinutes = statusResult.lateMinutes || 0
    eventType = 'check_in'
    console.log('[biometric] Will record CHECK_IN at time:', time, 'with status:', status, 'lateMinutes:', update.lateMinutes)
  }
  // Handle Check-Out mode
  else if (isCheckOut || (useAutoDetect && att?.checkIn && !att?.checkOut)) {
    // If not checked in yet, ignore check-out
    if (!att?.checkIn) {
      console.log('[biometric] No check-in found - ignoring check-out')
      try {
        await BiometricEvent.create({
          deviceId: input.deviceId,
          enrollId: input.enrollId,
          staffId,
          timestamp: ts,
          date,
          time,
          type: 'ignored_checkout_no_checkin',
          raw: input.raw,
        })
      } catch {}
      return { ok: true, mapped: true, ignored: true, reason: 'no_checkin' }
    }

    // If already checked out, ignore duplicate
    if (att?.checkOut) {
      console.log('[biometric] Already checked out - ignoring duplicate check-out')
      try {
        await BiometricEvent.create({
          deviceId: input.deviceId,
          enrollId: input.enrollId,
          staffId,
          timestamp: ts,
          date,
          time,
          type: 'ignored_duplicate_checkout',
          raw: input.raw,
        })
      } catch {}
      return { ok: true, mapped: true, ignored: true, reason: 'already_checked_out' }
    }

    // Record clock-out - no time restrictions
    const settings = await StaffSettings.findOne().lean()
    
    // Get staff's shift checkout time (same logic as check-in)
    let standardCheckOut = '18:00' // fallback
    if (staff?.shiftId && settings?.shifts?.length > 0) {
      const shift = settings.shifts.find(s => s.id === staff.shiftId)
      if (shift?.checkOut) {
        standardCheckOut = shift.checkOut
        console.log('[biometric] Using staff shift checkout:', { shiftId: staff.shiftId, checkOut: shift.checkOut })
      } else {
        console.log('[biometric] Staff shiftId not found in shifts for checkout, using default:', staff.shiftId)
      }
    } else {
      console.log('[biometric] No shiftId for staff checkout, using default 18:00')
    }
    
    let scanMinutes = timeToMinutes(time)
    let checkoutMinutes = timeToMinutes(standardCheckOut)

    // Handle night shifts: if standard checkout is early morning (before 6 AM)
    // and actual checkout is evening (after 6 PM), add 24 hours to standard
    if (checkoutMinutes < 360 && scanMinutes >= 720) { // checkout < 6:00, scan >= 12:00
      checkoutMinutes += 1440 // Add 24 hours for proper comparison
    }

    // Calculate early out minutes if leaving before standard checkout
    let earlyOutMinutes = 0
    if (scanMinutes < checkoutMinutes) {
      earlyOutMinutes = checkoutMinutes - scanMinutes
    }

    update.checkOut = time
    update.earlyOutMinutes = earlyOutMinutes
    eventType = 'check_out'
    console.log('[biometric] Will record CHECK_OUT at time:', time, 'earlyOutMinutes:', earlyOutMinutes)
  }
  // Both already set: ignore extra scans
  else if (att?.checkIn && att?.checkOut) {
    // Both already set: ignore extra scans
    console.log('[biometric] Both clockIn and clockOut already exist - ignoring as duplicate')
    try {
      await BiometricEvent.create({
        deviceId: input.deviceId,
        enrollId: input.enrollId,
        staffId,
        timestamp: ts,
        date,
        time,
        type: 'ignored_duplicate',
        raw: input.raw,
      })
    } catch {}
    return { ok: true, mapped: true, ignored: true }
  }

  // Duplicate filtering: only ignore repeats of the same eventType within the duplicate window
  const windowMs = Math.max(0, Number(env.BIOMETRIC_DUPLICATE_WINDOW_SEC || 0)) * 1000
  console.log('[biometric] Duplicate window check:', { windowMs, eventType })

  if (windowMs > 0) {
    const since = new Date(ts.getTime() - windowMs)
    const recentSameType = await BiometricEvent.findOne({ staffId, date, type: eventType, timestamp: { $gte: since, $lte: ts } })
      .sort({ timestamp: -1 })
      .lean()
    console.log('[biometric] Recent same type check:', { found: !!recentSameType })
    if (recentSameType) {
      console.log('[biometric] Duplicate detected - ignoring')
      try {
        await BiometricEvent.create({
          deviceId: input.deviceId,
          enrollId: input.enrollId,
          staffId,
          timestamp: ts,
          date,
          time,
          type: 'ignored_duplicate',
          raw: input.raw,
        })
      } catch {}
      return { ok: true, mapped: true, ignored: true }
    }
  }

  const attendanceKey = att ? { staffId, date } : { staffId, date }
  console.log('[biometric] Updating attendance with:', { attendanceKey, update })
  const updateResult = await Attendance.findOneAndUpdate(attendanceKey, { $set: update }, { new: true, upsert: true })
  console.log('[biometric] Attendance update result:', { success: !!updateResult, _id: updateResult?._id })

  try {
    const eventRecord = await BiometricEvent.create({
      deviceId: input.deviceId,
      enrollId: input.enrollId,
      staffId,
      timestamp: ts,
      date,
      time,
      type: eventType,
      raw: input.raw,
    })
    console.log('[biometric] Event recorded successfully:', { eventId: eventRecord?._id, type: eventType })
  } catch (e) {
    console.error('[biometric] Failed to record event:', e?.message)
  }

  console.log('[biometric] Process completed:', { type: eventType, ok: true })
  return { ok: true, mapped: true, type: eventType }
}
