import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { computeStaffMonth } from './utils/salaryCalc.js';
import { buildStaffSummaryPdf } from './utils/printStaffSummary.js';
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js';
import { formatTime12 } from '../../utils/dateUtils.js';
import DatePicker from '../../components/DatePicker.jsx'

const btnPrint = 'ui-btn ui-btn-print';
const btnPdf = 'ui-btn ui-btn-pdf';
const btnCsv = 'ui-btn ui-btn-csv';

// Full-page per-employee monthly summary (replaces the old summary dialog):
// attendance stats, salary breakdown incl. advances + paid, and the full
// daily records table — same detail as the Monthly View page.
export default function StaffMonthSummaryPage({
  staff, attendance, settings, advances, month, setMonth, businessDate, state, API, token
}) {
  const navigate = useNavigate();
  const { staffId } = useParams();
  const [searchParams] = useSearchParams();

  // Initialize the shared month from ?month=YYYY-MM (coming from Payroll)
  useEffect(() => {
    const m = searchParams.get('month');
    if (m && /^\d{4}-\d{2}$/.test(m) && m !== month) setMonth(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const st = useMemo(
    () => (staff || []).find(s => String(s.id) === String(staffId)),
    [staff, staffId]
  );

  const calc = useMemo(
    () => (st ? computeStaffMonth(st, attendance, settings, month, businessDate) : null),
    [st, attendance, settings, month, businessDate]
  );

  const staffAdvances = useMemo(
    () => (advances || []).filter(a => String(a.staffId) === String(staffId) && a.month === month && (a.type || 'issue') === 'issue'),
    [advances, staffId, month]
  );

  const [staffEarnings, setStaffEarnings] = useState([]);
  useEffect(() => {
    if (!staffId || !API || !token) { setStaffEarnings([]); return; }
    let mounted = true;
    const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    fetch(`${API}/api/staff-earnings?staffId=${encodeURIComponent(staffId)}&from=${month}-01&to=${month}-${String(last).padStart(2, '0')}&limit=500`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.ok ? r.json() : { items: [] })
      .then(d => { if (mounted) setStaffEarnings(d?.items || []); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [staffId, month, API, token]);

  const extrasSum = staffEarnings.reduce((s, e) => e.category === 'Deduction' ? s : s + Number(e.amount || 0), 0);
  const manualDeduction = staffEarnings.reduce((s, e) => e.category === 'Deduction' ? s + Number(e.amount || 0) : s, 0);
  const advTotal = staffAdvances.reduce((s, a) => s + Number(a.amount || 0), 0);
  const netDue = calc ? Math.max(0, calc.net + extrasSum - manualDeduction - advTotal) : 0;
  const counts = calc?.counts || { present: 0, late: 0, leave: 0, absent: 0, earlyOutDays: 0, totalLateMinutes: 0, totalEarlyOutMinutes: 0 };
  const records = calc?.records || [];

  const openPrintPreview = async () => {
    if (!calc || !st) { toast.error('No data to print'); return; }
    try {
      const body =
        reportSummary([
          { label: 'Present (incl. late)', amount: String(counts.present + counts.late) },
          { label: 'Late', amount: String(counts.late) },
          { label: 'Leave', amount: String(counts.leave) },
          { label: 'Absent', amount: String(counts.absent) },
          { label: 'Base salary', amount: `${calc.base.toLocaleString()} PKR` },
          { label: 'Net salary due', amount: `${netDue.toLocaleString()} PKR`, cls: 'pos' },
        ]) +
        reportSec(`Attendance Records (${records.length} days)`) +
        reportTable({
          headers: ['Date', 'Status', 'Check In', 'Check Out', { t: 'Late Min', align: 'r' }, { t: 'Early Out Min', align: 'r' }],
          numbered: true,
          rows: records.map(r => [
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
        title: `${st.name} — Monthly Summary`,
        reportLabel: 'Staff Monthly Summary',
        reportNo: `Rpt #: SMS-${month}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Staff', st.name], ['Month', month]],
        metaRight: [['Position', st.position || ''], ['Records', String(records.length)]],
        body,
      });
      await previewHtmlReport(html, `${st.name}-${month}-summary.pdf`);
      toast.success('Print preview opened');
    } catch (err) {
      console.error(err);
      toast.error('Print preview failed');
    }
  };

  const exportPDF = () => {
    if (!calc || !st) { toast.error('No data to export'); return; }
    try {
      const doc = buildStaffSummaryPdf({
        st, calc, counts, records, staffAdvances, staffEarnings,
        advTotal, extrasSum, manualDeduction, netDue, month,
        companyName: state?.settings?.companyName,
      });
      doc.save(`${st.name || 'staff'}_${month}_summary.pdf`);
      toast.success('PDF exported successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF');
    }
  };

  const exportCSV = () => {
    if (!st) { toast.error('No data to export'); return; }
    try {
      const header = ['Date', 'Status', 'Check In', 'Check Out', 'Late Minutes', 'Early Out Minutes'];
      const lines = records.map(r =>
        [r.date, r.status, r.checkIn || '', r.checkOut || '', r.lateMinutes || 0, r.earlyOutMinutes || 0]
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      );
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${st.name || 'staff'}_${month}_attendance.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported successfully');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  const Stat = ({ label, value, tone }) => (
    <div className={`rounded-lg border p-3 text-center ${tone}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );

  const Row = ({ label, value, className = '' }) => (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${className}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-4 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/staff/payroll')}
            className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors"
          >
            ← Payroll
          </button>
          <div>
            <h2 className="text-lg font-semibold">{st?.name || 'Staff'} — Monthly Summary</h2>
            <p className="text-blue-100 text-sm">{st?.position || ''} · {month}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-[9.5rem] rounded-lg bg-white shadow">
            <DatePicker mode="month" value={month} onChange={v => { if (v) setMonth(v) }} allowClear={false} compact />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openPrintPreview} disabled={!calc} className={`${btnPrint} disabled:opacity-50 text-sm`}>Print</button>
            <button type="button" onClick={exportPDF} disabled={!calc} className={`${btnPdf} disabled:opacity-50 text-sm`}>PDF</button>
            <button type="button" onClick={exportCSV} disabled={!st} className={`${btnCsv} disabled:opacity-50 text-sm`}>CSV</button>
          </div>
        </div>
      </div>

      {!st ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-400">
          Staff member not found
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Present" value={counts.present + counts.late} tone="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600" />
            <Stat label="Late" value={counts.late} tone="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-600" />
            <Stat label="Early Out" value={counts.earlyOutDays} tone="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600" />
            <Stat label="Leave" value={counts.leave} tone="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600" />
            <Stat label="Absent" value={counts.absent} tone="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600" />
          </div>

          {/* Salary Breakdown */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 font-semibold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600">
              Salary Calculation
            </div>
            <div className="p-4">
              {calc && (
                <>
                  <Row label="Base Salary" value={`${calc.base.toLocaleString()} PKR`} />
                  <Row label="Per Day Rate" value={`${calc.perDay.toFixed(2)} PKR`} />
                  <Row label={`Bonus (${counts.present + counts.late} days)`} value={`+${calc.bonus.toFixed(2)} PKR`} className="text-green-600" />
                  <Row label={`Absent (${counts.absent} days)`} value={`-${calc.absentDeduction.toFixed(2)} PKR`} className="text-red-600" />
                  <Row label={`Late (${counts.late} days, ${calc.totalLateMinutes} min)`} value={`-${calc.lateDeduction.toFixed(2)} PKR`} className="text-red-600" />
                  <Row label={`Early Out (${counts.earlyOutDays} days, ${calc.totalEarlyOutMinutes} min)`} value={`-${calc.earlyOutDeduction.toFixed(2)} PKR`} className="text-red-600" />
                  <Row label="Total Deductions" value={`-${calc.ded.toFixed(2)} PKR`} className="text-red-600" />
                  <Row label={`Earnings (${staffEarnings.filter(e => e.category !== 'Deduction').length})`} value={`+${extrasSum.toLocaleString()} PKR`} className="text-emerald-600" />
                  <Row label={`Adjustments (${staffEarnings.filter(e => e.category === 'Deduction').length})`} value={`-${manualDeduction.toLocaleString()} PKR`} className="text-red-600" />
                  <Row label={`Advances Taken (${staffAdvances.length})`} value={`-${advTotal.toLocaleString()} PKR`} className="text-purple-600" />
                  <div className="flex justify-between items-center py-2.5 mt-2 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg px-3">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Net Salary Due</span>
                    <span className="text-xl font-bold text-green-600">{netDue.toLocaleString()} PKR</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Attendance Records */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 font-semibold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600">
              Attendance Records ({records.length} days)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-700/50">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Date</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Check In</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Check Out</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-orange-600 uppercase">Late Min</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600 uppercase">Early Out Min</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {records.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No records for this month</td></tr>
                  )}
                  {records.map((r, idx) => (
                    <tr key={r.id} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}>
                      <td className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">{r.date}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'Present' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' :
                          r.status === 'Late' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' :
                          r.status === 'Absent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' :
                          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-2 text-center text-sm text-slate-700 dark:text-slate-300">{r.checkIn ? formatTime12(r.checkIn) : '-'}</td>
                      <td className="px-4 py-2 text-center text-sm text-slate-700 dark:text-slate-300">{r.checkOut ? formatTime12(r.checkOut) : '-'}</td>
                      <td className="px-4 py-2 text-center text-sm text-orange-600">{r.lateMinutes > 0 ? r.lateMinutes : '-'}</td>
                      <td className="px-4 py-2 text-center text-sm text-blue-600">{r.earlyOutMinutes > 0 ? r.earlyOutMinutes : '-'}</td>
                    </tr>
                  ))}
                  {records.length > 0 && (
                    <tr className="bg-slate-100 dark:bg-slate-700 font-semibold border-t-2 border-slate-300 dark:border-slate-500">
                      <td className="px-4 py-2 text-slate-800 dark:text-slate-200" colSpan={4}>Total</td>
                      <td className="px-4 py-2 text-center text-orange-600">{counts.totalLateMinutes}</td>
                      <td className="px-4 py-2 text-center text-blue-600">{counts.totalEarlyOutMinutes}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Earnings & Adjustments */}
          {staffEarnings.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 font-semibold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600">
                Earnings &amp; Adjustments
              </div>
              <div className="p-3 space-y-2">
                {staffEarnings.map(n => (
                  <div key={n._id} className="flex items-start justify-between gap-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-100 dark:border-slate-600">
                    <div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{n.category === 'Deduction' ? 'Adjustment (Deduction)' : n.category}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{n.date}{n.notes ? ` · ${n.notes}` : ''}</div>
                    </div>
                    <div className={`text-sm font-bold ${n.category === 'Deduction' ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>{n.category === 'Deduction' ? '-' : '+'}{Number(n.amount).toLocaleString()} PKR</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
