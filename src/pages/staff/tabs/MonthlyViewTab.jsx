import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffEarningsDialog from '../components/StaffEarningsDialog.jsx';
import SalarySlipDialog from '../components/SalarySlipDialog.jsx';
import { format } from 'date-fns';
import { formatTime12 } from '../../../utils/dateUtils.js';
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../../utils/reportDoc.js';
import DatePicker from '../../../components/DatePicker.jsx';

const btnPrint = 'ui-btn ui-btn-print';
const btnPdf = 'ui-btn ui-btn-pdf';
const btnCsv = 'ui-btn ui-btn-csv';

export default function MonthlyViewTab({
 staff,
 attendance,
 settings,
 advances = [],
 state,
 API,
 token,
 toast,
 businessDate,
 month,
 setMonth
}) {
 const navigate = useNavigate();
 const [monthlyStaffId, setMonthlyStaffId] = useState('');
 const [showEarnings, setShowEarnings] = useState(false);
 const [slipRun, setSlipRun] = useState(null);
 const [staffEarnings, setStaffEarnings] = useState([]);
 const [payrollRun, setPayrollRun] = useState(null);
 const [earnTick, setEarnTick] = useState(0);

 // Earnings ledger + payroll run for the selected staff/month
 useEffect(() => {
 if (!monthlyStaffId || !API || !token) { setStaffEarnings([]); setPayrollRun(null); return; }
 let mounted = true;
 const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
 const headers = { Authorization: `Bearer ${token}` };
 Promise.all([
 fetch(`${API}/api/staff-earnings?staffId=${encodeURIComponent(monthlyStaffId)}&from=${month}-01&to=${month}-${String(last).padStart(2, '0')}&limit=500`, { headers }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
 fetch(`${API}/api/payroll?period=${encodeURIComponent(month)}`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
 ]).then(([earn, runs]) => {
 if (!mounted) return;
 setStaffEarnings(earn?.items || []);
 setPayrollRun((Array.isArray(runs) ? runs : []).find(r => String(r.staffId) === String(monthlyStaffId)) || null);
 });
 return () => { mounted = false; };
 }, [monthlyStaffId, month, API, token, earnTick]);

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
 const extrasSum = staffEarnings.reduce((s, e) => e.category === 'Deduction' ? s : s + Number(e.amount || 0), 0);
 const manualDeduction = staffEarnings.reduce((s, e) => e.category === 'Deduction' ? s + Number(e.amount || 0) : s, 0);
 const ded = absentDeduction + lateDeduction + earlyOutDeduction;
 const net = Math.max(0, base - ded + bonus);
 const advTotal = (advances || [])
 .filter(a => String(a.staffId) === String(monthlyStaffId) && a.month === month && (a.type || 'issue') === 'issue')
 .reduce((s, a) => s + Number(a.amount || 0), 0);
 const netDue = Math.max(0, net + extrasSum - manualDeduction - advTotal);
 return { base, perDay, bonus, ded, net, extrasSum, manualDeduction, advTotal, netDue, lateDeduction, earlyOutDeduction, absentDeduction, totalLateMinutes: counts.totalLateMinutes, totalEarlyOutMinutes: counts.totalEarlyOutMinutes };
 }, [counts, monthlyStaffId, staff, settings, staffEarnings, advances, month]);

 const buildMonthlyAttendanceReport = () => {
  const st = staff.find(s => s.id === monthlyStaffId);
  const fileName = `${st?.name || 'staff'}-${month}-attendance.pdf`;
  const body =
   reportSummary([
    { label: 'Present (incl. late)', amount: String(counts.present + counts.late) },
    { label: 'Late', amount: String(counts.late) },
    { label: 'Leave', amount: String(counts.leave) },
    { label: 'Absent', amount: String(counts.absent) },
    { label: 'Early out days', amount: String(counts.earlyOutDays) },
    { label: 'Net salary due', amount: `${Number(salaryCalc.netDue || 0).toLocaleString()} PKR` },
   ]) +
   reportSec(`Attendance — ${st?.name || ''} (${month})`) +
   reportTable({
    headers: ['Date', 'Status', 'Check In', 'Check Out', { t: 'Late Min', align: 'r' }, { t: 'Early Out Min', align: 'r' }],
    numbered: true,
    rows: monthRecords.map(r => [
     r.date,
     r.status,
     r.checkIn ? formatTime12(r.checkIn) : '-',
     r.checkOut ? formatTime12(r.checkOut) : '-',
     { v: r.lateMinutes > 0 ? r.lateMinutes : '-', align: 'r' },
     { v: r.earlyOutMinutes > 0 ? r.earlyOutMinutes : '-', align: 'r' },
    ]),
    emptyText: 'No records for this month',
   });
  const html = wrapReportDoc({
   settings: state?.settings || {},
   title: 'Monthly Staff Report',
   reportLabel: 'Monthly Attendance Report',
   reportNo: `Rpt #: MA-${month}-${monthlyStaffId}`,
   metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Staff', st?.name || ''], ['Month', month]],
   metaRight: [['Days', String(monthRecords.length)], ['Position', st?.position || '']],
   body,
  });
  return { html, fileName };
 };

 const openPrintPreview = async () => {
 if (!monthlyStaffId) { toast.error('Select staff'); return; }
 try {
  const { html, fileName } = buildMonthlyAttendanceReport();
  await previewHtmlReport(html, fileName);
  toast.success('Print preview opened');
 } catch (err) {
  console.error(err);
  toast.error('Print preview failed');
 }
 };

 const exportCSV = () => {
 if (!monthlyStaffId) { toast.error('Select staff'); return; }
 try {
  const st = staff.find(s => s.id === monthlyStaffId);
  const header = ['Date', 'Status', 'Check In', 'Check Out', 'Late Minutes', 'Early Out Minutes'];
  const lines = monthRecords.map(r =>
   [r.date, r.status, r.checkIn ? formatTime12(r.checkIn) : '', r.checkOut ? formatTime12(r.checkOut) : '', r.lateMinutes || 0, r.earlyOutMinutes || 0]
    .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${st?.name || 'staff'}_${month}_attendance.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('CSV exported successfully');
 } catch {
  toast.error('Failed to export CSV');
 }
 };

 const exportPDF = async () => {
 if (!monthlyStaffId) { toast.error('Select staff'); return; }
 try {
  const { html, fileName } = buildMonthlyAttendanceReport();
  await downloadHtmlReport(html, fileName);
  toast.success('PDF downloaded');
 } catch (err) {
  console.error(err);
  toast.error('Failed to export PDF');
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
 {staff.map(s => (
 <option key={s.id} value={s.id}>
 {s.name} - {s.position}{s.biometricId ? ` · Bio ${s.biometricId}` : ''}
 </option>
 ))}
 </select>
 {monthlyStaffId && (() => {
 const sel = staff.find(s => String(s.id) === String(monthlyStaffId));
 if (!sel) return null;
 return (
 <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
 Biometric ID:{' '}
 <span className={`font-mono font-semibold ${sel.biometricId ? 'text-blue-700 dark:text-blue-300' : 'text-slate-400'}`}>
 {sel.biometricId || 'Not mapped'}
 </span>
 </p>
 );
 })()}
 </div><div>
  <DatePicker mode="month" label="Select Month" value={month} onChange={v => { if (v) setMonth(v) }} allowClear={false} />
 </div></div></div>

 <div className="flex flex-wrap gap-3 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-2 border-indigo-200 dark:border-indigo-800">
  <button type="button" onClick={openPrintPreview} disabled={!monthlyStaffId} className={`${btnPrint} disabled:opacity-50 disabled:cursor-not-allowed`}>Print</button>
  <button type="button" onClick={exportPDF} disabled={!monthlyStaffId} className={`${btnPdf} disabled:opacity-50 disabled:cursor-not-allowed`}>PDF</button>
  <button type="button" onClick={exportCSV} disabled={!monthlyStaffId} className={`${btnCsv} disabled:opacity-50 disabled:cursor-not-allowed`}>CSV</button>
 </div>

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
 <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 rounded px-3 -mx-1"><span className="font-medium text-slate-700 dark:text-slate-300">Total Deductions</span><span className="font-bold text-red-600">-{salaryCalc.ded.toFixed(2)} PKR</span></div><div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><span className="text-slate-600 dark:text-slate-400">Earnings (extras)</span><span className="font-semibold text-emerald-600">+{Number(salaryCalc.extrasSum || 0).toLocaleString()} PKR</span></div><div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><span className="text-slate-600 dark:text-slate-400">Adjustments</span><span className="font-semibold text-red-600">-{Number(salaryCalc.manualDeduction || 0).toLocaleString()} PKR</span></div><div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600"><span className="text-slate-600 dark:text-slate-400">Advances Taken</span><span className="font-semibold text-purple-600">-{Number(salaryCalc.advTotal || 0).toLocaleString()} PKR</span></div><div className="flex justify-between items-center py-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg px-4 -mx-2 mt-4"><span className="font-semibold text-slate-800 dark:text-slate-200">Net Salary Due</span><span className="text-2xl font-bold text-green-600">{Number(salaryCalc.netDue || 0).toLocaleString()} PKR</span></div>
 {payrollRun && (
 <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2 mt-2">
 <span className="text-xs text-slate-500 dark:text-slate-400">Payroll {month}</span>
 <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${payrollRun.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : payrollRun.status === 'approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>{payrollRun.status}{payrollRun.slipNo ? ` · ${payrollRun.slipNo}` : ''}</span>
 <button
 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:underline"
 onClick={() => setSlipRun(payrollRun)}
 >Slip</button>
 </div>
 )}
 </div><div className="px-6 pb-6 flex flex-wrap gap-3"><button
 className="flex-1 min-w-[110px] flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all"
 onClick={() => { if (!monthlyStaffId) { toast.error('Select staff'); return; } setShowEarnings(true); }}
 ><span>Earnings</span></button><button
 className="flex-1 min-w-[110px] flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all"
 onClick={() => navigate(`/staff/history/${monthlyStaffId}`)}
 ><span>History</span></button></div></div>

 {/* Earnings & Adjustments Card */}
 <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"><div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between"><h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><span>Earnings &amp; Adjustments</span></h3><button
 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:underline"
 onClick={() => { if (!monthlyStaffId) { toast.error('Select staff'); return; } setShowEarnings(true); }}
 >Manage</button></div><div className="p-6">
 {staffEarnings.length === 0 ? (
 <div className="text-center py-8"><div className="text-4xl mb-2"></div><p className="text-slate-500 dark:text-slate-400">No earnings or adjustments this month</p></div>
 ) : (
 <div className="space-y-3 max-h-80 overflow-y-auto">
 {staffEarnings.map(n => (
 <div key={n._id} className="flex items-start justify-between gap-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-100 dark:border-slate-600"><div className="flex-1"><div className="font-medium text-slate-800 dark:text-slate-200">{n.category === 'Deduction' ? 'Adjustment (Deduction)' : n.category}</div><div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{n.date}{n.notes ? ` · ${n.notes}` : ''}</div></div><div className="text-right"><div className={`font-bold ${n.category === 'Deduction' ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>{n.category === 'Deduction' ? '-' : '+'}{Number(n.amount).toLocaleString()} PKR</div></div></div>
 ))}
 </div>
 )}
 </div></div></div>
 )}

 <StaffEarningsDialog
 open={showEarnings}
 onClose={() => setShowEarnings(false)}
 staff={staff.find(s => s.id === monthlyStaffId) || null}
 month={month}
 readOnly={payrollRun?.status === 'paid'}
 onChanged={() => setEarnTick(t => t + 1)}
 API={API}
 token={token}
 />

 <SalarySlipDialog
 open={!!slipRun}
 onClose={() => setSlipRun(null)}
 run={slipRun}
 API={API}
 token={token}
 companyName={state?.settings?.companyName}
 companyInfo={state?.settings}
 /></div>
 );
}
