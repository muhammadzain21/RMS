import React, { useMemo, useState } from 'react';
import { computeStaffMonth } from '../utils/salaryCalc.js';
import DatePicker from '../../../components/DatePicker.jsx';

export default function AddAdvanceDialog({
  isOpen, onClose, onSubmit, staff, defaultStaffId = '', businessDate,
  advances = [], attendance = [], settings = {}, month,
  editing = null, balances = []
}) {
  const today = businessDate || new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(null); // lazily initialized on open

  const activeStaffId = form ? form.staffId : (editing?.staffId || defaultStaffId || '');
  const staffBalance = balances.find(b => String(b.staffId) === String(activeStaffId)) || null;

  // Selected staff's current-month picture: advances already taken and
  // salary still available (earned - advances - paid).
  const summary = useMemo(() => {
    if (!isOpen || !activeStaffId || !month) return null;
    const st = (staff || []).find(s => String(s.id) === String(activeStaffId));
    if (!st) return null;
    const calc = computeStaffMonth(st, attendance, settings, month, businessDate);
    // Exclude the advance being edited so 'remaining' reflects the true headroom
    const advList = (advances || []).filter(a => String(a.staffId) === String(activeStaffId) && a.month === month && String(a.id) !== String(editing?.id) && (a.type || 'issue') === 'issue');
    const advTotal = advList.reduce((s, a) => s + Number(a.amount || 0), 0);
    const earned = calc ? calc.net : 0;
    return { advTotal, advCount: advList.length, earned, remaining: Math.max(0, earned - advTotal) };
  }, [isOpen, activeStaffId, staff, advances, attendance, settings, month, businessDate, editing?.id]);

  if (!isOpen) return null;

  const f = form || (editing
    ? { staffId: editing.staffId || '', date: editing.date || today, amount: editing.amount ?? '', notes: editing.notes || '', type: editing.type || 'issue' }
    : { staffId: defaultStaffId || '', date: today, amount: '', notes: '', type: 'issue' });
  const set = (patch) => setForm({ ...f, ...patch });
  const overAmount = summary && Number(f.amount) > summary.remaining ? Number(f.amount) - summary.remaining : 0;

  const handleSubmit = () => {
    if (!f.staffId) return;
    const amt = Number(f.amount || 0);
    if (!(amt > 0)) return;
    onSubmit({ id: editing?.id, staffId: f.staffId, date: f.date, notes: f.notes.trim(), amount: amt, type: f.type || 'issue' });
    setForm(null);
    onClose();
  };

  const handleClose = () => { setForm(null); onClose(); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto p-5 rounded-t-2xl sm:rounded-xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">{editing ? 'Edit Advance' : 'Add Advance'}</h3>
          <button className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-sm" onClick={handleClose}>Close</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1 text-slate-600 dark:text-slate-300">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!!editing}
                onClick={() => set({ type: 'issue' })}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${(f.type || 'issue') === 'issue' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} disabled:opacity-60`}
              >Issue</button>
              <button
                type="button"
                disabled={!!editing}
                onClick={() => set({ type: 'repay' })}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${f.type === 'repay' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} disabled:opacity-60`}
              >Repay</button>
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1 text-slate-600 dark:text-slate-300">Staff</label>
            <select
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
              value={f.staffId}
              onChange={e => set({ staffId: e.target.value })}
              disabled={!!editing}
            >
              <option value="">Select staff...</option>
              {(staff || []).filter(s => s.status !== 'inactive').map(s => (
                <option key={s.id} value={s.id}>{s.name} - {s.position}</option>
              ))}
            </select>
          </div>
          {staffBalance && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Advance limit</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{Number(staffBalance.advanceLimit || 0).toLocaleString()} PKR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Outstanding</span>
                <span className="font-semibold text-amber-600">{Number(staffBalance.outstanding || 0).toLocaleString()} PKR</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-600 pt-1 mt-1">
                <span className="text-slate-700 dark:text-slate-300 font-medium">{(f.type || 'issue') === 'issue' ? 'Available' : 'Repayable'}</span>
                <span className="font-bold text-emerald-600">{Number((f.type || 'issue') === 'issue' ? staffBalance.available : staffBalance.outstanding).toLocaleString()} PKR</span>
              </div>
            </div>
          )}
          {summary && !staffBalance && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Advances taken ({month})</span>
                <span className="font-semibold text-purple-600">{summary.advTotal.toLocaleString()} PKR{summary.advCount ? ` (${summary.advCount})` : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Already paid</span>
                <span className="font-semibold text-orange-600">{summary.paid.toLocaleString()} PKR</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-600 pt-1 mt-1">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Salary remaining</span>
                <span className="font-bold text-teal-600">{summary.remaining.toLocaleString()} PKR</span>
              </div>
            </div>
          )}
          {overAmount > 0 && (
            <p className="text-xs text-amber-600 font-medium">Amount exceeds remaining salary by {overAmount.toLocaleString()} PKR</p>
          )}
          <div>
            <DatePicker label="Date" value={f.date} onChange={v => { if (v) set({ date: v }) }} allowClear={false} />
          </div>
          <div>
            <label className="block text-sm mb-1 text-slate-600 dark:text-slate-300">Amount (PKR)</label>
            <input
              type="number"
              min={0}
              step={100}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
              value={f.amount}
              onChange={e => set({ amount: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-slate-600 dark:text-slate-300">Note</label>
            <input
              type="text"
              placeholder="e.g., Advance for..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
              value={f.notes}
              onChange={e => set({ notes: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600" onClick={handleClose}>Cancel</button>
          <button
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 text-white font-medium shadow hover:shadow-md transition-all disabled:opacity-50"
            disabled={!f.staffId || !(Number(f.amount) > 0)}
            onClick={handleSubmit}
          >
            {editing ? 'Update Advance' : 'Save Advance'}
          </button>
        </div>
      </div>
    </div>
  );
}
