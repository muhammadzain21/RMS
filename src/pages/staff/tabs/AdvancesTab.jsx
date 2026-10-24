import React, { useMemo, useState } from 'react';
import AddAdvanceDialog from '../components/AddAdvanceDialog.jsx';

export default function AdvancesTab({
  staff,
  advances,
  attendance,
  settings,
  payNotes,
  onAddAdvance,
  onUpdateAdvance,
  onDeleteAdvance,
  month,
  setMonth,
  toast,
  businessDate,
  confirm
}) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState(null);
  const [filterStaffId, setFilterStaffId] = useState('');

  const staffName = (id) => staff.find(s => s.id === id)?.name || '—';

  const monthAdvances = useMemo(() => {
    return (advances || [])
      .filter(a => a.month === month)
      .filter(a => !filterStaffId || a.staffId === filterStaffId);
  }, [advances, month, filterStaffId]);

  const totalAdvances = useMemo(() => {
    return monthAdvances.reduce((s, a) => s + Number(a.amount || 0), 0);
  }, [monthAdvances]);

  const submit = (payload) => {
    const base = { staffId: payload.staffId, month, date: payload.date, notes: payload.notes || '', amount: payload.amount };
    if (payload.id) onUpdateAdvance({ id: payload.id, ...base });
    else onAddAdvance(base);
  };

  const remove = async (id) => {
    if (confirm) {
      const ok = await confirm({
        title: 'Delete Advance',
        message: 'Delete this advance? It will no longer be deducted from payroll.',
        confirmText: 'Delete'
      });
      if (!ok) return;
    }
    onDeleteAdvance(id);
  };

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-4 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Staff Advances</h2>
            <p className="text-blue-100 text-sm">Record salary advances — deducted automatically in monthly payroll</p>
          </div>
          <button
            className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 border border-white/40 text-white font-medium transition-all"
            onClick={() => { setEditingAdvance(null); setShowAddDialog(true) }}
          >
            + Add Advance
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-5">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Filter by Staff</label>
            <select
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
              value={filterStaffId}
              onChange={e => setFilterStaffId(e.target.value)}
            >
              <option value="">All staff</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} - {s.position}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Month</label>
            <input
              type="month"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
              value={month}
              onChange={e => setMonth(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Advances List */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
            Advances ({monthAdvances.length})
          </h3>
          <div className="font-bold text-teal-600 dark:text-teal-400">Total: {totalAdvances.toLocaleString()} PKR</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-700/50">
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Staff</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Note</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {monthAdvances.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-slate-400 dark:text-slate-500">No advances recorded for {month}</p>
                  </td>
                </tr>
              )}
              {monthAdvances.map((a, idx) => (
                <tr key={a.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}>
                  <td className="px-6 py-4"><span className="font-medium text-slate-700 dark:text-slate-300">{a.date || '-'}</span></td>
                  <td className="px-6 py-4"><span className="font-medium text-slate-700 dark:text-slate-300">{staffName(a.staffId)}</span></td>
                  <td className="px-6 py-4"><span className="text-slate-600 dark:text-slate-400">{a.notes || '-'}</span></td>
                  <td className="px-6 py-4 text-right"><span className="font-bold text-slate-800 dark:text-slate-200">{Number(a.amount || 0).toLocaleString()} PKR</span></td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        className="px-2.5 py-1.5 rounded-md bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
                        onClick={() => { setEditingAdvance(a); setShowAddDialog(true) }}
                      >
                        Edit
                      </button>
                      <button
                        className="px-2.5 py-1.5 rounded-md bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                        onClick={() => remove(a.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddAdvanceDialog
        isOpen={showAddDialog}
        onClose={() => { setShowAddDialog(false); setEditingAdvance(null) }}
        onSubmit={submit}
        editing={editingAdvance}
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
