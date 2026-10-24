import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import PayDialog from '../components/PayDialog';
import { formatTime12 } from '../../../utils/dateUtils.js';

export default function MonthlyViewTab({
 staff,
 attendance,
 settings,
 payNotes,
 advances = [],
 onDeletePayNote,
 onAddPayNote,
 state,
 API,
 token,
 toast,
 businessDate,
 month,
 setMonth
}) {
 const [monthlyStaffId, setMonthlyStaffId] = useState('');
 const [showPayDialog, setShowPayDialog] = useState(false);

 const rawRecords = useMemo(() => {
 if (!monthlyStaffId) return [];
 return attendance.filter(r => r.staffId === monthlyStaffId && r.date.startsWith(month));
 }, [attendance, monthlyStaffId, month]);

 // Build allDates array using local date to avoid timezone off-by-one
 const allDates = useMemo(() => {
 const st = staff.find(s => s.id === monthlyStaffId);
 if (!st) return [];
 const join = st.joinDate || '0000-00-00';
 const todayStr = businessDate ? String(businessDate).slice(0, 10) : (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
 const [y, m] = month.split('-').map(Number);
 if (!y || !m) return [];
 const dates = [];
 const last = new Date(y, m, 0).getDate();
 for (let day = 1; day <= last; day++) {
 const ds = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
 if (ds >= join && ds <= todayStr) dates.push(ds);
 }
 return dates;
 }, [month, monthlyStaffId, staff, businessDate]);

 // Merge actual records with generated Absent entries for missing dates
 const monthRecords = useMemo(() => {
 const byDate = new Map();
 rawRecords.forEach(r => byDate.set(r.date, r));
 const result = [];
 allDates.forEach(ds => {
 if (byDate.has(ds)) {
 result.push(byDate.get(ds));
 } else {
 result.push({ id: `absent-${ds}`, date: ds, status: 'Absent', checkIn: '', checkOut: '', lateMinutes: 0, earlyOutMinutes: 0 });
 }
 });
 return result.sort((a, b) => a.date.localeCompare(b.date));
 }, [rawRecords, allDates]);

 const counts = useMemo(() => {
 const c = { present: 0, absent: 0, late: 0, leave: 0, earlyOutDays: 0, totalLateMinutes: 0, totalEarlyOutMinutes: 0 };
 monthRecords.forEach(r => {
 if (r.status === 'Present') c.present++;
 else if (r.status === 'Absent') c.absent++;
 else if (r.status === 'Late') {
 c.late++;
 c.totalLateMinutes += Number(r.lateMinutes || 0);
 }
 else if (r.status === 'Leave') c.leave++;
 if (r.earlyOutMinutes > 0) {
 c.earlyOutDays++;
 c.totalEarlyOutMinutes += Number(r.earlyOutMinutes || 0);
 }
 });
 return c;
 }, [monthRecords]);

 const salaryCalc = useMemo(() => {
 const st = staff.find(s => s.id === monthlyStaffId);
 const base = Number(st?.salary || 0);
 const perDay = base / 30;
 const presentEquivalent = counts.present + counts.late;
 const bonus = presentEquivalent * settings.bonusPerDay;
 const lateDeduction = (counts.late * settings.deductionPerLate) + (counts.totalLateMinutes * settings.deductionPerMinute);
 const earlyOutDeduction = counts.totalEarlyOutMinutes * settings.deductionPerMinuteEarlyOut;
 // Absent deduction: use per-day rate if enabled, otherwise use fixed amount
 const absentDeduction = settings.absentChargesEnabled
 ? counts.absent * perDay
 : counts.absent * settings.deductionPerAbsent;
 const ded = absentDeduction + lateDeduction + earlyOutDeduction;
 const net = Math.max(0, base - ded + bonus);
 const paid = payNotes
 .filter(n => n.staffId === monthlyStaffId && n.month === month)
 .reduce((s, n) => s + Number(n.amount || 0), 0);
 const advTotal = (advances || [])
 .filter(a => String(a.staffId) === String(monthlyStaffId) && a.month === month)
 .reduce((s, a) => s + Number(a.amount || 0), 0);
 const netDue = Math.max(0, net - paid - advTotal);
 return { base, perDay, bonus, ded, net, paid, advTotal, netDue, lateDeduction, earlyOutDeduction, absentDeduction, totalLateMinutes: counts.totalLateMinutes, totalEarlyOutMinutes: counts.totalEarlyOutMinutes };
 }, [counts, monthlyStaffId, staff, settings, payNotes, advances, month]);

 const downloadPDF = () => {
 if (!monthlyStaffId) { toast.error('Select staff'); return; }
 try {
 const doc = new jsPDF('l', 'pt', 'a4')
 const company = state?.settings?.companyName || 'Staff Report'
 const st = staff.find(s => s.id === monthlyStaffId)

 doc.setFontSize(16)
 doc.text(company, 40, 32)
 doc.setFontSize(12)
 doc.text(`Monthly Report: ${st?.name || ''} - ${month}`, 40, 48)

 // Summary stats as colored widget boxes (same pattern as SalesHistory)
 const widgets = [
 { label: 'Present', value: String(counts.present + counts.late), bg: [220, 252, 231], border: [22, 163, 74], text: [22, 163, 74] },
 { label: 'Late', value: String(counts.late), bg: [255, 237, 213], border: [234, 88, 12], text: [234, 88, 12] },
 { label: 'Leave', value: String(counts.leave), bg: [219, 234, 254], border: [37, 99, 235], text: [37, 99, 235] },
 { label: 'Early Out', value: String(counts.earlyOutDays), bg: [254, 243, 199], border: [180, 83, 9], text: [180, 83, 9] },
 { label: 'Absent', value: String(counts.absent), bg: [254, 226, 226], border: [220, 38, 38], text: [220, 38, 38] },
 ]
 const pageWidth = doc.internal.pageSize.getWidth()
 const margin = 40
 const gap = 8
 const boxW = (pageWidth - 2 * margin - 4 * gap) / 5
 const boxH = 52
 let statY = 64
 for (let i = 0; i < widgets.length; i++) {
 const x = margin + i * (boxW + gap)
 const y = statY
 const w = widgets[i]
 doc.setFillColor(w.bg[0], w.bg[1], w.bg[2])
 doc.setDrawColor(w.border[0], w.border[1], w.border[2])
 doc.setLineWidth(1.5)
 doc.roundedRect(x, y, boxW, boxH, 6, 6, 'FD')
 doc.setFontSize(7)
 doc.setTextColor(w.text[0], w.text[1], w.text[2])
 doc.setFont(undefined, 'bold')
 doc.text(w.label.toUpperCase(), x + 10, y + 16)
 doc.setFontSize(13)
 doc.text(w.value, x + 10, y + 38)
 doc.setTextColor(0, 0, 0)
 doc.setFont(undefined, 'normal')
 }

 // Attendance table
 const tableStartY = statY + boxH + gap + 6
 const tableData = monthRecords.map(r => [r.date, r.status, r.checkIn || '-', r.checkOut || '-', r.lateMinutes || '-', r.earlyOutMinutes || '-'])
 tableData.push(['Total', '', '', '', counts.totalLateMinutes, counts.totalEarlyOutMinutes])

 doc.autoTable({
 head: [['Date', 'Status', 'Check In', 'Check Out', 'Late Min', 'Early Out Min']],
 body: tableData,
 startY: tableStartY,
 styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', halign: 'left' },
 headStyles: { fillColor: [20, 184, 166], textColor: 255, fontSize: 9, fontStyle: 'bold' },
 columnStyles: {
 0: { cellWidth: 80 },
 1: { cellWidth: 70 },
 2: { cellWidth: 80 },
 3: { cellWidth: 80 },
 4: { cellWidth: 70 },
 5: { cellWidth: 70 },
 },
 margin: { left: 40, right: 40 },
 tableWidth: 'auto'
 })

 // Salary calculation table
 let y2 = doc.lastAutoTable?.finalY || tableStartY
 y2 += 20
 doc.setFontSize(12)
 doc.setTextColor(0, 0, 0)
 doc.text('Salary Calculation:', 40, y2)

 const salaryData = [
 ['Base Salary', `${salaryCalc.base.toLocaleString()} PKR`],
 ['Per Day Rate', `${salaryCalc.perDay.toFixed(2)} PKR`],
 ['Bonus', `+${salaryCalc.bonus.toFixed(2)} PKR`],
 ['Absent Deduction', `-${salaryCalc.absentDeduction.toFixed(2)} PKR`],
 ['Late Deduction', `-${salaryCalc.lateDeduction.toFixed(2)} PKR`],
 ['Early Out Deduction', `-${salaryCalc.earlyOutDeduction.toFixed(2)} PKR`],
 ['Total Deductions', `-${salaryCalc.ded.toFixed(2)} PKR`],
 ['Advances Taken', `-${Number(salaryCalc.advTotal || 0).toLocaleString()} PKR`],
 ['Paid This Month', `-${Number(salaryCalc.paid || 0).toLocaleString()} PKR`],
 ['Net Salary Due', `${Number(salaryCalc.netDue || 0).toLocaleString()} PKR`],
 ]

 doc.autoTable({
 head: [['Description', 'Amount']],
 body: salaryData,
 startY: y2 + 6,
 styles: { fontSize: 9, cellPadding: 4 },
 headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
 columnStyles: {
 0: { cellWidth: 200 },
 1: { cellWidth: 120, halign: 'right' },
 },
 margin: { left: 40, right: 40 },
 })

 // Pay notes
 const staffPayNotes = payNotes.filter(n => n.staffId === monthlyStaffId && n.month === month)
 if (staffPayNotes.length > 0) {
 let y3 = doc.lastAutoTable?.finalY || y2 + 6
 y3 += 20
 doc.setFontSize(11)
 doc.text('Pay Notes:', 40, y3)
 const noteData = staffPayNotes.map((n, idx) => {
 const date = n.date || new Date(n.createdAt).toLocaleDateString()
 return [`${idx + 1}. ${n.notes || '(No note)'}`, `${Number(n.amount).toLocaleString()} PKR`, date]
 })
 doc.autoTable({
 head: [['Note', 'Amount', 'Date']],
 body: noteData,
 startY: y3 + 6,
 styles: { fontSize: 9, cellPadding: 4 },
 headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
 margin: { left: 40, right: 40 },
 })
 }

 doc.save(`${st?.name || 'staff'}_${month}_report.pdf`)
 toast.success('PDF exported successfully')
 } catch (err) {
 console.error('PDF export error:', err)
 toast.error('Failed to export PDF: ' + (err?.message || 'unknown error'))
 }
 };

 return (
 <div className="space-y-4">
 {/* Header Card */}
 <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-4 text-white"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><div><h2 className="text-lg font-semibold"> Monthly Report & Salary</h2><p className="text-blue-100 text-sm">View attendance records and calculate monthly salary</p></div></div></div>

 {/* Filters Card */}
 <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-5"><div className="grid md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"> Select Staff</label><select
 className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
 value={monthlyStaffId}
 onChange={e => setMonthlyStaffId(e.target.value)}
 ><option value="">Choose a staff member...</option>
 {staff.map(s =><option key={s.id} value={s.id}>{s.name} - {s.position}</option>)}
 </select></div><div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"> Select Month</label><input
 type="month"
 className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
 value={month}
 onChange={e => setMonth(e.target.value)}
 /></div></div></div>

 {/* Stats Cards */}
 <div className="grid grid-cols-2 md:grid-cols-5 gap-4"><div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-green-200 dark:border-slate-600 p-4"><div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm"></span><span className="text-sm text-slate-500 dark:text-slate-400">Present</span></div><div className="text-3xl font-bold text-green-600">{counts.present + counts.late}</div></div><div className="bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-orange-200 dark:border-slate-600 p-4"><div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm"></span><span className="text-sm text-slate-500 dark:text-slate-400">Late</span></div><div className="text-3xl font-bold text-orange-600">{counts.late}</div></div><div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-amber-200 dark:border-slate-600 p-4"><div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm"></span><span className="text-sm text-slate-500 dark:text-slate-400">Early Out</span></div><div className="text-3xl font-bold text-amber-600">{counts.earlyOutDays}</div></div><div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-blue-200 dark:border-slate-600 p-4"><div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm"></span><span className="text-sm text-slate-500 dark:text-slate-400">Leave</span></div><div className="text-3xl font-bold text-blue-600">{counts.leave}</div></div><div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-red-200 dark:border-slate-600 p-4"><div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center text-sm"></span><span className="text-sm text-slate-500 dark:text-slate-400">Absent</span></div><div className="text-3xl font-bold text-red-600">{counts.absent}</div></div></div>

 {/* Attendance Records Table */}
 <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"><div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"><h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><span className="w-2 h-2 bg-teal-500 rounded-full"></span>
 Monthly Attendance Records ({monthRecords.length} days)
 </h3></div><div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-slate-100 dark:bg-slate-700/50"><th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Date</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Status</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Check In</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Check Out</th><th className="px-6 py-4 text-center text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">Late Minutes</th><th className="px-6 py-4 text-center text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Early Out Minutes</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">
 {monthRecords.length === 0 && (
 <tr><td colSpan={6} className="px-6 py-12 text-center"><div className="text-slate-400 dark:text-slate-500"><div className="text-4xl mb-2"></div><p>{monthlyStaffId ? 'No records for this month' : 'Select a staff member to view records'}</p></div></td></tr>
 )}
 {monthRecords.map((r, idx) => (
 <tr key={r.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}><td className="px-6 py-4"><span className="font-medium text-slate-700 dark:text-slate-300">{r.date}</span></td><td className="px-6 py-4 text-center"><span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
 r.status === 'Present' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' :
 r.status === 'Late' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' :
 r.status === 'Absent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' :
 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30'
 }`}>
 {r.status}
 </span></td><td className="px-6 py-4 text-center">
 {r.checkIn ? (
 <span className="font-medium text-slate-700 dark:text-slate-300">{formatTime12(r.checkIn)}</span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500">-</span>
 )}
 </td><td className="px-6 py-4 text-center">
 {r.checkOut ? (
 <span className="font-medium text-slate-700 dark:text-slate-300">{formatTime12(r.checkOut)}</span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500">-</span>
 )}
 </td><td className="px-6 py-4 text-center">
 {r.lateMinutes > 0 ? (
 <span className="font-medium text-orange-600">{r.lateMinutes}</span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500">-</span>
 )}
 </td><td className="px-6 py-4 text-center">
 {r.earlyOutMinutes > 0 ? (
 <span className="font-medium text-blue-600">{r.earlyOutMinutes}</span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500">-</span>
 )}
 </td></tr>
 ))}
 {/* Totals Row */}
 {monthRecords.length > 0 && (
 <tr className="bg-slate-100 dark:bg-slate-700 font-semibold border-t-2 border-slate-300 dark:border-slate-500"><td className="px-6 py-4 text-left text-slate-800 dark:text-slate-200" colSpan={4}><span className="flex items-center gap-2"><span className="w-2 h-2 bg-teal-500 rounded-full"></span>
 Total
 </span></td><td className="px-6 py-4 text-center"><span className="text-orange-600 font-bold">{counts.totalLateMinutes}</span></td><td className="px-6 py-4 text-center"><span className="text-blue-600 font-bold">{counts.totalEarlyOutMinutes}</span></td></tr>
 )}
 </tbody></table></div></div>

 {monthlyStaffId && (
 <div className="grid md:grid-cols-2 gap-6">
 {/* Salary Calculation Card */}
 <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-700 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-600 overflow-hidden"><div className="bg-gradient-to-r from-blue-500 to-teal-500 px-6 py-4"><h3 className="font-semibold text-white flex items-center gap-2">
 Salary Calculation
 </h3></div><div className="p-6 space-y-3"><div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><span className="text-slate-600 dark:text-slate-400">Base Salary</span><span className="font-semibold text-slate-800 dark:text-slate-200">{salaryCalc.base.toLocaleString()} PKR</span></div><div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><span className="text-slate-600 dark:text-slate-400">Per Day Rate</span><span className="font-semibold text-slate-800 dark:text-slate-200">{salaryCalc.perDay.toFixed(2)} PKR</span></div><div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><span className="text-slate-600 dark:text-slate-400">Bonus ({(counts.present + counts.late).toFixed(1)} days)</span><span className="font-semibold text-green-600">+{salaryCalc.bonus.toFixed(2)} PKR</span></div>
 {/* Absent Deduction */}
 <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><div className="flex flex-col"><span className="text-slate-600 dark:text-slate-400">Absent</span><span className="text-xs text-slate-500">
 {counts.absent} days {settings.absentChargesEnabled ? `× ${salaryCalc.perDay.toFixed(0)} PKR` : `× ${settings.deductionPerAbsent || 0} PKR`}
 </span></div><span className="font-semibold text-red-600">-{salaryCalc.absentDeduction.toFixed(2)} PKR</span></div>
 {/* Late Deduction */}
 <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><div className="flex flex-col"><span className="text-slate-600 dark:text-slate-400">Late</span><span className="text-xs text-slate-500">
 {counts.late} days {salaryCalc.totalLateMinutes > 0 ? `(${salaryCalc.totalLateMinutes} min × ${settings.deductionPerMinute || 0} PKR)` : `× ${settings.deductionPerLate || 0} PKR`}
 </span></div><span className="font-semibold text-red-600">-{salaryCalc.lateDeduction.toFixed(2)} PKR</span></div>
 {/* Early Out Deduction */}
 <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><div className="flex flex-col"><span className="text-slate-600 dark:text-slate-400">Early Out</span><span className="text-xs text-slate-500">
 {counts.earlyOutDays} days {salaryCalc.totalEarlyOutMinutes > 0 ? `(${salaryCalc.totalEarlyOutMinutes} min × ${settings.deductionPerMinuteEarlyOut || 0} PKR)` : ``}
 </span></div><span className="font-semibold text-red-600">-{salaryCalc.earlyOutDeduction.toFixed(2)} PKR</span></div>
 {/* Total Deductions */}
 <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 rounded px-3 -mx-1"><span className="font-medium text-slate-700 dark:text-slate-300">Total Deductions</span><span className="font-bold text-red-600">-{salaryCalc.ded.toFixed(2)} PKR</span></div><div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><span className="text-slate-600 dark:text-slate-400">Advances Taken</span><span className="font-semibold text-purple-600">-{Number(salaryCalc.advTotal || 0).toLocaleString()} PKR</span></div><div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><span className="text-slate-600 dark:text-slate-400">Paid This Month</span><span className="font-semibold text-orange-600">-{Number(salaryCalc.paid || 0).toLocaleString()} PKR</span></div><div className="flex justify-between items-center py-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg px-4 -mx-2 mt-4"><span className="font-semibold text-slate-800 dark:text-slate-200">Net Salary Due</span><span className="text-2xl font-bold text-green-600">{Number(salaryCalc.netDue || 0).toLocaleString()} PKR</span></div></div><div className="px-6 pb-6 flex gap-3"><button
 className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all"
 onClick={() => { if (!monthlyStaffId) { toast.error('Select staff'); return; } setShowPayDialog(true); }}
 ><span>Pay Staff</span></button><button
 className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all"
 onClick={downloadPDF}
 ><span>Download PDF</span></button></div></div>

 {/* Pay Notes Card */}
 <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"><div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"><h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><span>Payment History</span></h3></div><div className="p-6">
 {payNotes.filter(n => n.staffId === monthlyStaffId && n.month === month).length === 0 ? (
 <div className="text-center py-8"><div className="text-4xl mb-2"></div><p className="text-slate-500 dark:text-slate-400">No payments recorded this month</p></div>
 ) : (
 <div className="space-y-3 max-h-80 overflow-y-auto">
 {payNotes.filter(n => n.staffId === monthlyStaffId && n.month === month).map(n => (
 <div key={n.id} className="flex items-start justify-between gap-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-100 dark:border-slate-600"><div className="flex-1"><div className="font-medium text-slate-800 dark:text-slate-200">{n.notes || '(No note)'}</div><div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{n.date || new Date(n.createdAt).toLocaleDateString()}</div></div><div className="text-right"><div className="font-bold text-slate-800 dark:text-slate-200">{Number(n.amount).toLocaleString()} PKR</div><button
 className="text-xs text-red-500 hover:text-red-700 mt-1 font-medium"
 onClick={() => onDeletePayNote(n.id)}
 >
 Delete
 </button></div></div>
 ))}
 </div>
 )}
 </div></div></div>
 )}

 <PayDialog
 isOpen={showPayDialog}
 onClose={() => setShowPayDialog(false)}
 onSubmit={onAddPayNote}
 monthlyStaffId={monthlyStaffId}
 month={month}
 /></div>
 );
}
