import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useData } from '../../../state/DataContext.jsx';
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../../utils/reportDoc.js';
import SalarySlipDialog from '../components/SalarySlipDialog.jsx';
import DatePicker from '../../../components/DatePicker.jsx'

const btnPrint = 'ui-btn ui-btn-print';
const btnPdf = 'ui-btn ui-btn-pdf';

function money(n) {
  return Number(n || 0).toLocaleString();
}

function isPaid(status) {
  return status === 'paid';
}

function deductOf(r) {
  return Number(r.absentDeduction || 0) + Number(r.lateDeduction || 0) + Number(r.earlyOutDeduction || 0) + Number(r.manualDeduction || 0);
}

function extrasOf(r) {
  return Number(r.allowance || 0) + Number(r.bonus || 0) + Number(r.otPay || 0) + Number(r.doubleShift || 0);
}

function statusLabel(status) {
  if (isPaid(status)) return 'Paid';
  if (status === 'approved') return 'Approved';
  if (status === 'cancelled') return 'Cancelled';
  return 'Draft';
}

function statusClass(status) {
  if (isPaid(status)) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (status === 'approved') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  if (status === 'cancelled') return 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
}

export default function PayrollTab({
  staff, month, setMonth, toast, businessDate, API, token, confirm, companyName, onRefreshAdvances
}) {
  const { state } = useData();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [tab, setTab] = useState('draft');
  const [slipRun, setSlipRun] = useState(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const loadRuns = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/payroll?period=${encodeURIComponent(month)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setRows(await res.json());
        setSelected([]);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadRuns(); }, [month, token, API]);

  const staffCount = useMemo(() => (staff || []).filter((s) => s.status !== 'inactive').length, [staff]);
  const allGenerated = staffCount > 0 && rows.length >= staffCount;
  const remaining = Math.max(0, staffCount - rows.length);

  const drafts = rows.filter((r) => r.status === 'draft');
  const approved = rows.filter((r) => r.status === 'approved');
  const paid = rows.filter((r) => isPaid(r.status));
  const draftIds = drafts.map((r) => String(r._id));
  const approvedIds = approved.map((r) => String(r._id));
  const selectableIds = [...draftIds, ...approvedIds];
  const selectedDrafts = selected.filter((id) => draftIds.includes(id));
  const selectedApproved = selected.filter((id) => approvedIds.includes(id));

  const tabRows = tab === 'draft' ? drafts : tab === 'approved' ? approved : paid;
  const visibleSelectable = tabRows.map((r) => String(r._id)).filter((id) => selectableIds.includes(id));
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((id) => selected.includes(id));

  const totals = useMemo(() => ({
    net: rows.reduce((s, r) => s + Number(r.netPay || 0), 0),
    advances: rows.reduce((s, r) => s + Number(r.advanceDeducted || 0), 0),
    purchases: rows.reduce((s, r) => s + Number(r.purchaseDeducted || 0), 0),
    paid: paid.reduce((s, r) => s + Number(r.netPay || 0), 0),
  }), [rows, paid]);

  function merge(updated) {
    setRows((prev) => prev.map((r) => updated.find((d) => String(d._id) === String(r._id)) || r));
  }

  function toggle(id, status) {
    if (isPaid(status) || status === 'cancelled') return;
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  async function runPayroll() {
    if (allGenerated) {
      toast?.success(`Payroll already generated for all ${staffCount} staff in ${month}. Use Regenerate to recalculate.`);
      return;
    }
    const ok = confirm
      ? await confirm({ title: 'Run payroll', message: `Generate payroll for ${remaining} staff that don't have one yet (${month})? Existing rows are not touched — use Regenerate to recalculate a specific staff.`, confirmText: 'Run Payroll', confirmStyle: 'primary' })
      : true;
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/payroll/run`, { method: 'POST', headers, body: JSON.stringify({ period: month, businessDate }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Run failed (${res.status})`);
      setRows(data.items || []);
      setSelected([]);
      const created = Number(data.created || 0);
      toast?.success(created > 0 ? `Draft payroll generated for ${created} staff (${month})` : `Payroll already generated for all staff (${month})`);
    } catch (e) {
      toast?.error(e.message || 'Failed to run payroll');
    } finally {
      setLoading(false);
    }
  }

  async function approveSelected() {
    if (!selectedDrafts.length) return;
    const ok = confirm
      ? await confirm({ title: 'Approve payroll', message: `Approve payroll for ${selectedDrafts.length} selected staff? You can still regenerate or delete until they are marked paid.`, confirmText: 'Approve', confirmStyle: 'primary' })
      : true;
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/payroll/approve`, { method: 'POST', headers, body: JSON.stringify({ ids: selectedDrafts }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Approve failed (${res.status})`);
      merge(data.items || []);
      setSelected([]);
      toast?.success(`Approved ${data.items?.length || 0} staff`);
    } catch (e) {
      toast?.error(e.message || 'Failed to approve payroll');
    } finally {
      setLoading(false);
    }
  }

  async function paySelected() {
    if (!selectedApproved.length) return;
    const ok = confirm
      ? await confirm({ title: 'Mark paid', message: `Mark ${selectedApproved.length} approved staff as paid? This posts salary expenses, deducts outstanding advances, and locks those runs.`, confirmText: 'Mark Paid', confirmStyle: 'primary' })
      : true;
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/payroll/pay`, { method: 'POST', headers, body: JSON.stringify({ ids: selectedApproved, date: businessDate }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Pay failed (${res.status})`);
      const done = data.items || [];
      merge(done);
      setSelected([]);
      if (done.length === 1) setSlipRun(done[0]);
      onRefreshAdvances?.();
      toast?.success(`Marked paid for ${done.length} staff`);
    } catch (e) {
      toast?.error(e.message || 'Failed to mark paid');
    } finally {
      setLoading(false);
    }
  }

  async function regenerateOne(id) {
    const ok = confirm
      ? await confirm({ title: 'Regenerate payroll', message: 'Recalculate attendance, deductions, advances, and earnings for this staff.', confirmText: 'Regenerate', confirmStyle: 'primary' })
      : true;
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/payroll/regenerate/${id}`, { method: 'POST', headers, body: JSON.stringify({ businessDate }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Regenerate failed (${res.status})`);
      if (data?.item) merge([data.item]);
      toast?.success('Payroll regenerated');
    } catch (e) {
      toast?.error(e.message || 'Failed to regenerate');
    } finally {
      setLoading(false);
    }
  }

  async function regenerateAll() {
    const targets = [...drafts, ...approved].filter((r) => !isPaid(r.status) && r.status !== 'cancelled');
    if (!targets.length) return;
    const ok = confirm
      ? await confirm({ title: 'Regenerate all', message: `Recalculate attendance, deductions, advances, and earnings for ${targets.length} unpaid staff rows (${month})?`, confirmText: 'Regenerate All', confirmStyle: 'primary' })
      : true;
    if (!ok) return;
    setLoading(true);
    const updated = [];
    let failed = 0;
    for (const r of targets) {
      try {
        const res = await fetch(`${API}/api/payroll/regenerate/${r._id}`, { method: 'POST', headers, body: JSON.stringify({ businessDate }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.item) updated.push(data.item);
        else failed++;
      } catch { failed++; }
    }
    if (updated.length) merge(updated);
    toast?.[failed ? 'error' : 'success'](failed ? `Regenerated ${updated.length} staff — ${failed} failed` : `Regenerated ${updated.length} staff`);
    setLoading(false);
  }

  async function deleteOne(id) {
    const ok = confirm
      ? await confirm({ title: 'Delete payroll', message: 'Delete this unpaid payroll row? You can run payroll again later.', confirmText: 'Delete' })
      : true;
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/payroll/${id}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (${res.status})`);
      }
      setRows((prev) => prev.filter((r) => String(r._id) !== String(id)));
      setSelected((cur) => cur.filter((x) => x !== id));
      toast?.success('Payroll row deleted');
    } catch (e) {
      toast?.error(e.message || 'Failed to delete payroll');
    } finally {
      setLoading(false);
    }
  }

  async function deletePeriod() {
    if (!rows.length) return;
    const ok = confirm
      ? await confirm({ title: 'Delete month payroll', message: `Delete all ${rows.length} payroll rows for ${month}? Paid rows with linked expenses are kept.`, confirmText: 'Delete All' })
      : true;
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/payroll/period?period=${encodeURIComponent(month)}`, { method: 'DELETE', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Delete failed (${res.status})`);
      await loadRuns();
      toast?.success(`Deleted ${data.deleted || 0} payroll rows for ${month}${data.skippedPaid ? ` · ${data.skippedPaid} paid rows kept` : ''}`);
    } catch (e) {
      toast?.error(e.message || 'Failed to delete payroll');
    } finally {
      setLoading(false);
    }
  }

  const openPrintPreview = async () => {
    if (!tabRows.length) { toast?.error('No payroll rows to print'); return; }
    try {
      const body =
        reportSummary([
          { label: 'Period', amount: month },
          { label: 'Tab', amount: tab },
          { label: 'Rows', amount: String(tabRows.length) },
          { label: 'Net payroll (all)', amount: `${money(totals.net)} PKR` },
        ]) +
        reportSec(`Payroll — ${tab} (${tabRows.length})`) +
        reportTable({
          headers: ['Employee', 'Position', { t: 'Basic', align: 'r' }, { t: 'Extras', align: 'r' }, { t: 'Gross', align: 'r' }, { t: 'Deduct.', align: 'r' }, { t: 'Advance', align: 'r' }, { t: 'Net Pay', align: 'r' }, 'Status'],
          numbered: true,
          rows: tabRows.map(r => [
            r.staffName,
            r.position || '',
            { v: money(r.basicSalary), align: 'r' },
            { v: money(extrasOf(r)), align: 'r' },
            { v: money(r.grossPay), align: 'r' },
            { v: money(deductOf(r)), align: 'r' },
            { v: money(r.advanceDeducted), align: 'r' },
            { v: money(r.netPay), align: 'r', cls: 'pos' },
            statusLabel(r.status),
          ]),
          emptyText: 'No payroll rows',
        });
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'Payroll Report',
        reportLabel: 'Payroll Report',
        reportNo: `Rpt #: PAY-${month}-${tab}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Period', month], ['View', tab]],
        metaRight: [['Records', String(tabRows.length)], ['Net (tab)', `${money(tabRows.reduce((s, r) => s + Number(r.netPay || 0), 0))} PKR`]],
        body,
      });
      await previewHtmlReport(html, `Payroll-${month}-${tab}.pdf`);
      toast?.success('Print preview opened');
    } catch (err) {
      console.error(err);
      toast?.error('Print preview failed');
    }
  };

  const exportPDF = () => {
    if (!tabRows.length) { toast?.error('No payroll rows to export'); return; }
    try {
      const doc = new jsPDF('l', 'pt', 'a4');
      doc.setFontSize(14);
      doc.text(state?.settings?.companyName || 'Payroll', 40, 32);
      doc.setFontSize(10);
      doc.text(`${month} · ${tab} · ${tabRows.length} rows`, 40, 46);
      doc.autoTable({
        head: [['Employee', 'Position', 'Basic', 'Extras', 'Gross', 'Deduct.', 'Advance', 'Purchases', 'Net Pay', 'Status']],
        body: tabRows.map(r => [
          r.staffName, r.position || '', money(r.basicSalary), money(extrasOf(r)), money(r.grossPay),
          money(deductOf(r)), money(r.advanceDeducted), money(r.purchaseDeducted), money(r.netPay), statusLabel(r.status),
        ]),
        startY: 54,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      });
      doc.save(`payroll-${month}-${tab}.pdf`);
      toast?.success('PDF exported successfully');
    } catch (err) {
      console.error(err);
      toast?.error('Failed to export PDF');
    }
  };

  function exportCsv() {
    const header = ['Employee', 'Position', 'Month', 'Present', 'Late', 'Leave', 'Absent', 'Base', 'Extras', 'Gross', 'Deductions', 'Advance Deducted', 'Purchase Deducted', 'Net Pay', 'Status', 'Slip No'];
    const csv = [header.join(',')];
    rows.forEach((r) => {
      csv.push([
        r.staffName, r.position || '', r.period,
        r.presentDays ?? 0, r.lateDays ?? 0, r.leaveDays ?? 0, r.absentDays ?? 0,
        r.basicSalary ?? 0, extrasOf(r), r.grossPay ?? 0, deductOf(r),
        r.advanceDeducted ?? 0, r.purchaseDeducted ?? 0, r.netPay ?? 0, statusLabel(r.status), r.slipNo || '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast?.success('CSV exported successfully');
  }

  const btn = 'inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/20 hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50';
  const btnSolid = 'inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 shadow-lg hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50';
  const btnDanger = 'inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-teal-500 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Payroll</h1>
            <p className="text-blue-100 text-sm mt-1">Run payroll, approve drafts, then mark paid · {month}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-10 w-[9.5rem] rounded-xl bg-white shadow"><DatePicker mode="month" value={month} onChange={v => { if (v) setMonth(v) }} allowClear={false} compact /></div>
            <button type="button" onClick={loadRuns} className={btn}>↻ Refresh</button>
            <button type="button" onClick={openPrintPreview} disabled={!tabRows.length} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} disabled={!tabRows.length} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCsv} disabled={!rows.length} className={btn}>⤓ CSV</button>
            <button
              type="button"
              onClick={runPayroll}
              className={`${btnSolid} ${allGenerated ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              ▶ Run payroll{!allGenerated && remaining > 0 ? ` (${remaining})` : ''}
            </button>
            <button type="button" onClick={deletePeriod} disabled={!rows.length} className={btnDanger}>Delete</button>
            <button type="button" onClick={regenerateAll} disabled={loading || !(drafts.length + approved.length)} className={btn}>↻ Regenerate all</button>
            <button type="button" disabled={!selectedDrafts.length} onClick={approveSelected} className={btnSolid}>✓ Approve</button>
            <button type="button" disabled={!selectedApproved.length} onClick={paySelected} className={btnSolid}>Mark paid</button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Draft / approved / paid</div>
          <div className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-200">{drafts.length} / {approved.length} / {paid.length}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Advance deducted</div>
          <div className="mt-2 text-2xl font-bold text-rose-600">{money(totals.advances)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Purchases deducted</div>
          <div className="mt-2 text-2xl font-bold text-violet-600">{money(totals.purchases)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Net payroll</div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">{money(totals.net)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Paid</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{money(totals.paid)}</div>
        </div>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        {/* Status tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 px-3 pt-3">
          {[
            { key: 'draft', label: 'Draft', count: drafts.length, active: 'text-amber-700 border-amber-500', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
            { key: 'approved', label: 'Approved', count: approved.length, active: 'text-blue-700 border-blue-500 dark:text-blue-400', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
            { key: 'paid', label: 'Paid', count: paid.length, active: 'text-emerald-700 border-emerald-500 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                tab === t.key ? t.active : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              {t.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${t.badge}`}>{t.count}</span>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 dark:bg-slate-700/50 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-3">
                  <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? selected.filter((id) => !visibleSelectable.includes(id)) : [...new Set([...selected, ...visibleSelectable])])} />
                </th>
                <th className="px-3 py-3">Employee</th>
                <th className="px-3 py-3 text-right">Basic</th>
                <th className="px-3 py-3 text-right">Extras</th>
                <th className="px-3 py-3 text-right">Gross</th>
                <th className="px-3 py-3 text-right">Deduct.</th>
                <th className="px-3 py-3 text-right">Advance</th>
                <th className="px-3 py-3 text-right">Purchases</th>
                <th className="px-3 py-3 text-right">Net</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading && !rows.length ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : tabRows.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">{rows.length === 0 ? 'No payroll for this month. Click Run payroll.' : `No ${tab} payroll rows for ${month}.`}</td></tr>
              ) : tabRows.map((r) => {
                const id = String(r._id);
                const locked = isPaid(r.status) || r.status === 'cancelled';
                return (
                  <tr key={id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-3 py-2">
                      <input type="checkbox" disabled={locked} checked={selected.includes(id)} onChange={() => toggle(id, r.status)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{r.staffName}</div>
                      <div className="text-[11px] text-slate-400">{r.position || ''} · {r.presentDays ?? 0} present / {r.absentDays ?? 0} absent</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold dark:text-slate-200">{money(r.basicSalary)}</td>
                    <td className="px-3 py-2 text-right tabular-nums dark:text-slate-300" title={r.extrasNote || ''}>{money(extrasOf(r))}</td>
                    <td className="px-3 py-2 text-right font-semibold dark:text-slate-200">{money(r.grossPay)}</td>
                    <td className="px-3 py-2 text-right text-rose-600">-{money(deductOf(r))}</td>
                    <td className="px-3 py-2 text-right text-amber-700 dark:text-amber-400">-{money(r.advanceDeducted)}</td>
                    <td className="px-3 py-2 text-right text-violet-600 dark:text-violet-400" title={`Unpaid staff purchases: ${money(r.pendingPurchases)}`}>-{money(r.purchaseDeducted)}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{money(r.netPay)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(r.status)}`}>{statusLabel(r.status)}{r.slipNo ? ` · ${r.slipNo}` : ''}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => setSlipRun(r)} className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-700">Slip</button>
                        {!locked ? (
                          <>
                            <button type="button" onClick={() => regenerateOne(id)} className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-700">Regenerate</button>
                            <button type="button" onClick={() => deleteOne(id)} className="rounded-lg bg-rose-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-rose-700">Delete</button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SalarySlipDialog open={!!slipRun} onClose={() => setSlipRun(null)} run={slipRun} API={API} token={token} companyName={companyName} companyInfo={state?.settings} />
    </div>
  );
}
