// Shared per-staff monthly salary computation — same logic used by
// MonthlyViewTab (single staff detail) and PayrollTab (all staff list).
// attendance: array of attendance records for the month scope
// settings: staff settings (bonusPerDay, deductionPer*, absentChargesEnabled)
// month: 'YYYY-MM', businessDate: 'YYYY-MM-DD'
export function computeStaffMonth(st, attendance, settings, month, businessDate) {
  if (!st) return null
  const join = st.joinDate || '0000-00-00'
  const todayStr = businessDate
    ? String(businessDate).slice(0, 10)
    : (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` })()
  const [y, m] = String(month || '').split('-').map(Number)
  if (!y || !m) return null

  const raw = (attendance || []).filter(r => String(r.staffId) === String(st.id) && String(r.date || '').startsWith(month))
  const byDate = new Map(raw.map(r => [r.date, r]))

  const records = []
  const last = new Date(y, m, 0).getDate()
  for (let day = 1; day <= last; day++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (ds < join || ds > todayStr) continue
    records.push(byDate.get(ds) || {
      id: `absent-${ds}`, date: ds, status: 'Absent',
      checkIn: '', checkOut: '', lateMinutes: 0, earlyOutMinutes: 0,
    })
  }

  const counts = { present: 0, absent: 0, late: 0, leave: 0, earlyOutDays: 0, totalLateMinutes: 0, totalEarlyOutMinutes: 0 }
  records.forEach(r => {
    if (r.status === 'Present') counts.present++
    else if (r.status === 'Absent') counts.absent++
    else if (r.status === 'Late') { counts.late++; counts.totalLateMinutes += Number(r.lateMinutes || 0) }
    else if (r.status === 'Leave') counts.leave++
    if (r.earlyOutMinutes > 0) { counts.earlyOutDays++; counts.totalEarlyOutMinutes += Number(r.earlyOutMinutes || 0) }
  })

  const base = Number(st.salary || 0)
  const perDay = base / 30
  const presentEquivalent = counts.present + counts.late
  const bonus = presentEquivalent * Number(settings.bonusPerDay || 0)
  const lateDeduction = (counts.late * Number(settings.deductionPerLate || 0)) + (counts.totalLateMinutes * Number(settings.deductionPerMinute || 0))
  const earlyOutDeduction = counts.totalEarlyOutMinutes * Number(settings.deductionPerMinuteEarlyOut || 0)
  const absentDeduction = settings.absentChargesEnabled
    ? counts.absent * perDay
    : counts.absent * Number(settings.deductionPerAbsent || 0)
  const ded = absentDeduction + lateDeduction + earlyOutDeduction
  const net = Math.max(0, base - ded + bonus)

  return {
    counts,
    records,
    base, perDay, bonus, ded, net,
    lateDeduction, earlyOutDeduction, absentDeduction,
    totalLateMinutes: counts.totalLateMinutes,
    totalEarlyOutMinutes: counts.totalEarlyOutMinutes,
  }
}
