import React, { useEffect, useMemo, useState } from 'react';
import DatePicker from '../../../components/DatePicker.jsx';

export const EARNING_CATEGORIES = [
  { value: 'Bonus', label: 'Bonus' },
  { value: 'Allowance', label: 'Allowance' },
  { value: 'Award', label: 'Award' },
  { value: 'LumpSum', label: 'Lump-sum' },
  { value: 'Overtime', label: 'OT Pay' },
  { value: 'DoubleShift', label: 'Double Shift' },
  { value: 'RevenueShare', label: 'Revenue / % Share' },
  { value: 'Deduction', label: 'Adjustment (Deduction)' },
];

const FIELD = 'h-10 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-teal-500';

function monthBounds(month) {
  if (!month) return { from: undefined, to: undefined };
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export default function StaffEarningsDialog({
  open,
  onClose,
  staff,          // { id, name } | null — fixed employee
  staffOptions,   // [{ id, name }] — optional selector
  month,          // 'YYYY-MM' | undefined (all dates)
  readOnly,
  onChanged,
  API,
  token,
}) {
  const [staffId, setStaffId] = useState(staff?.id || '');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    staffId: staff?.id || '',
    date: new Date().toISOString().slice(0, 10),
    category: 'Bonus',
    amount: 0,
    notes: '',
  });

  const options = staffOptions?.length ? staffOptions : (staff ? [staff] : []);
  const selectedName = options.find((s) => String(s.id) === String(staffId))?.name || staff?.name || 'Staff';
  const { from, to } = useMemo(() => monthBounds(month), [month]);
  const locked = !!readOnly;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const computedAmount = useMemo(() => {
    if (form.category === 'RevenueShare') return Math.round(Number(form.base || 0) * (Number(form.rate || 0) / 100));
    return Number(form.amount || 0);
  }, [form]);

  const totals = useMemo(() => {
    return items.reduce((acc, it) => {
      const n = Number(it.amount || 0);
      if (it.category === 'Overtime') acc.ot += n;
      else if (it.category === 'DoubleShift') acc.dbl += n;
      else if (it.category === 'Deduction') acc.ded += n;
      else acc.allow += n;
      acc.all += it.category === 'Deduction' ? -n : n;
      return acc;
    }, { allow: 0, ot: 0, dbl: 0, ded: 0, all: 0 });
  }, [items]);

  function resetForm() {
    setEditId(null);
    setForm({
      staffId,
      date: month ? `${month}-01` : new Date().toISOString().slice(0, 10),
      category: 'Bonus',
      amount: 0,
      rate: undefined,
      base: undefined,
      notes: '',
    });
  }

  async function load() {
    if (!staffId) { setItems([]); return; }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ staffId: String(staffId), limit: '500' });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`${API}/api/staff-earnings?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems(data.items || []);
      else setError(data.error || 'Failed to load earnings');
    } catch {
      setError('Network error while loading earnings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setError('');
    const nextId = staff?.id || staffOptions?.[0]?.id || '';
    setStaffId(nextId);
    setForm({
      staffId: nextId,
      date: month ? `${month}-01` : new Date().toISOString().slice(0, 10),
      category: 'Bonus',
      amount: 0,
      notes: '',
    });
    setEditId(null);
  }, [open, staff?.id, month]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, staffId, from, to]);

  async function save() {
    if (!staffId) { setError('Select a staff member'); return; }
    if (!(computedAmount > 0)) { setError('Enter an amount greater than 0'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        staffId,
        date: form.date,
        category: form.category,
        notes: form.notes || '',
      };
      if (form.category === 'RevenueShare') {
        payload.rate = Number(form.rate || 0);
        payload.base = Number(form.base || 0);
      } else {
        payload.amount = Number(form.amount || 0);
      }
      const res = await fetch(`${API}/api/staff-earnings${editId ? `/${editId}` : ''}`, {
        method: editId ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      resetForm();
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Failed to save earning');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!id) return;
    try {
      const res = await fetch(`${API}/api/staff-earnings/${id}`, { method: 'DELETE', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Delete failed (${res.status})`);
      if (editId === id) resetForm();
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Failed to delete earning');
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/45 px-4 py-8">
      <div className="my-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Earnings &amp; Adjustments{selectedName ? ` — ${selectedName}` : ''}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Bonus, allowance, OT, double-shift and deduction records{month ? ` for ${month}` : ''}. These feed payroll extras and deductions.</p>
          </div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300">Close</button>
        </div>

        <div className="max-h-[78vh] space-y-4 overflow-y-auto px-6 py-4">
          {options.length > 1 ? (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Employee</label>
              <select value={staffId} onChange={(e) => { setStaffId(e.target.value); resetForm() }} className={FIELD}>
                {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          ) : null}

          {!locked ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{editId ? 'Edit entry' : 'Add earning / adjustment'}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <div className="mb-1">Date</div>
                  <DatePicker value={form.date} onChange={(v) => { if (v) setForm((f) => ({ ...f, date: v })) }} allowClear={false} />
                </div>
                <label className="text-sm text-slate-700 dark:text-slate-300">Category
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={`${FIELD} mt-1`}>
                    {EARNING_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
                {form.category === 'RevenueShare' ? (
                  <>
                    <label className="text-sm text-slate-700 dark:text-slate-300">Base amount
                      <input type="number" min={0} value={form.base ?? ''} onChange={(e) => setForm((f) => ({ ...f, base: Number(e.target.value) }))} className={`${FIELD} mt-1`} />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-300">Rate (%)
                      <input type="number" min={0} max={100} value={form.rate ?? ''} onChange={(e) => setForm((f) => ({ ...f, rate: Number(e.target.value) }))} className={`${FIELD} mt-1`} />
                    </label>
                  </>
                ) : (
                  <label className="text-sm text-slate-700 dark:text-slate-300">Amount (PKR)
                    <input type="number" min={0} value={form.amount || 0} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} className={`${FIELD} mt-1`} />
                  </label>
                )}
                <label className="sm:col-span-2 lg:col-span-3 text-sm text-slate-700 dark:text-slate-300">Notes
                  <input value={form.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={`${FIELD} mt-1`} placeholder={form.category === 'Deduction' ? 'e.g. uniform cost, damage recovery' : 'e.g. Sunday bonus, night OT'} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="text-slate-600 dark:text-slate-400">Computed amount: <span className="font-semibold text-slate-800 dark:text-slate-200">PKR {computedAmount.toLocaleString()}</span></div>
                <div className="flex gap-2">
                  {editId ? <button type="button" onClick={resetForm} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300">Cancel edit</button> : null}
                  <button type="button" disabled={saving} onClick={save} className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 text-white text-sm font-medium shadow disabled:opacity-50">{editId ? 'Save changes' : 'Add entry'}</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-700/50 px-4 py-3 text-sm text-slate-600 dark:text-slate-400">This month is marked paid. Earnings are view-only.</div>
          )}

          {error ? <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">{error}</div> : null}

          <div className="grid gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"><div className="text-[11px] text-slate-500 dark:text-slate-400">Allowance / Bonus</div><div className="font-bold dark:text-slate-200">{totals.allow.toLocaleString()}</div></div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"><div className="text-[11px] text-slate-500 dark:text-slate-400">OT Pay</div><div className="font-bold dark:text-slate-200">{totals.ot.toLocaleString()}</div></div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"><div className="text-[11px] text-slate-500 dark:text-slate-400">Double Shift</div><div className="font-bold dark:text-slate-200">{totals.dbl.toLocaleString()}</div></div>
            <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/10 px-3 py-2 text-sm"><div className="text-[11px] text-rose-500">Deductions</div><div className="font-bold text-rose-600">-{totals.ded.toLocaleString()}</div></div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"><div className="text-[11px] text-slate-500 dark:text-slate-400">Net extras</div><div className={`font-bold ${totals.all >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>{totals.all.toLocaleString()}</div></div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Notes</th>
                  {!locked ? <th className="px-4 py-2 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {items.map((it) => (
                  <tr key={String(it._id)}>
                    <td className="px-4 py-2 dark:text-slate-300">{it.date}</td>
                    <td className="px-4 py-2 dark:text-slate-300">{it.category === 'Deduction' ? <span className="rounded-full bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400">Deduction</span> : (EARNING_CATEGORIES.find((c) => c.value === it.category)?.label || it.category)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${it.category === 'Deduction' ? 'text-rose-600' : 'dark:text-slate-200'}`}>{it.category === 'Deduction' ? '-' : ''}PKR {Number(it.amount || 0).toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{it.notes || '—'}</td>
                    {!locked ? (
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => {
                            setEditId(String(it._id));
                            setForm({
                              staffId,
                              date: it.date,
                              category: it.category,
                              amount: it.amount,
                              rate: it.rate,
                              base: it.base,
                              notes: it.notes,
                            });
                          }} className="rounded-md bg-sky-600 px-2 py-1 text-xs font-bold text-white hover:bg-sky-700">Edit</button>
                          <button type="button" onClick={() => remove(it._id)} className="rounded-md bg-rose-600 px-2 py-1 text-xs font-bold text-white hover:bg-rose-700">Delete</button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={locked ? 4 : 5} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">{loading ? 'Loading…' : 'No earnings or adjustments'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
