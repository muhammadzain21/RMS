import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { computeStaffMonth } from './utils/salaryCalc.js';
import { openStaffSummaryPrintPreview } from './utils/printStaffSummary.js';

const formatTime12 = (t) => {
  if (!t) return '';
  let [h, min] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(min).padStart(2, '0')} ${ampm}`;
};

// Full-page per-employee monthly summary (replaces the old summary dialog):
// attendance stats, salary breakdown incl. advances + paid, and the full
// daily records table — same detail as the Monthly View page.
export default function StaffMonthSummaryPage({
  staff, attendance, settings, payNotes, advances, month, setMonth, businessDate, state
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
    () => (advances || []).filter(a => String(a.staffId) === String(staffId) && a.month === month),
    [advances, staffId, month]
  );
  const staffPayNotes = useMemo(
    () => (payNotes || []).filter(n => String(n.staffId) === String(staffId) && n.month === month),
    [payNotes, staffId, month]
  );

  const advTotal = staffAdvances.reduce((s, a) => s + Number(a.amount || 0), 0);
  const paid = staffPayNotes.reduce((s, n) => s + Number(n.amount || 0), 0);
  const netDue = calc ? Math.max(0, calc.net - advTotal - paid) : 0;
  const counts = calc?.counts || { present: 0, late: 0, leave: 0, absent: 0, earlyOutDays: 0, totalLateMinutes: 0, totalEarlyOutMinutes: 0 };
  const records = calc?.records || [];

  const handlePrint = () => {
    if (!calc) return;
    openStaffSummaryPrintPreview({
      st, calc, counts, records, staffAdvances, staffPayNotes,
      advTotal, paid, netDue, month,
      companyName: state?.settings?.companyName
    });
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
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-slate-800 text-sm border-0 focus:ring-2 focus:ring-white/50"
          />
          <button
            onClick={handlePrint}
            className="px-4 py-1.5 rounded-lg bg-white text-teal-600 text-sm font-semibold hover:bg-blue-50 transition-colors"
          >
            Print
          </button>
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
                  <Row label={`Advances Taken (${staffAdvances.length})`} value={`-${advTotal.toLocaleString()} PKR`} className="text-purple-600" />
                  <Row label={`Paid This Month (${staffPayNotes.length})`} value={`-${paid.toLocaleString()} PKR`} className="text-orange-600" />
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

          {/* Payment History */}
          {staffPayNotes.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 font-semibold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600">
                Payment History
              </div>
              <div className="p-3 space-y-2">
                {staffPayNotes.map(n => (
                  <div key={n.id} className="flex items-start justify-between gap-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-100 dark:border-slate-600">
                    <div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{n.notes || '(No note)'}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{n.date || new Date(n.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{Number(n.amount).toLocaleString()} PKR</div>
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
