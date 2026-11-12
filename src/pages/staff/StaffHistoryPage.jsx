import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import SalarySlipDialog from './components/SalarySlipDialog.jsx';
import { formatTime12 } from '../../utils/dateUtils.js';
import { useData } from '../../state/DataContext.jsx';
import { format } from 'date-fns';
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js';
import DatePicker from '../../components/DatePicker.jsx'

const btnPrint = 'ui-btn ui-btn-print';
const btnPdf = 'ui-btn ui-btn-pdf';
const btnCsv = 'ui-btn ui-btn-csv';

const TABS = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'adjustments', label: 'Adjustments' },
  { key: 'slips', label: 'Salary Slips' },
  { key: 'advances', label: 'Advances' },
  { key: 'purchases', label: 'Purchases' },
];

function monthBounds(month) {
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

function statusChip(s) {
  if (s === 'Present' || s === 'Late') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (s === 'Leave') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
}

export default function StaffHistoryPage({ staff, API, token, companyName, companyInfo }) {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const { state, businessDate } = useData();
  const st = useMemo(() => (staff || []).find((s) => String(s.id) === String(staffId)) || null, [staff, staffId]);

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [tab, setTab] = useState('attendance');
  const [loading, setLoading] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [slips, setSlips] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [slipRun, setSlipRun] = useState(null);
  const [viewOrder, setViewOrder] = useState(null);

  const { from, to } = useMemo(() => monthBounds(month), [month]);
  const earningRows = useMemo(() => earnings.filter((e) => e.category !== 'Deduction'), [earnings]);
  const deductionRows = useMemo(() => earnings.filter((e) => e.category === 'Deduction'), [earnings]);

  useEffect(() => {
    if (!staffId || !API || !token) return;
    let mounted = true;
    const headers = { Authorization: `Bearer ${token}` };
    (async () => {
      setLoading(true);
      try {
        const [attRes, earnRes, advRes, payRes, purRes] = await Promise.all([
          fetch(`${API}/api/attendance?month=${encodeURIComponent(month)}`, { headers }).then((r) => r.ok ? r.json() : []).catch(() => []),
          fetch(`${API}/api/staff-earnings?staffId=${encodeURIComponent(staffId)}&from=${from}&to=${to}&limit=500`, { headers }).then((r) => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
          fetch(`${API}/api/staff-advances?month=${encodeURIComponent(month)}`, { headers }).then((r) => r.ok ? r.json() : []).catch(() => []),
          fetch(`${API}/api/payroll?period=${encodeURIComponent(month)}`, { headers }).then((r) => r.ok ? r.json() : []).catch(() => []),
          fetch(`${API}/api/staff-purchases?staffId=${encodeURIComponent(staffId)}&month=${encodeURIComponent(month)}`, { headers }).then((r) => r.ok ? r.json() : []).catch(() => []),
        ]);
        if (!mounted) return;
        setAttendance((Array.isArray(attRes) ? attRes : attRes?.items || []).filter((a) => String(a.staffId) === String(staffId)));
        setEarnings(earnRes?.items || []);
        setAdvances((Array.isArray(advRes) ? advRes : advRes?.items || []).filter((a) => String(a.staffId) === String(staffId)));
        setSlips((Array.isArray(payRes) ? payRes : payRes?.items || []).filter((r) => String(r.staffId) === String(staffId)));
        setPurchases(Array.isArray(purRes) ? purRes : purRes?.items || []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [staffId, month, from, to, API, token]);

  const attSummary = useMemo(() => {
    let present = 0, leave = 0, absent = 0;
    for (const r of attendance) {
      if (r.status === 'Present' || r.status === 'Late') present++;
      else if (r.status === 'Leave') leave++;
      else absent++;
    }
    return { present, leave, absent };
  }, [attendance]);

  const earnTotal = useMemo(() => earningRows.reduce((s, r) => s + Number(r.amount || 0), 0), [earningRows]);
  const dedTotal = useMemo(() => deductionRows.reduce((s, r) => s + Number(r.amount || 0), 0), [deductionRows]);
  const slipTotals = useMemo(() => slips.reduce((acc, r) => {
    acc.gross += Number(r.grossPay || 0);
    acc.net += Number(r.netPay || 0);
    return acc;
  }, { gross: 0, net: 0 }), [slips]);
  const advanceBalance = useMemo(() => advances.reduce((s, r) => s + ((r.type || 'issue') === 'issue' ? 1 : -1) * Number(r.amount || 0), 0), [advances]);

  // Staff purchases: staff-method sales joined with pay-later purchase records
  const purchaseRows = useMemo(() => {
    const sales = (state?.sales || []).filter(s => String(s.paymentMethod || '') === 'staff' && String(s.staffId || '') === String(staffId) && String(s.date || '').slice(0, 7) === month);
    return sales.map(s => {
      const rec = purchases.find(p => String(p.saleId) === String(s.id || s._id));
      return {
        id: s.id || s._id,
        date: s.date,
        billNo: s.billNo ? `BILL-${s.billNo}` : (s.id || '').slice(0, 6),
        amount: Number(s.total || s.totalAmount || 0),
        settlement: s.staffSettlement === 'pay_later' ? 'Pay Later' : 'Salary Deduct',
        pending: rec ? rec.status === 'pending' : false,
        settledVia: rec?.settledVia || '',
        purchaseId: rec?._id || '',
        sale: s,
      };
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [state?.sales, purchases, staffId, month]);
  const pendingPurchaseTotal = useMemo(() => purchaseRows.filter(r => r.pending).reduce((s, r) => s + r.amount, 0), [purchaseRows]);

  const settlePurchase = async (row) => {
    try {
      const res = await fetch(`${API}/api/staff-purchases/${row.purchaseId}/settle`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ date: businessDate || new Date().toISOString().slice(0, 10) }) });
      if (!res.ok) { toast.error('Failed to settle'); return }
      setPurchases(prev => prev.map(p => String(p._id) === String(row.purchaseId) ? { ...p, status: 'settled', settledVia: 'cash' } : p));
      toast.success('Marked as paid — recorded as Pay In');
    } catch { toast.error('Failed to settle'); }
  };

  const deductPurchase = async (row) => {
    try {
      const res = await fetch(`${API}/api/staff-purchases/${row.purchaseId}/deduct`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error('Failed to convert'); return }
      setPurchases(prev => prev.map(p => String(p._id) === String(row.purchaseId) ? { ...p, status: 'settled', settledVia: 'salary' } : p));
      toast.success('Converted to salary deduction — deducted in payroll');
    } catch { toast.error('Failed to convert'); }
  };

  const counts = {
    attendance: attendance.length,
    earnings: earningRows.length,
    adjustments: deductionRows.length,
    slips: slips.length,
    advances: advances.length,
    purchases: purchaseRows.length,
  };

  const empty = (label) => (
    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">{loading ? 'Loading…' : `No ${label} for ${month}`}</td></tr>
  );

  const tabExport = useMemo(() => {
    const name = st?.name || 'Staff';
    const tabLabel = TABS.find(t => t.key === tab)?.label || tab;
    switch (tab) {
      case 'attendance':
        return {
          title: `${name} — Attendance (${month})`,
          tabLabel,
          summary: [
            { label: 'Present', amount: String(attSummary.present) },
            { label: 'Leave', amount: String(attSummary.leave) },
            { label: 'Absent', amount: String(attSummary.absent) },
          ],
          headers: ['Date', 'Status', 'Check In', 'Check Out', 'Notes'],
          rows: [...attendance].sort((a, b) => String(a.date).localeCompare(String(b.date))).map(r => [
            r.date, r.status || '—', formatTime12(r.checkIn) || '—', formatTime12(r.checkOut) || '—', r.notes || '—',
          ]),
        };
      case 'earnings':
        return {
          title: `${name} — Earnings (${month})`,
          tabLabel,
          summary: [{ label: 'Total earnings', amount: `${earnTotal.toLocaleString()} PKR` }],
          headers: ['Date', 'Category', 'Amount (PKR)', 'Notes'],
          rows: earningRows.map(r => [r.date, r.category, Number(r.amount || 0).toLocaleString(), r.notes || '—']),
        };
      case 'adjustments':
        return {
          title: `${name} — Adjustments (${month})`,
          tabLabel,
          summary: [{ label: 'Total deductions', amount: `${dedTotal.toLocaleString()} PKR` }],
          headers: ['Date', 'Type', 'Amount (PKR)', 'Notes'],
          rows: deductionRows.map(r => [r.date, 'Deduction', Number(r.amount || 0).toLocaleString(), r.notes || '—']),
        };
      case 'slips':
        return {
          title: `${name} — Salary Slips (${month})`,
          tabLabel,
          summary: [
            { label: 'Slips', amount: String(slips.length) },
            { label: 'Gross total', amount: `${slipTotals.gross.toLocaleString()} PKR` },
            { label: 'Net total', amount: `${slipTotals.net.toLocaleString()} PKR` },
          ],
          headers: ['Slip No', 'Period', 'Gross (PKR)', 'Net Pay (PKR)', 'Status'],
          rows: slips.map(row => [
            row.slipNo || '—', row.period, Number(row.grossPay || 0).toLocaleString(), Number(row.netPay || 0).toLocaleString(), row.status || '—',
          ]),
        };
      case 'advances':
        return {
          title: `${name} — Advances (${month})`,
          tabLabel,
          summary: [{ label: 'Net balance', amount: `${advanceBalance.toLocaleString()} PKR` }],
          headers: ['Date', 'Type', 'Amount (PKR)', 'Note'],
          rows: advances.map(r => {
            const t = r.type || 'issue';
            const label = t === 'issue' ? 'Advance' : t === 'payroll_deduct' ? 'Salary deduct' : 'Repayment';
            return [String(r.date || '').slice(0, 10), label, Number(r.amount || 0).toLocaleString(), r.notes || '—'];
          }),
        };
      case 'purchases':
        return {
          title: `${name} — Purchases (${month})`,
          tabLabel,
          summary: [{ label: 'Pending pay-later', amount: `${pendingPurchaseTotal.toLocaleString()} PKR` }],
          headers: ['Date', 'Bill', 'Settlement', 'Amount (PKR)', 'Status'],
          rows: purchaseRows.map(r => [
            r.date, r.billNo, r.settlement, r.amount.toLocaleString(),
            r.pending ? 'Pending' : r.settledVia === 'salary' ? 'Salary Deduct' : r.settlement === 'Pay Later' ? 'Paid' : '—',
          ]),
        };
      default:
        return { title: `${name} — ${tabLabel}`, tabLabel, summary: [], headers: [], rows: [] };
    }
  }, [tab, st, month, attendance, attSummary, earningRows, earnTotal, deductionRows, dedTotal, slips, slipTotals, advances, advanceBalance, purchaseRows, pendingPurchaseTotal]);

  const buildStaffHistoryReport = () => {
    const fileName = `Staff-History-${tab}-${month}.pdf`;
    const body =
      (tabExport.summary.length ? reportSummary(tabExport.summary) : '') +
      reportSec(tabExport.tabLabel) +
      reportTable({
        headers: tabExport.headers,
        numbered: true,
        rows: tabExport.rows,
        emptyText: `No ${tabExport.tabLabel.toLowerCase()} for ${month}`,
      });
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: tabExport.title,
      reportLabel: 'Staff History',
      reportNo: `Rpt #: SH-${month}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Staff', st?.name || '—'], ['Month', month]],
      metaRight: [['Tab', tabExport.tabLabel], ['Rows', String(tabExport.rows.length)]],
      body,
    });
    return { html, fileName };
  };

  const openPrintPreview = async () => {
    try {
      const { html, fileName } = buildStaffHistoryReport();
      await previewHtmlReport(html, fileName);
      toast.success('Print preview opened');
    } catch {
      toast.error('Print preview failed');
    }
  };

  const exportPDF = async () => {
    try {
      const { html, fileName } = buildStaffHistoryReport();
      await downloadHtmlReport(html, fileName);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to export PDF');
    }
  };

  const exportCSV = () => {
    try {
      const lines = tabExport.rows.map(r =>
        r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      );
      const blob = new Blob([[tabExport.headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff_history_${tab}_${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  const thead = 'bg-slate-100 dark:bg-slate-700/50 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400';
  const th = 'px-4 py-3';
  const td = 'px-4 py-2';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-teal-500 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Staff History{st ? ` — ${st.name}` : ''}</h1>
            <p className="text-blue-100 text-sm mt-1">
              {st
                ? [st.position, st.joinDate && `Joined: ${st.joinDate}`].filter(Boolean).join(' · ')
                : 'Month-wise history'} · {month}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-10 w-[9.5rem] rounded-xl bg-white shadow"><DatePicker mode="month" value={month} onChange={v => { if (v) setMonth(v) }} allowClear={false} compact /></div>
            <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
            <button type="button" onClick={() => navigate(-1)} className="rounded-xl bg-white/15 px-4 py-2 text-xs font-bold uppercase tracking-wider ring-1 ring-white/20 hover:bg-white/25">Back</button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        {st && (
          <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 dark:border-slate-700 px-5 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-blue-500 text-lg font-extrabold text-white">{st.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-extrabold text-slate-800 dark:text-slate-200">{st.name}</div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{st.position || '—'}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
              <div><span className="text-slate-400">Phone:</span> <span className="font-semibold dark:text-slate-200">{st.phone || '—'}</span></div>
              <div><span className="text-slate-400">Joined:</span> <span className="font-semibold dark:text-slate-200">{st.joinDate || '—'}</span></div>
              <div><span className="text-slate-400">Salary:</span> <span className="font-semibold dark:text-slate-200">{st.salary ? `${Number(st.salary).toLocaleString()} PKR` : '—'}</span></div>
              <div><span className="text-slate-400">Status:</span> <span className={`font-bold ${st.status !== 'inactive' ? 'text-emerald-600' : 'text-rose-600'}`}>{st.status === 'inactive' ? 'Inactive' : 'Active'}</span></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">{attSummary.present} present</span>
              <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">{attSummary.leave} leave</span>
              <span className="rounded-full bg-rose-100 dark:bg-rose-900/40 px-2.5 py-1 text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">{attSummary.absent} absent</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 px-3 pt-3 overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${active ? 'border-blue-600 text-blue-700 dark:text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                {t.label}
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>{counts[t.key]}</span>
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          {tab === 'attendance' && (
            <table className="min-w-full text-left text-sm">
              <thead className={thead}><tr><th className={th}>Date</th><th className={th}>Status</th><th className={th}>Check In</th><th className={th}>Check Out</th><th className={th}>Notes</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {attendance.length === 0 ? empty('attendance records') : [...attendance].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r, i) => (
                  <tr key={r._id || i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className={`${td} font-medium dark:text-slate-200`}>{r.date}</td>
                    <td className={td}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusChip(r.status)}`}>{r.status || '—'}</span></td>
                    <td className={`${td} dark:text-slate-300`}>{formatTime12(r.checkIn) || '—'}</td>
                    <td className={`${td} dark:text-slate-300`}>{formatTime12(r.checkOut) || '—'}</td>
                    <td className={`${td} text-slate-500 dark:text-slate-400`}>{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'earnings' && (
            <table className="min-w-full text-left text-sm">
              <thead className={thead}><tr><th className={th}>Date</th><th className={th}>Category</th><th className={`${th} text-right`}>Amount</th><th className={th}>Notes</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {earningRows.length === 0 ? empty('earnings') : earningRows.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className={`${td} font-medium dark:text-slate-200`}>{r.date}</td>
                    <td className={`${td} dark:text-slate-300`}>{r.category}</td>
                    <td className={`${td} text-right font-semibold text-emerald-700 dark:text-emerald-400`}>+{Number(r.amount || 0).toLocaleString()}</td>
                    <td className={`${td} text-slate-500 dark:text-slate-400`}>{r.notes || '—'}</td>
                  </tr>
                ))}
                {earningRows.length > 0 && (
                  <tr className="bg-slate-50 dark:bg-slate-700/50 font-bold">
                    <td className={`${td} dark:text-slate-200`} colSpan={2}>Total earnings ({month})</td>
                    <td className={`${td} text-right text-emerald-700 dark:text-emerald-400`}>+{earnTotal.toLocaleString()}</td>
                    <td className={td} />
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'adjustments' && (
            <table className="min-w-full text-left text-sm">
              <thead className={thead}><tr><th className={th}>Date</th><th className={th}>Type</th><th className={`${th} text-right`}>Amount</th><th className={th}>Notes</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {deductionRows.length === 0 ? empty('adjustments') : deductionRows.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className={`${td} font-medium dark:text-slate-200`}>{r.date}</td>
                    <td className={td}><span className="rounded-full bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">Deduction</span></td>
                    <td className={`${td} text-right font-semibold text-rose-600`}>-{Number(r.amount || 0).toLocaleString()}</td>
                    <td className={`${td} text-slate-500 dark:text-slate-400`}>{r.notes || '—'}</td>
                  </tr>
                ))}
                {deductionRows.length > 0 && (
                  <tr className="bg-slate-50 dark:bg-slate-700/50 font-bold">
                    <td className={`${td} dark:text-slate-200`} colSpan={2}>Total deductions ({month})</td>
                    <td className={`${td} text-right text-rose-600`}>-{dedTotal.toLocaleString()}</td>
                    <td className={td} />
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'slips' && (
            <table className="min-w-full text-left text-sm">
              <thead className={thead}><tr><th className={th}>Slip No</th><th className={th}>Period</th><th className={`${th} text-right`}>Gross</th><th className={`${th} text-right`}>Deductions</th><th className={`${th} text-right`}>Net Pay</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {slips.length === 0 ? empty('salary slips') : slips.map((row) => {
                  const ded = Number(row.absentDeduction || 0) + Number(row.lateDeduction || 0) + Number(row.earlyOutDeduction || 0) + Number(row.manualDeduction || 0) + Number(row.advanceDeducted || 0);
                  const st2 = row.status === 'paid' ? 'Paid' : row.status === 'approved' ? 'Approved' : 'Draft';
                  return (
                    <tr key={row._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className={`${td} font-mono text-xs font-bold dark:text-slate-200`}>{row.slipNo || '—'}</td>
                      <td className={`${td} dark:text-slate-300`}>{row.period}</td>
                      <td className={`${td} text-right dark:text-slate-200`}>{Number(row.grossPay || 0).toLocaleString()}</td>
                      <td className={`${td} text-right text-rose-600`}>-{ded.toLocaleString()}</td>
                      <td className={`${td} text-right font-bold text-emerald-700 dark:text-emerald-400`}>{Number(row.netPay || 0).toLocaleString()}</td>
                      <td className={td}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${st2 === 'Paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : st2 === 'Approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>{st2}</span></td>
                      <td className={`${td} text-right`}>
                        <button type="button" onClick={() => setSlipRun(row)} className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-700">Print</button>
                      </td>
                    </tr>
                  );
                })}
                {slips.length > 0 && (
                  <tr className="bg-slate-50 dark:bg-slate-700/50 font-bold">
                    <td className={`${td} dark:text-slate-200`} colSpan={2}>Total ({slips.length} slip{slips.length > 1 ? 's' : ''})</td>
                    <td className={`${td} text-right dark:text-slate-200`}>{slipTotals.gross.toLocaleString()}</td>
                    <td className={td} />
                    <td className={`${td} text-right text-emerald-700 dark:text-emerald-400`}>{slipTotals.net.toLocaleString()}</td>
                    <td className={td} colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'purchases' && (
            <table className="min-w-full text-left text-sm">
              <thead className={thead}><tr><th className={th}>Date</th><th className={th}>Bill</th><th className={th}>Settlement</th><th className={`${th} text-right`}>Amount</th><th className={th}>Status</th><th className={`${th} text-right`}>Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {purchaseRows.length === 0 ? empty('staff purchases') : purchaseRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className={`${td} font-medium dark:text-slate-200`}>{r.date}</td>
                    <td className={`${td} font-mono text-xs dark:text-slate-300`}>{r.billNo}</td>
                    <td className={td}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.settlement === 'Pay Later' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'}`}>{r.settlement}</span></td>
                    <td className={`${td} text-right font-semibold dark:text-slate-200`}>{r.amount.toLocaleString()}</td>
                    <td className={td}>{r.settlement === 'Pay Later' ? (
                      r.pending
                        ? <span className="rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold uppercase">Pending</span>
                        : r.settledVia === 'salary'
                          ? <span className="rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-0.5 text-[10px] font-bold uppercase">Salary Deduct</span>
                          : <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold uppercase">Paid</span>
                    ) : <span className="text-slate-400 text-xs">—</span>}</td>
                    <td className={`${td} text-right`}>
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setViewOrder(r)} className="rounded-lg bg-slate-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-600">View</button>
                        {r.pending && r.purchaseId && (
                          <>
                            <button type="button" onClick={() => settlePurchase(r)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-emerald-700">Paid</button>
                            <button type="button" onClick={() => deductPurchase(r)} className="rounded-lg bg-violet-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-violet-700">Salary</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {purchaseRows.length > 0 && (
                  <tr className="bg-slate-50 dark:bg-slate-700/50 font-bold">
                    <td className={`${td} dark:text-slate-200`} colSpan={3}>Pending pay-later ({month})</td>
                    <td className={`${td} text-right ${pendingPurchaseTotal > 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>{pendingPurchaseTotal.toLocaleString()}</td>
                    <td className={td} colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'advances' && (
            <table className="min-w-full text-left text-sm">
              <thead className={thead}><tr><th className={th}>Date</th><th className={th}>Type</th><th className={`${th} text-right`}>Amount</th><th className={th}>Note</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {advances.length === 0 ? empty('advance entries') : advances.map((r, i) => {
                  const t = r.type || 'issue';
                  const label = t === 'issue' ? 'Advance' : t === 'payroll_deduct' ? 'Salary deduct' : 'Repayment';
                  const chip = t === 'issue' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : t === 'payroll_deduct' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
                  return (
                    <tr key={r._id || r.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className={`${td} font-medium dark:text-slate-200`}>{String(r.date || '').slice(0, 10)}</td>
                      <td className={td}><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${chip}`}>{label}</span></td>
                      <td className={`${td} text-right font-semibold ${t === 'issue' ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>{t === 'issue' ? '+' : '-'}{Number(r.amount || 0).toLocaleString()}</td>
                      <td className={`${td} text-slate-500 dark:text-slate-400`}>{r.notes || '—'}</td>
                    </tr>
                  );
                })}
                {advances.length > 0 && (
                  <tr className="bg-slate-50 dark:bg-slate-700/50 font-bold">
                    <td className={`${td} dark:text-slate-200`} colSpan={2}>Net balance ({month})</td>
                    <td className={`${td} text-right ${advanceBalance > 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>{advanceBalance >= 0 ? advanceBalance.toLocaleString() : `-${Math.abs(advanceBalance).toLocaleString()}`}</td>
                    <td className={td} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Staff purchase order detail */}
      {viewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setViewOrder(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-100">Order Detail — {viewOrder.billNo}</div>
                <div className="text-xs text-slate-400">{viewOrder.date}{viewOrder.sale?.orderType ? ` · ${viewOrder.sale.orderType}` : ''}{viewOrder.sale?.tableNo ? ` · Table ${viewOrder.sale.tableNo}` : ''}</div>
              </div>
              <button type="button" onClick={() => setViewOrder(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="text-left pb-1">Item</th>
                  <th className="text-right pb-1 w-12">Qty</th>
                  <th className="text-right pb-1 w-20">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {(viewOrder.sale?.items || []).map((it, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium text-slate-700 dark:text-slate-200">{it.custom?.name || it.name || '—'}</div>
                      {it.mods && Object.keys(it.mods).length > 0 && (
                        <div className="text-[10px] text-slate-400">{Object.entries(it.mods).map(([k, v]) => Array.isArray(v) ? v.join(', ') : v).filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{it.qty}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">{(Number(it.price || 0) * Number(it.qty || 0)).toLocaleString()}</td>
                  </tr>
                ))}
                {(viewOrder.sale?.items || []).length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-400">No item detail stored for this order</td></tr>
                )}
              </tbody>
            </table>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-1 text-sm">
              {Number(viewOrder.sale?.itemsDiscount || 0) + Number(viewOrder.sale?.billDiscount || 0) > 0 && (
                <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{(Number(viewOrder.sale?.itemsDiscount || 0) + Number(viewOrder.sale?.billDiscount || 0)).toLocaleString()}</span></div>
              )}
              {Number(viewOrder.sale?.taxAmt || 0) > 0 && <div className="flex justify-between text-slate-500"><span>Tax</span><span>{Number(viewOrder.sale.taxAmt).toLocaleString()}</span></div>}
              {Number(viewOrder.sale?.serviceAmt || 0) > 0 && <div className="flex justify-between text-slate-500"><span>Service</span><span>{Number(viewOrder.sale.serviceAmt).toLocaleString()}</span></div>}
              <div className="flex justify-between font-bold text-slate-800 dark:text-slate-100"><span>Total</span><span>{viewOrder.amount.toLocaleString()}</span></div>
            </div>
            <button type="button" onClick={() => setViewOrder(null)} className="w-full rounded-lg bg-slate-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-700">Close</button>
          </div>
        </div>
      )}

      <SalarySlipDialog open={!!slipRun} onClose={() => setSlipRun(null)} run={slipRun} API={API} token={token} companyName={companyName} companyInfo={companyInfo} />
    </div>
  );
}
