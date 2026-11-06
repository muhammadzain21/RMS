import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useData } from '../../../state/DataContext.jsx';
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../../utils/reportDoc.js';
import AddAdvanceDialog from '../components/AddAdvanceDialog.jsx';
import DatePicker from '../../../components/DatePicker.jsx'

const btnPrint = 'ui-btn ui-btn-print';
const btnPdf = 'ui-btn ui-btn-pdf';
const btnCsv = 'ui-btn ui-btn-csv';

export default function AdvancesTab({
  staff,
  advances,
  attendance,
  settings,
  onAddAdvance,
  onUpdateAdvance,
  onDeleteAdvance,
  month,
  setMonth,
  toast,
  businessDate,
  confirm,
  API,
  token
}) {
  const { state } = useData();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState(null);
  const [filterStaffId, setFilterStaffId] = useState('');
  const [balances, setBalances] = useState([]);
  const [view, setView] = useState('register'); // 'register' | 'balances'

  const staffName = (id) => staff.find(s => s.id === id)?.name || '—';

  const fetchBalances = async () => {
    if (!token || !API) return;
    try {
      const res = await fetch(`${API}/api/staff-advances/balances`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setBalances(await res.json());
    } catch {}
  };

  useEffect(() => { fetchBalances(); }, [token, API, advances]);

  const monthAdvances = useMemo(() => {
    return (advances || [])
      .filter(a => a.month === month)
      .filter(a => !filterStaffId || a.staffId === filterStaffId);
  }, [advances, month, filterStaffId]);

  const kpis = useMemo(() => {
    const issued = monthAdvances.filter(a => (a.type || 'issue') === 'issue').reduce((s, a) => s + Number(a.amount || 0), 0);
    const recovered = monthAdvances.filter(a => (a.type || 'issue') !== 'issue').reduce((s, a) => s + Number(a.amount || 0), 0);
    const outstanding = balances.reduce((s, b) => s + Number(b.outstanding || 0), 0);
    const openStaff = balances.filter(b => Number(b.outstanding || 0) > 0).length;
    return { issued, recovered, outstanding, openStaff };
  }, [monthAdvances, balances]);

  const totalAdvances = useMemo(() => {
    return monthAdvances.reduce((s, a) => s + Number(a.amount || 0) * ((a.type || 'issue') === 'issue' ? 1 : -1), 0);
  }, [monthAdvances]);

  const filteredBalances = useMemo(() => {
    return balances
      .filter(b => b.active)
      .filter(b => !filterStaffId || b.staffId === filterStaffId);
  }, [balances, filterStaffId]);

  const submit = (payload) => {
    const base = { staffId: payload.staffId, month, date: payload.date, notes: payload.notes || '', amount: payload.amount, type: payload.type || 'issue' };
    if (payload.id) onUpdateAdvance({ id: payload.id, ...base });
    else onAddAdvance(base);
  };

  const remove = async (id) => {
    if (confirm) {
      const ok = await confirm({
        title: 'Delete Advance',
        message: 'Delete this advance record? Outstanding balance will be recalculated.',
        confirmText: 'Delete'
      });
      if (!ok) return;
    }
    onDeleteAdvance(id);
  };

  const money = (n) => `${Number(n || 0).toLocaleString()} PKR`;

  const openPrintPreview = async () => {
    try {
      const isRegister = view === 'register';
      const body =
        reportSummary([
          { label: 'Issued', amount: money(kpis.issued) },
          { label: 'Recovered', amount: money(kpis.recovered) },
          { label: 'Outstanding', amount: money(kpis.outstanding) },
          { label: 'Staff with balance', amount: String(kpis.openStaff) },
        ]) +
        (isRegister
          ? reportSec(`Advance register — ${month} (${monthAdvances.length})`) +
            reportTable({
              headers: ['Date', 'Staff', 'Type', 'Note', { t: 'Amount', align: 'r' }],
              numbered: true,
              rows: monthAdvances.map(a => [
                a.date || '-',
                a.staffName || staffName(a.staffId),
                a.type || 'issue',
                a.notes || '-',
                { v: `${(a.type || 'issue') === 'issue' ? '+' : '−'} ${Number(a.amount || 0).toLocaleString()} PKR`, align: 'r' },
              ]),
              emptyText: 'No advance records',
            })
          : reportSec(`Staff balances (${filteredBalances.length})`) +
            reportTable({
              headers: ['Staff', 'Position', { t: 'Salary', align: 'r' }, { t: 'Limit', align: 'r' }, { t: 'Outstanding', align: 'r' }, { t: 'Available', align: 'r' }],
              numbered: true,
              rows: filteredBalances.map(b => [
                b.name,
                b.position || '—',
                { v: money(b.salary), align: 'r' },
                { v: money(b.advanceLimit), align: 'r' },
                { v: money(b.outstanding), align: 'r' },
                { v: money(b.available), align: 'r' },
              ]),
              emptyText: 'No balances',
            }));
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: isRegister ? 'Staff Advances Register' : 'Staff Advance Balances',
        reportLabel: 'Staff Advances Report',
        reportNo: `Rpt #: ADV-${month}-${view}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Month', month], ['View', view]],
        metaRight: [['Staff filter', filterStaffId ? staffName(filterStaffId) : 'All'], ['Records', String(isRegister ? monthAdvances.length : filteredBalances.length)]],
        body,
      });
      await previewHtmlReport(html, `Staff-Advances-${month}-${view}.pdf`);
      toast?.success('Print preview opened');
    } catch (err) {
      console.error(err);
      toast?.error('Print preview failed');
    }
  };

  const exportPDF = () => {
    try {
      const doc = new jsPDF('p', 'pt', 'a4');
      doc.setFontSize(14);
      doc.text(state?.settings?.companyName || 'Staff Advances', 40, 32);
      doc.setFontSize(10);
      doc.text(`${month} · ${view}`, 40, 46);
      if (view === 'register') {
        doc.autoTable({
          head: [['Date', 'Staff', 'Type', 'Note', 'Amount (PKR)']],
          body: monthAdvances.map(a => [
            a.date || '-',
            a.staffName || staffName(a.staffId),
            a.type || 'issue',
            a.notes || '-',
            Number(a.amount || 0).toLocaleString(),
          ]),
          startY: 54,
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [20, 184, 166], textColor: 255, fontStyle: 'bold' },
          margin: { left: 40, right: 40 },
        });
      } else {
        doc.autoTable({
          head: [['Staff', 'Position', 'Salary', 'Limit', 'Outstanding', 'Available']],
          body: filteredBalances.map(b => [
            b.name, b.position || '—', Number(b.salary || 0).toLocaleString(), Number(b.advanceLimit || 0).toLocaleString(),
            Number(b.outstanding || 0).toLocaleString(), Number(b.available || 0).toLocaleString(),
          ]),
          startY: 54,
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [20, 184, 166], textColor: 255, fontStyle: 'bold' },
          margin: { left: 40, right: 40 },
        });
      }
      doc.save(`staff-advances-${month}-${view}.pdf`);
      toast?.success('PDF exported successfully');
    } catch (err) {
      console.error(err);
      toast?.error('Failed to export PDF');
    }
  };

  const exportCSV = () => {
    try {
      let header;
      let lines;
      if (view === 'register') {
        header = ['Date', 'Staff', 'Type', 'Note', 'Amount (PKR)'];
        lines = monthAdvances.map(a =>
          [a.date, a.staffName || staffName(a.staffId), a.type || 'issue', a.notes || '', a.amount ?? 0]
            .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
        );
      } else {
        header = ['Staff', 'Position', 'Salary', 'Limit', 'Outstanding', 'Available'];
        lines = filteredBalances.map(b =>
          [b.name, b.position || '', b.salary, b.advanceLimit, b.outstanding, b.available]
            .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
        );
      }
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-advances-${month}-${view}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast?.success('CSV exported successfully');
    } catch {
      toast?.error('Failed to export CSV');
    }
  };

  const typeBadge = (t) => {
    const type = t || 'issue';
    if (type === 'issue') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30';
    if (type === 'repay') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30';
    return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30';
  };

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-4 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Staff Advances</h2>
            <p className="text-blue-100 text-sm">Issue, repay, and cap outstanding advances per employee</p>
          </div>
          <button
            className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 border border-white/40 text-white font-medium transition-all"
            onClick={() => { setEditingAdvance(null); setShowAddDialog(true) }}
          >
            + New Advance
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-amber-200 dark:border-slate-600 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Issued ({month})</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{money(kpis.issued)}</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-emerald-200 dark:border-slate-600 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recovered ({month})</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{money(kpis.recovered)}</div>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-red-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-rose-200 dark:border-slate-600 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Outstanding</div>
          <div className="text-2xl font-bold text-rose-600 mt-1">{money(kpis.outstanding)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md border border-blue-200 dark:border-slate-600 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Staff with Balance</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{kpis.openStaff}</div>
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
            <DatePicker mode="month" label="Month" value={month} onChange={v => { if (v) setMonth(v) }} allowClear={false} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 p-4 rounded-xl card card-pad">
        <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
        <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
        <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setView('register')}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors ${view === 'register' ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
        >
          Register ({monthAdvances.length})
        </button>
        <button
          type="button"
          onClick={() => setView('balances')}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors ${view === 'balances' ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
        >
          Balances ({filteredBalances.length})
        </button>
      </div>

      {/* Register / Balances */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
            {view === 'register' ? `Advances — ${month} (${monthAdvances.length})` : `Staff Advance Balances (${filteredBalances.length})`}
          </h3>
          {view === 'register' && <div className="font-bold text-teal-600 dark:text-teal-400">Net: {money(totalAdvances)}</div>}
        </div>
        <div className="overflow-x-auto">
          {view === 'register' ? (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-700/50">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Staff</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Note</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {monthAdvances.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <p className="text-slate-400 dark:text-slate-500">No advance records for {month}</p>
                    </td>
                  </tr>
                )}
                {monthAdvances.map((a, idx) => {
                  const t = a.type || 'issue';
                  const locked = t === 'payroll_deduct';
                  return (
                    <tr key={a.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}>
                      <td className="px-6 py-4"><span className="font-medium text-slate-700 dark:text-slate-300">{a.date || '-'}</span></td>
                      <td className="px-6 py-4"><span className="font-medium text-slate-700 dark:text-slate-300">{a.staffName || staffName(a.staffId)}</span></td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${typeBadge(t)}`}>
                          {t === 'payroll_deduct' ? 'Payroll' : t}
                        </span>
                      </td>
                      <td className="px-6 py-4"><span className="text-slate-600 dark:text-slate-400">{a.notes || '-'}</span></td>
                      <td className={`px-6 py-4 text-right font-bold ${t === 'issue' ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {t === 'issue' ? '+' : '−'} {money(a.amount)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {locked ? (
                          <span className="text-[11px] font-medium text-slate-400">Locked</span>
                        ) : (
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
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-700/50">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Staff</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Salary</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Limit</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Outstanding</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredBalances.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <p className="text-slate-400 dark:text-slate-500">No staff</p>
                    </td>
                  </tr>
                )}
                {filteredBalances.map((b, idx) => (
                  <tr key={b.staffId} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{b.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{b.position || '—'}</div>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-700 dark:text-slate-300">{money(b.salary)}</td>
                    <td className="px-6 py-4 text-right text-slate-700 dark:text-slate-300">{money(b.advanceLimit)}</td>
                    <td className="px-6 py-4 text-right font-bold text-amber-600">{money(b.outstanding)}</td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-600">{money(b.available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
        attendance={attendance}
        settings={settings}
        month={month}
        balances={balances}
      />
    </div>
  );
}
