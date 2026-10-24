import React, { useMemo, useState } from 'react';
import { computeStaffMonth } from '../utils/salaryCalc.js';

export default function AddAdvanceDialog({
  isOpen, onClose, onSubmit, staff, defaultStaffId = '', businessDate,
  advances = [], payNotes = [], attendance = [], settings = {}, month,
  editing = null
}) {
  const today = businessDate || new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(null); // lazily initialized on open

  const activeStaffId = form ? form.staffId : (editing?.staffId || defaultStaffId || '');

  // Selected staff's current-month picture: advances already taken and
  // salary still available (earned - advances - paid).
  const summary = useMemo(() => {
    if (!isOpen || !activeStaffId || !month) return null;
    const st = (staff || []).find(s => String(s.id) === String(activeStaffId));
    if (!st) return null;
    const calc = computeStaffMonth(st, attendance, settings, month, businessDate);
    // Exclude the advance being edited so 'remaining' reflects the true headroom
    const advList = (advances || []).filter(a => String(a.staffId) === String(activeStaffId) && a.month === month && String(a.id) !== String(editing?.id));
    const advTotal = advList.reduce((s, a) => s + Number(a.amount || 0), 0);
    const paid = (payNotes || [])
      .filter(n => String(n.staffId) === String(activeStaffId) && n.month === month)
      .reduce((s, n) => s + Number(n.amount || 0), 0);
    const earned = calc ? calc.net : 0;
    return { advTotal, advCount: advList.length, earned, paid, remaining: Math.max(0, earned - advTotal - paid) };
  }, [isOpen, activeStaffId, staff, advances, payNotes, attendance, settings, month, businessDate]);

  if (!isOpen) return null;

  const f = form || (editing
    ? { staffId: editing.staffId || '', date: editing.date || today, amount: editing.amount ?? '', notes: editing.notes || '' }
    : { staffId: defaultStaffId || '', date: today, amount: '', notes: '' });
  const set = (patch) => setForm({ ...f, ...patch });
  const overAmount = summary && Number(f.amount) > summary.remaining ? Number(f.amount) - summary.remaining : 0;

  const handleSubmit = () => {
    if (!f.staffId) return;
    const amt = Number(f.amount || 0);
    if (!(amt > 0)) return;
    onSubmit({ id: editing?.id, staffId: f.staffId, date: f.date, notes: f.notes.trim(), amount: amt });
    setForm(null);
    onClose();
  };

  const handleClose = () => { setForm(null); onClose(); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-full max-w-md p-5 rounded-xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">{editing ? 'Edit Advance' : 'Add Advance'}</h3>
          <button className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-sm" onClick={handleClose}>Close</button>
        </div>
        <div className="space-y-3">
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
          {summary && (
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
            <label className="block text-sm mb-1 text-slate-600 dark:text-slate-300">Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
              value={f.date}
              onChange={e => set({ date: e.target.value })}
            />
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
