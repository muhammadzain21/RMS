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
  onDeletePayNote,
  onAddPayNote,
  state,
  API,
  token,
  toast
}) {
  const [monthlyStaffId, setMonthlyStaffId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showPayDialog, setShowPayDialog] = useState(false);

  const monthRecords = useMemo(() => {
    if (!monthlyStaffId) return [];
    return attendance.filter(r => r.staffId === monthlyStaffId && r.date.startsWith(month));
  }, [attendance, monthlyStaffId, month]);

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
      // Count days with early out minutes (for any status with check-out)
      if (r.earlyOutMinutes > 0) {
        c.earlyOutDays++;
        c.totalEarlyOutMinutes += Number(r.earlyOutMinutes || 0);
      }
    });
    
    const st = staff.find(s => s.id === monthlyStaffId);
    if (!st) return c;
    
    const join = st.joinDate || '0000-00-00';
    const todayStr = new Date().toISOString().slice(0, 10);
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return c;
    
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const allDates = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      if (ds >= join && ds <= todayStr) allDates.push(ds);
    }
    const recordedByDate = new Set(monthRecords.map(r => r.date));
    const missingCount = allDates.filter(ds => !recordedByDate.has(ds)).length;
    c.absent += missingCount;
    return c;
  }, [monthRecords, month, monthlyStaffId, staff]);

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
    const netDue = Math.max(0, net - paid);
    return { base, perDay, bonus, ded, net, paid, netDue, lateDeduction, earlyOutDeduction, absentDeduction, totalLateMinutes: counts.totalLateMinutes, totalEarlyOutMinutes: counts.totalEarlyOutMinutes };
  }, [counts, monthlyStaffId, staff, settings, payNotes, month]);

  const downloadPDF = () => {
    if (!monthlyStaffId) { toast.error('Select staff'); return; }
    const doc = new jsPDF();
    const company = state?.settings?.companyName || 'Staff Report';
    const st = staff.find(s => s.id === monthlyStaffId);
    
    doc.setFontSize(16);
    doc.text(company, 14, 20);
    doc.setFontSize(12);
    doc.text(`Monthly Report: ${st?.name || ''} - ${month}`, 14, 30);

    // Attendance Summary Widgets
    doc.setFontSize(10);
    doc.setFillColor(220, 252, 231); // Green background
    doc.roundedRect(14, 38, 40, 18, 2, 2, 'F');
    doc.setTextColor(22, 163, 74);
    doc.text('Present', 17, 45);
    doc.setFontSize(14);
    doc.text(String(counts.present + counts.late), 17, 52);

    doc.setFillColor(255, 237, 213); // Orange background
    doc.roundedRect(58, 38, 35, 18, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setTextColor(234, 88, 12);
    doc.text('Late', 61, 45);
    doc.setFontSize(14);
    doc.text(String(counts.late), 61, 52);

    doc.setFillColor(219, 234, 254); // Blue background
    doc.roundedRect(97, 38, 35, 18, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setTextColor(37, 99, 235);
    doc.text('Leave', 100, 45);
    doc.setFontSize(14);
    doc.text(String(counts.leave), 100, 52);

    doc.setFillColor(254, 243, 199); // Amber/Yellow background for Early Out
    doc.roundedRect(136, 38, 35, 18, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setTextColor(180, 83, 9);
    doc.text('Early', 139, 44);
    doc.text('Out', 139, 49);
    doc.setFontSize(14);
    doc.text(String(counts.earlyOutDays), 139, 55);

    doc.setFillColor(254, 226, 226); // Red background
    doc.roundedRect(175, 38, 32, 18, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setTextColor(220, 38, 38);
    doc.text('Absent', 178, 45);
    doc.setFontSize(14);
    doc.text(String(counts.absent), 178, 52);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);

    const tableData = monthRecords
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(r => [r.date, r.status, r.checkIn || '-', r.checkOut || '-', r.lateMinutes || '-', r.earlyOutMinutes || '-']);

    // Add totals row
    tableData.push(['Total', '', '', '', counts.totalLateMinutes, counts.totalEarlyOutMinutes]);

    doc.autoTable({
      head: [['Date', 'Status', 'Check In', 'Check Out', 'Late Min', 'Early Out Min']],
      body: tableData,
      startY: 62,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [20, 184, 166] }
    });

    let y = doc.lastAutoTable?.finalY || 62;
    
    y += 20;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Salary Calculation:', 14, y);
    y += 10;
    doc.setFontSize(10);
    
    // Helper to draw a row with label left and value right
    const drawRow = (label, value, valueColor = [0, 0, 0], isBold = false) => {
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(label, 14, y);
      doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
      const valueWidth = doc.getTextWidth(value);
      doc.text(value, 200 - valueWidth, y); // Right align at x=200
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      y += 6;
    };
    
    // Helper for detail text (smaller, gray)
    const drawDetail = (text) => {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(text, 14, y);
      y += 5;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
    };
    
    // Base Salary
    drawRow('Base Salary', `${salaryCalc.base.toLocaleString()} PKR`);
    
    // Per Day Rate
    drawRow('Per Day Rate', `${salaryCalc.perDay.toFixed(2)} PKR`);
    
    // Bonus
    drawRow(`Bonus (${(counts.present + counts.late).toFixed(1)} days)`, `+${salaryCalc.bonus.toFixed(2)} PKR`, [0, 150, 0]);
    
    y += 2; // Small gap before deductions
    
    // Absent
    drawRow('Absent', `-${salaryCalc.absentDeduction.toFixed(2)} PKR`, [220, 38, 38]);
    const absentDetail = settings.absentChargesEnabled
      ? `${counts.absent} days x ${salaryCalc.perDay.toFixed(0)} PKR`
      : `${counts.absent} days x ${settings.deductionPerAbsent || 0} PKR`;
    drawDetail(absentDetail);
    
    // Late
    const lateAmount = salaryCalc.lateDeduction || 0;
    drawRow('Late', `-${lateAmount.toFixed(2)} PKR`, [220, 38, 38]);
    const lateDetail = salaryCalc.totalLateMinutes > 0
      ? `${counts.late} days (${salaryCalc.totalLateMinutes} min x ${settings.deductionPerMinute || 0} PKR)`
      : `${counts.late} days x ${settings.deductionPerLate || 0} PKR`;
    drawDetail(lateDetail);
    
    // Early Out
    const earlyOutAmount = salaryCalc.earlyOutDeduction || 0;
    drawRow('Early Out', `-${earlyOutAmount.toFixed(2)} PKR`, [220, 38, 38]);
    const earlyOutDetail = salaryCalc.totalEarlyOutMinutes > 0
      ? `${counts.earlyOutDays} days (${salaryCalc.totalEarlyOutMinutes} min x ${settings.deductionPerMinuteEarlyOut || 0} PKR)`
      : `${counts.earlyOutDays} days`;
    drawDetail(earlyOutDetail);
    
    // Total Deductions
    y += 1;
    drawRow('Total Deductions', `-${salaryCalc.ded.toFixed(2)} PKR`, [220, 38, 38], true);
    
    // Paid This Month
    drawRow('Paid This Month', `-${Number(salaryCalc.paid || 0).toLocaleString()} PKR`, [234, 88, 12]);
    
    y += 3;
    
    // Net Salary Due (highlighted)
    doc.setFillColor(220, 252, 231); // Light green background
    doc.roundedRect(12, y - 5, 186, 12, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Net Salary Due', 16, y + 1);
    doc.setTextColor(0, 150, 0);
    const netDueText = `${Number(salaryCalc.netDue || 0).toLocaleString()} PKR`;
    const netDueWidth = doc.getTextWidth(netDueText);
    doc.text(netDueText, 196 - netDueWidth, y + 1);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y += 12;
    
    const staffPayNotes = payNotes.filter(n => n.staffId === monthlyStaffId && n.month === month);
    if (staffPayNotes.length > 0) {
      y += 15;
      doc.setFontSize(11);
      doc.text('Pay Notes:', 14, y);
      y += 10;
      doc.setFontSize(10);
      staffPayNotes.forEach((n, idx) => {
        const date = new Date(n.createdAt).toLocaleDateString();
        doc.text(`${idx + 1}. ${n.notes || '(No note)'} - ${Number(n.amount).toLocaleString()} PKR (${date})`, 14, y);
        y += 7;
      });
    }
    
    doc.save(`${st?.name || 'staff'}_${month}_report.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl shadow-lg p-4 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">📊 Monthly Report & Salary</h2>
            <p className="text-teal-100 text-sm">View attendance records and calculate monthly salary</p>
          </div>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-5">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">👤 Select Staff</label>
            <select
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
              value={monthlyStaffId}
              onChange={e => setMonthlyStaffId(e.target.value)}
            >
              <option value="">Choose a staff member...</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} - {s.position}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">📅 Select Month</label>
            <input
              type="month"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
              value={month}
              onChange={e => setMonth(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-green-200 dark:border-slate-600 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm">✓</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Present</span>
          </div>
          <div className="text-3xl font-bold text-green-600">{counts.present + counts.late}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-orange-200 dark:border-slate-600 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm">⚠</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Late</span>
          </div>
          <div className="text-3xl font-bold text-orange-600">{counts.late}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-amber-200 dark:border-slate-600 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm">🏃</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Early Out</span>
          </div>
          <div className="text-3xl font-bold text-amber-600">{counts.earlyOutDays}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-blue-200 dark:border-slate-600 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm">🏖</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Leave</span>
          </div>
          <div className="text-3xl font-bold text-blue-600">{counts.leave}</div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-red-200 dark:border-slate-600 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center text-sm">✗</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Absent</span>
          </div>
          <div className="text-3xl font-bold text-red-600">{counts.absent}</div>
        </div>
      </div>

      {/* Attendance Records Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
            Monthly Attendance Records ({monthRecords.length} days)
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-700/50">
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Check In</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Check Out</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">Late Minutes</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Early Out Minutes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {monthRecords.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="text-slate-400 dark:text-slate-500">
                      <div className="text-4xl mb-2">📋</div>
                      <p>{monthlyStaffId ? 'No records for this month' : 'Select a staff member to view records'}</p>
                    </div>
                  </td>
                </tr>
              )}
              {monthRecords.sort((a, b) => a.date.localeCompare(b.date)).map((r, idx) => (
                <tr key={r.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}>
                  <td className="px-6 py-4">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{r.date}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      r.status === 'Present' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' :
                      r.status === 'Late' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' :
                      r.status === 'Absent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' :
                      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {r.checkIn ? (
                      <span className="font-medium text-slate-700 dark:text-slate-300">{formatTime12(r.checkIn)}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {r.checkOut ? (
                      <span className="font-medium text-slate-700 dark:text-slate-300">{formatTime12(r.checkOut)}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {r.lateMinutes > 0 ? (
                      <span className="font-medium text-orange-600">{r.lateMinutes}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {r.earlyOutMinutes > 0 ? (
                      <span className="font-medium text-blue-600">{r.earlyOutMinutes}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {/* Totals Row */}
              {monthRecords.length > 0 && (
                <tr className="bg-slate-100 dark:bg-slate-700 font-semibold border-t-2 border-slate-300 dark:border-slate-500">
                  <td className="px-6 py-4 text-left text-slate-800 dark:text-slate-200" colSpan={4}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                      Total
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-orange-600 font-bold">{counts.totalLateMinutes}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-blue-600 font-bold">{counts.totalEarlyOutMinutes}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {monthlyStaffId && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Salary Calculation Card */}
          <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-700 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                💰 Salary Calculation
              </h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600">
                <span className="text-slate-600 dark:text-slate-400">Base Salary</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{salaryCalc.base.toLocaleString()} PKR</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600">
                <span className="text-slate-600 dark:text-slate-400">Per Day Rate</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{salaryCalc.perDay.toFixed(2)} PKR</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600">
                <span className="text-slate-600 dark:text-slate-400">Bonus ({(counts.present + counts.late).toFixed(1)} days)</span>
                <span className="font-semibold text-green-600">+{salaryCalc.bonus.toFixed(2)} PKR</span>
              </div>
              {/* Absent Deduction */}
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600">
                <div className="flex flex-col">
                  <span className="text-slate-600 dark:text-slate-400">Absent</span>
                  <span className="text-xs text-slate-500">
                    {counts.absent} days {settings.absentChargesEnabled ? `× ${salaryCalc.perDay.toFixed(0)} PKR` : `× ${settings.deductionPerAbsent || 0} PKR`}
                  </span>
                </div>
                <span className="font-semibold text-red-600">-{salaryCalc.absentDeduction.toFixed(2)} PKR</span>
              </div>
              {/* Late Deduction */}
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600">
                <div className="flex flex-col">
                  <span className="text-slate-600 dark:text-slate-400">Late</span>
                  <span className="text-xs text-slate-500">
                    {counts.late} days {salaryCalc.totalLateMinutes > 0 ? `(${salaryCalc.totalLateMinutes} min × ${settings.deductionPerMinute || 0} PKR)` : `× ${settings.deductionPerLate || 0} PKR`}
                  </span>
                </div>
                <span className="font-semibold text-red-600">-{salaryCalc.lateDeduction.toFixed(2)} PKR</span>
              </div>
              {/* Early Out Deduction */}
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600">
                <div className="flex flex-col">
                  <span className="text-slate-600 dark:text-slate-400">Early Out</span>
                  <span className="text-xs text-slate-500">
                    {counts.earlyOutDays} days {salaryCalc.totalEarlyOutMinutes > 0 ? `(${salaryCalc.totalEarlyOutMinutes} min × ${settings.deductionPerMinuteEarlyOut || 0} PKR)` : ``}
                  </span>
                </div>
                <span className="font-semibold text-red-600">-{salaryCalc.earlyOutDeduction.toFixed(2)} PKR</span>
              </div>
              {/* Total Deductions */}
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 rounded px-3 -mx-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">Total Deductions</span>
                <span className="font-bold text-red-600">-{salaryCalc.ded.toFixed(2)} PKR</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-600">
                <span className="text-slate-600 dark:text-slate-400">Paid This Month</span>
                <span className="font-semibold text-orange-600">-{Number(salaryCalc.paid || 0).toLocaleString()} PKR</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg px-4 -mx-2 mt-4">
                <span className="font-semibold text-slate-800 dark:text-slate-200">Net Salary Due</span>
                <span className="text-2xl font-bold text-green-600">{Number(salaryCalc.netDue || 0).toLocaleString()} PKR</span>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all"
                onClick={() => { if (!monthlyStaffId) { toast.error('Select staff'); return; } setShowPayDialog(true); }}
              >
                <span>💳</span>
                <span>Pay Staff</span>
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all"
                onClick={downloadPDF}
              >
                <span>📄</span>
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          {/* Pay Notes Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span>📝</span>
                Payment History
              </h3>
            </div>
            <div className="p-6">
              {payNotes.filter(n => n.staffId === monthlyStaffId && n.month === month).length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">📝</div>
                  <p className="text-slate-500 dark:text-slate-400">No payments recorded this month</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {payNotes.filter(n => n.staffId === monthlyStaffId && n.month === month).map(n => (
                    <div key={n.id} className="flex items-start justify-between gap-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-100 dark:border-slate-600">
                      <div className="flex-1">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{n.notes || '(No note)'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{Number(n.amount).toLocaleString()} PKR</div>
                        <button
                          className="text-xs text-red-500 hover:text-red-700 mt-1 font-medium"
                          onClick={() => onDeletePayNote(n.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <PayDialog
        isOpen={showPayDialog}
        onClose={() => setShowPayDialog(false)}
        onSubmit={onAddPayNote}
        monthlyStaffId={monthlyStaffId}
        month={month}
      />
    </div>
  );
}
