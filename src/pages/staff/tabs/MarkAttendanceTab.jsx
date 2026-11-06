import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { getLocalDateString } from '../../../utils/dateUtils.js';
import { useData } from '../../../state/DataContext.jsx';
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../../utils/reportDoc.js';

const btnPrint = 'ui-btn ui-btn-print';
const btnPdf = 'ui-btn ui-btn-pdf';
const btnCsv = 'ui-btn ui-btn-csv';

export default function MarkAttendanceTab({
 staff,
 attendance,
 settings,
 onClockIn,
 onClockOut,
 onMarkLeave,
 fmt12,
 token,
 API,
 shifts = []
}) {
 const { businessDate, state } = useData();
 // Use system business date - this follows day open/close
 const today = businessDate || getLocalDateString();
 const calendarDate = getLocalDateString();
 
 // Biometric sync status
 const [biometricStatus, setBiometricStatus] = useState({
 lastSync: null,
 pendingSync: false,
 deviceConnected: false
 });

 // Fetch sync status periodically
 useEffect(() => {
 if (!token) return;
 
 const checkStatus = async () => {
 try {
 // Try to fetch recent biometric events to check connectivity
 const res = await fetch(`${API}/api/biometric/events?date=${today}&limit=1`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 setBiometricStatus(prev => ({ ...prev, deviceConnected: true }));
 }
 } catch (e) {
 setBiometricStatus(prev => ({ ...prev, deviceConnected: false }));
 }
 };
 
 checkStatus();
 const interval = setInterval(checkStatus, 30000); // Check every 30s
 return () => clearInterval(interval);
 }, [token, today]);

 const handleSyncNow = async () => {
 if (!token) return;
 setBiometricStatus(prev => ({ ...prev, pendingSync: true }));
 try {
 const res = await fetch(`${API}/api/biometric/sync/once`, {
 method: 'POST',
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 setBiometricStatus(prev => ({ ...prev, lastSync: new Date(), pendingSync: false }));
 // Reload page to get updated attendance
 window.location.reload();
 }
 } catch (e) {
 setBiometricStatus(prev => ({ ...prev, pendingSync: false }));
 }
 };

 const activeStaff = useMemo(() => staff.filter(s => s.status !== 'inactive'), [staff]);

 const reportRows = useMemo(() => activeStaff.map(s => {
  const record = attendance.find(r => r.staffId === s.id && r.date === today);
  const shift = shifts.find(sh => sh.id === s.shiftId);
  const shiftLabel = shift ? `${fmt12(shift.checkIn)} - ${fmt12(shift.checkOut)}` : 'No shift';
  let status = 'Not marked';
  if (record?.status === 'Leave') status = 'Leave';
  else if (record?.status === 'Late') status = 'Late';
  else if (record?.checkIn && record?.checkOut) status = 'Present';
  else if (record?.checkIn) status = 'Clocked in';
  else if (record) status = record.status || 'Absent';
  return {
   name: s.name,
   position: s.position || '-',
   phone: s.phone || '-',
   shift: shiftLabel,
   status,
   checkIn: record?.checkIn ? fmt12(record.checkIn) : '-',
   checkOut: record?.checkOut ? fmt12(record.checkOut) : '-',
  };
 }), [activeStaff, attendance, today, shifts, fmt12]);

 const stats = useMemo(() => ({
  marked: reportRows.filter(r => r.status !== 'Not marked').length,
  leave: reportRows.filter(r => r.status === 'Leave').length,
  late: reportRows.filter(r => r.status === 'Late').length,
  clockedIn: reportRows.filter(r => r.checkIn !== '-' && r.checkOut === '-').length,
 }), [reportRows]);

 const openPrintPreview = async () => {
  try {
   const body =
    reportSummary([
     { label: 'Active staff', amount: String(activeStaff.length) },
     { label: 'Marked today', amount: String(stats.marked) },
     { label: 'On leave', amount: String(stats.leave) },
     { label: 'Late', amount: String(stats.late) },
    ]) +
    reportSec(`Mark attendance — ${today}`) +
    reportTable({
     headers: ['Staff', 'Position', 'Phone', 'Shift', 'Status', 'Check In', 'Check Out'],
     numbered: true,
     rows: reportRows.map(r => [r.name, r.position, r.phone, r.shift, r.status, r.checkIn, r.checkOut]),
     emptyText: 'No active staff',
    });
   const html = wrapReportDoc({
    settings: state?.settings || settings || {},
    title: 'Mark Attendance',
    reportLabel: 'Attendance Report',
    reportNo: `Rpt #: MA-${today}`,
    metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Date', today]],
    metaRight: [['Active staff', String(activeStaff.length)]],
    body,
   });
   await previewHtmlReport(html, `Mark-Attendance-${today}.pdf`);
   toast.success('Print preview opened');
  } catch {
   toast.error('Print preview failed');
  }
 };

 const exportPDF = () => {
  try {
   const doc = new jsPDF('p', 'pt', 'a4');
   doc.setFontSize(16);
   doc.text(state?.settings?.companyName || 'Mark Attendance', 40, 32);
   doc.setFontSize(11);
   doc.text(`Date: ${today} · ${activeStaff.length} active staff`, 40, 48);
   doc.autoTable({
    head: [['Staff', 'Position', 'Shift', 'Status', 'Check In', 'Check Out']],
    body: reportRows.map(r => [r.name, r.position, r.shift, r.status, r.checkIn, r.checkOut]),
    startY: 58,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [20, 184, 166], textColor: 255, fontStyle: 'bold' },
    margin: { left: 40, right: 40 },
   });
   doc.save(`mark-attendance-${today}.pdf`);
   toast.success('PDF exported');
  } catch {
   toast.error('Failed to export PDF');
  }
 };

 const exportCSV = () => {
  try {
   const header = ['Staff', 'Position', 'Phone', 'Shift', 'Status', 'Check In', 'Check Out'];
   const lines = reportRows.map(r =>
    [r.name, r.position, r.phone, r.shift, r.status, r.checkIn, r.checkOut]
     .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
   );
   const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `mark-attendance-${today}.csv`;
   a.click();
   URL.revokeObjectURL(url);
   toast.success('CSV exported');
  } catch {
   toast.error('Failed to export CSV');
  }
 };

 return (
 <div className="space-y-4">
 {/* Biometric Status Bar */}
 <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="text-2xl"></span><div><h3 className="font-semibold text-slate-800 dark:text-slate-200">Biometric Device (K70)</h3><p className="text-sm text-slate-500 dark:text-slate-400">
 {biometricStatus.deviceConnected 
 ? ' Device connected - Attendance auto-syncs every 15 seconds' 
 : ' Device not responding - Manual clock-in available'}
 </p></div></div><button
 onClick={handleSyncNow}
 disabled={biometricStatus.pendingSync}
 className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
 >
 {biometricStatus.pendingSync ? 'Syncing...' : 'Sync Now'}
 </button></div></div>

 {/* Info Card */}
 <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-4 text-white"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Mark Attendance</h2><p className="text-blue-100 text-sm">
 {new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
 {calendarDate !== today && <span className="text-xs ml-2 opacity-75">(Calendar: {calendarDate})</span>}
 </p></div><div className="text-right"><div className="text-sm text-blue-100">Shifts Configured</div><div className="font-medium">{shifts.length || 0} shifts</div><div className="text-xs text-blue-200 mt-1">Late after {settings.lateThresholdMinutes} min</div></div></div></div>

 <div className="flex flex-wrap gap-3 p-4 rounded-xl card card-pad">
  <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
  <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
  <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
 </div>

 {/* Staff Table Card */}
 <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"><div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"><h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><span className="w-2 h-2 bg-teal-500 rounded-full"></span>
 Staff List ({activeStaff.length} active)
 </h3></div><div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-slate-100 dark:bg-slate-700/50"><th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Staff</th><th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Biometric ID</th><th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Position</th><th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Phone</th><th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Shift</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Clock In</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Clock Out</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">
 {staff.length === 0 && (
 <tr><td colSpan={8} className="px-6 py-12 text-center"><div className="text-slate-400 dark:text-slate-500"><div className="text-4xl mb-2"></div><p>No staff members found</p><p className="text-sm">Add staff first to mark attendance</p></div></td></tr>
 )}
 {activeStaff.map((s, idx) => {
 const record = attendance.find(r => r.staffId === s.id && r.date === today);
 const isClockedIn = !!record?.checkIn;
 const isClockedOut = !!record?.checkOut;
 const isLate = record?.status === 'Late';
 const isLeave = record?.status === 'Leave';
 
 return (
 <tr key={s.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
 {s.name.charAt(0).toUpperCase()}
 </div><div><div className="font-semibold text-slate-800 dark:text-slate-200">{s.name}</div>
 {isLate && <span className="text-xs text-orange-500 font-medium"> Late</span>}
 {isLeave && <span className="text-xs text-blue-500 font-medium"> Leave</span>}
 </div></div></td><td className="px-6 py-4"><span className={`font-mono text-sm ${s.biometricId ? 'text-blue-700 dark:text-blue-300' : 'text-slate-400'}`}>{s.biometricId || '—'}</span></td><td className="px-6 py-4"><span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
 {s.position}
 </span></td><td className="px-6 py-4 text-slate-600 dark:text-slate-400">{s.phone || '-'}</td><td className="px-6 py-4 text-slate-600 dark:text-slate-400">
 {(() => {
 const shift = shifts.find(sh => sh.id === s.shiftId);
 if (!shift) return 'No shift';
 return `${fmt12(shift.checkIn)} - ${fmt12(shift.checkOut)}`;
 })()}
 </td><td className="px-6 py-4 text-center">
 {record?.checkIn ? (
 <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${isLate ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' : 'bg-green-100 text-green-700 dark:bg-green-900/30'}`}>
 {isLate ? '' : ''} {fmt12(record.checkIn)}
 </span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500">-</span>
 )}
 </td><td className="px-6 py-4 text-center">
 {record?.checkOut ? (
 <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30">
 {fmt12(record.checkOut)}
 </span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500">-</span>
 )}
 </td><td className="px-6 py-4"><div className="flex justify-center gap-2"><button
 className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
 isClockedIn 
 ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700' 
 : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md hover:shadow-lg hover:scale-105'
 }`}
 onClick={() => onClockIn(s.id)}
 disabled={isClockedIn}
 >
 {isClockedIn ? 'Clocked In' : 'Clock In'}
 </button><button
 className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
 !isClockedIn || isClockedOut
 ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700'
 : 'bg-gradient-to-r from-slate-600 to-slate-700 text-white shadow-md hover:shadow-lg hover:scale-105'
 }`}
 onClick={() => onClockOut(s.id)}
 disabled={!isClockedIn || isClockedOut}
 >
 {isClockedOut ? 'Clocked Out' : 'Clock Out'}
 </button><button
 className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
 isLeave
 ? 'bg-red-100 text-red-700 hover:bg-red-200'
 : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
 }`}
 onClick={() => onMarkLeave?.(s.id, today, !isLeave)}
 >
 {isLeave ? 'Remove Leave' : 'Mark Leave'}
 </button></div></td></tr>
 );
 })}
 </tbody></table></div></div></div>
 );
}

