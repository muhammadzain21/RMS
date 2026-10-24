import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PayDialog from '../components/PayDialog';
import AddAdvanceDialog from '../components/AddAdvanceDialog.jsx';
import { computeStaffMonth } from '../utils/salaryCalc.js';

export default function PayrollTab({
  staff,
  attendance,
  settings,
  payNotes,
  advances,
  onAddPayNote,
  onAddAdvance,
  month,
  setMonth,
  toast,
  businessDate
}) {
  const navigate = useNavigate();
  const [payStaffId, setPayStaffId] = useState('');
  const [showAddAdvance, setShowAddAdvance] = useState(false);

  const rows = useMemo(() => {
    return (staff || [])
      .filter(s => s.status !== 'inactive')
      .map(st => {
        const calc = computeStaffMonth(st, attendance, settings, month, businessDate) || { counts: { present: 0, late: 0, leave: 0, absent: 0, earlyOutDays: 0, totalLateMinutes: 0, totalEarlyOutMinutes: 0 }, base: 0, net: 0 }
        const adv = (advances || [])
          .filter(a => String(a.staffId) === String(st.id) && a.month === month)
          .reduce((s, a) => s + Number(a.amount || 0), 0)
        const paid = (payNotes || [])
          .filter(n => String(n.staffId) === String(st.id) && n.month === month)
          .reduce((s, n) => s + Number(n.amount || 0), 0)
        const netDue = Math.max(0, calc.net - adv - paid)
        return { st, calc, adv, paid, netDue }
      })
      .sort((a, b) => String(a.st.name || '').localeCompare(String(b.st.name || '')))
  }, [staff, attendance, settings, payNotes, advances, month, businessDate])

  const totals = useMemo(() => {
    return rows.reduce((t, r) => ({
      present: t.present + r.calc.counts.present + r.calc.counts.late,
      late: t.late + r.calc.counts.late,
      leave: t.leave + r.calc.counts.leave,
      absent: t.absent + r.calc.counts.absent,
      lateMin: t.lateMin + r.calc.counts.totalLateMinutes,
      earlyMin: t.earlyMin + r.calc.counts.totalEarlyOutMinutes,
      base: t.base + r.calc.base,
      net: t.net + r.calc.net,
      adv: t.adv + r.adv,
      paid: t.paid + r.paid,
      netDue: t.netDue + r.netDue,
    }), { present: 0, late: 0, leave: 0, absent: 0, lateMin: 0, earlyMin: 0, base: 0, net: 0, adv: 0, paid: 0, netDue: 0 })
  }, [rows])

  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })

  const submitAdvance = (payload) => {
    onAddAdvance({ staffId: payload.staffId, month, date: payload.date, notes: payload.notes || '', amount: payload.amount })
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-4 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Payroll</h2>
            <p className="text-blue-100 text-sm">Salary earned from attendance, minus advances and payments</p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-blue-100 mb-1">Month</label>
              <input
                type="month"
                className="px-3 py-2 rounded-lg border border-white/30 bg-white/10 text-white focus:ring-2 focus:ring-white/60 transition-all"
                value={month}
                onChange={e => setMonth(e.target.value)}
              />
            </div>
            <button
              className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 border border-white/40 text-white font-medium transition-all"
              onClick={() => setShowAddAdvance(true)}
            >
              + Add Advance
            </button>
          </div>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
            Staff Payroll — {month}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-700/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Staff</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-green-600 uppercase tracking-wider">Present</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-orange-600 uppercase tracking-wider">Late</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-blue-600 uppercase tracking-wider">Leave</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-red-600 uppercase tracking-wider">Absent</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-orange-600 uppercase tracking-wider">Late Min</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-amber-600 uppercase tracking-wider">Early Out Min</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Base</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Earned</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-purple-600 uppercase tracking-wider">Advances</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-orange-600 uppercase tracking-wider">Paid</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-teal-600 uppercase tracking-wider">Net Due</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center">
                    <p className="text-slate-400 dark:text-slate-500">No staff found</p>
                  </td>
                </tr>
              )}
              {rows.map(({ st, calc, adv, paid, netDue }, idx) => (
                <tr key={st.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{st.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{st.position}</div>
                  </td>
                  <td className="px-3 py-3 text-center text-sm text-green-600 font-medium">{calc.counts.present + calc.counts.late}</td>
                  <td className="px-3 py-3 text-center text-sm text-orange-600 font-medium">{calc.counts.late}</td>
                  <td className="px-3 py-3 text-center text-sm text-blue-600 font-medium">{calc.counts.leave}</td>
                  <td className="px-3 py-3 text-center text-sm text-red-600 font-medium">{calc.counts.absent}</td>
                  <td className="px-3 py-3 text-center text-sm text-orange-600">{calc.counts.totalLateMinutes || '-'}</td>
                  <td className="px-3 py-3 text-center text-sm text-amber-600">{calc.counts.totalEarlyOutMinutes || '-'}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">{fmt(calc.base)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-slate-800 dark:text-slate-200">{fmt(calc.net)}</td>
                  <td className="px-4 py-3 text-right text-sm text-purple-600">{adv ? `-${fmt(adv)}` : '-'}</td>
                  <td className="px-4 py-3 text-right text-sm text-orange-600">{paid ? `-${fmt(paid)}` : '-'}</td>
                  <td className="px-4 py-3 text-right"><span className={`text-sm font-bold ${netDue > 0 ? 'text-teal-600' : 'text-slate-400'}`}>{fmt(netDue)}</span></td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => navigate(`/staff/payroll/summary/${st.id}?month=${month}`)}
                        className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-medium shadow hover:shadow-md transition-all"
                        title="Monthly summary"
                      >
                        Summary
                      </button>
                      <button
                        disabled={netDue <= 0}
                        onClick={() => setPayStaffId(st.id)}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-medium shadow hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Pay
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 dark:bg-slate-700 font-semibold border-t-2 border-slate-300 dark:border-slate-500">
                  <td className="px-4 py-3 text-slate-800 dark:text-slate-200">Total ({rows.length})</td>
                  <td className="px-3 py-3 text-center text-green-700">{totals.present}</td>
                  <td className="px-3 py-3 text-center text-orange-700">{totals.late}</td>
                  <td className="px-3 py-3 text-center text-blue-700">{totals.leave}</td>
                  <td className="px-3 py-3 text-center text-red-700">{totals.absent}</td>
                  <td className="px-3 py-3 text-center text-orange-700">{totals.lateMin || '-'}</td>
                  <td className="px-3 py-3 text-center text-amber-700">{totals.earlyMin || '-'}</td>
                  <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-200">{fmt(totals.base)}</td>
                  <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-200">{fmt(totals.net)}</td>
                  <td className="px-4 py-3 text-right text-purple-700 dark:text-purple-400">-{fmt(totals.adv)}</td>
                  <td className="px-4 py-3 text-right text-orange-700 dark:text-orange-400">-{fmt(totals.paid)}</td>
                  <td className="px-4 py-3 text-right text-teal-700 dark:text-teal-400">{fmt(totals.netDue)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <PayDialog
        isOpen={!!payStaffId}
        onClose={() => setPayStaffId('')}
        onSubmit={onAddPayNote}
        monthlyStaffId={payStaffId}
        month={month}
      />

      <AddAdvanceDialog
        isOpen={showAddAdvance}
        onClose={() => setShowAddAdvance(false)}
        onSubmit={submitAdvance}
        staff={staff}
        businessDate={businessDate}
        advances={advances}
        payNotes={payNotes}
        attendance={attendance}
        settings={settings}
        month={month}
      />
    </div>
  );
}
