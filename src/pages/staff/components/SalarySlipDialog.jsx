import React, { useEffect, useMemo, useState } from 'react';
import { openSalarySlipPreview } from '../utils/printSalarySlip.js';

function monthBounds(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return { from: '', to: '' };
  const last = new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

function rs(n) {
  return `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function longDate(value) {
  const d = value ? (String(value).includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)) : new Date();
  return Number.isNaN(d.getTime())
    ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Row({ label, value, bold, note }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 border-b border-slate-100 px-4 py-2.5 ${bold ? 'font-bold' : ''}`}>
      <div>
        <span>{label}</span>
        {note ? <span className="ml-2 text-xs font-normal text-slate-500">{note}</span> : null}
      </div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Salary slip preview for a PayrollRun. Fetches the month's attendance,
 * earnings and advance ledger rows for the detail section, and prints
 * a standalone A4 payslip identical to the printed layout.
 */
export default function SalarySlipDialog({ open, onClose, run, API, token, companyName, companyInfo }) {
  const [details, setDetails] = useState({ attendance: [], entries: [], advances: [], purchases: [] });
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open || !run?.staffId || !run?.period || !API || !token) { setDetails({ attendance: [], entries: [], advances: [], purchases: [] }); return; }
    let mounted = true;
    const { from, to } = monthBounds(run.period);
    const headers = { Authorization: `Bearer ${token}` };
    setLoadingDetails(true);
    Promise.all([
      fetch(`${API}/api/attendance?month=${encodeURIComponent(run.period)}`, { headers }).then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API}/api/staff-earnings?staffId=${encodeURIComponent(run.staffId)}&from=${from}&to=${to}&limit=500`, { headers }).then((r) => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      fetch(`${API}/api/staff-advances?staffId=${encodeURIComponent(run.staffId)}&month=${encodeURIComponent(run.period)}`, { headers }).then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API}/api/staff-purchases?staffId=${encodeURIComponent(run.staffId)}&month=${encodeURIComponent(run.period)}`, { headers }).then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([att, earn, adv, purchases]) => {
      if (!mounted) return;
      const attRows = (Array.isArray(att) ? att : att?.items || [])
        .filter((a) => String(a.staffId) === String(run.staffId))
        .map((a) => ({ date: a.date, status: a.status, checkIn: a.checkIn, checkOut: a.checkOut, notes: a.notes }));
      setDetails({
        attendance: attRows,
        entries: earn?.items || [],
        advances: Array.isArray(adv) ? adv : adv?.items || [],
        // Only unpaid (salary-deducted) purchases — cash-paid ones are excluded
        purchases: (Array.isArray(purchases) ? purchases : []).filter((p) => p.status === 'pending' || p.settledVia === 'salary'),
      });
      setLoadingDetails(false);
    });
    return () => { mounted = false; };
  }, [open, run, API, token]);

  const info = useMemo(() => ({
    name: companyInfo?.name || companyInfo?.companyName || companyName || 'Restaurant',
    logo: companyInfo?.logo || companyInfo?.logoUrl || companyInfo?.receiptLogo || '',
    address: companyInfo?.address || '',
    phone: companyInfo?.phone || '',
  }), [companyName, companyInfo]);

  const handlePrint = async () => {
    try {
      setPrinting(true);
      await openSalarySlipPreview(run, info, details);
    } catch (e) {
      console.error('Salary slip print failed:', e);
    } finally {
      setPrinting(false);
    }
  };

  if (!open || !run) return null;

  const allowances = Number(run.allowance || 0) + Number(run.bonus || 0);
  const extrasNote = [run.extrasNote, Number(run.bonus || 0) > 0 ? 'Attendance bonus' : ''].filter(Boolean).join(' · ');
  const totalDeduct =
    Number(run.absentDeduction || 0) + Number(run.lateDeduction || 0) +
    Number(run.earlyOutDeduction || 0) + Number(run.manualDeduction || 0) +
    Number(run.advanceDeducted || 0) + Number(run.purchaseDeducted || 0);
  const generatedOn = longDate(run.paidAt || run.updatedAt || run.createdAt);

  const attStatus = (s) => (s === 'Present' || s === 'Late') ? 'text-emerald-700' : s === 'Leave' ? 'text-blue-700' : 'text-rose-700';

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 0 }
          body * { visibility: hidden !important }
          #salary-slip, #salary-slip * { visibility: visible !important }
          #salary-slip { position: absolute !important; left: 0; top: 0; width: 210mm !important; min-height: 297mm }
          .no-print { display: none !important }
        }
      `}</style>
      <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-6 print:static print:overflow-visible print:bg-white print:p-0">
        <div className="w-full max-w-[230mm] overflow-hidden rounded-2xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
          <div className="no-print flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div>
              <div className="font-bold text-slate-900">Salary Slip</div>
              <div className="text-xs text-slate-500">A4 payslip · {run.staffName} · {run.period}</div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={printing} onClick={handlePrint} className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-sky-700 disabled:opacity-60">{printing ? 'Opening…' : 'Print'}</button>
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600">Close</button>
            </div>
          </div>

          <div className="max-h-[80vh] overflow-y-auto bg-slate-100 p-4 print:max-h-none print:overflow-visible print:bg-white print:p-0">
            <div id="salary-slip" className="mx-auto w-[210mm] max-w-full bg-white px-[16mm] py-[14mm] text-[#17293c]">
              <div className="overflow-hidden border border-slate-300">
                <div className="flex items-center gap-4 bg-gradient-to-b from-slate-50 to-white px-4 py-3.5">
                  {info.logo ? (
                    <img src={info.logo} alt="" className="h-[72px] w-[72px] shrink-0 object-contain" />
                  ) : (
                    <div className="h-[72px] w-[72px] shrink-0 border border-slate-200 bg-slate-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[22px] font-extrabold leading-tight tracking-tight">{info.name}</div>
                    {info.address ? <div className="mt-1 text-xs text-slate-500">{info.address}</div> : null}
                    {info.phone ? <div className="mt-0.5 text-xs text-slate-500">Tel: {info.phone}</div> : null}
                  </div>
                  <div className="shrink-0 border-l border-slate-200 pl-4 text-right">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#0e4e8a]">Human Resources</div>
                    <div className="mt-1.5 text-[16px] font-bold">Payslip</div>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-[#0e4e8a] px-4 py-2 text-[12px] text-white">
                  <div>{run.slipNo ? `Slip No: ${run.slipNo}` : 'Salary Slip'}</div>
                  <div>Date: {generatedOn}</div>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-sm border border-slate-300">
                <div className="grid grid-cols-4 text-[13px]">
                  <div className="border-b border-r border-slate-200 bg-[#eaf2f9] px-3 py-2 font-medium text-[#0e4e8a]">Employee</div>
                  <div className="border-b border-r border-slate-200 px-3 py-2 font-semibold">{run.staffName || '—'}</div>
                  <div className="border-b border-r border-slate-200 bg-[#eaf2f9] px-3 py-2 font-medium text-[#0e4e8a]">Month</div>
                  <div className="border-b border-r border-slate-200 px-3 py-2 font-semibold">{run.period || '—'}</div>
                  <div className="border-b border-r border-slate-200 bg-[#eaf2f9] px-3 py-2 font-medium text-[#0e4e8a]">Designation</div>
                  <div className="border-b border-r border-slate-200 px-3 py-2">{run.position || '—'}</div>
                  <div className="border-b border-r border-slate-200 bg-[#eaf2f9] px-3 py-2 font-medium text-[#0e4e8a]">Department</div>
                  <div className="border-b border-r border-slate-200 px-3 py-2">{run.position || '—'}</div>
                  <div className="border-r border-slate-200 bg-[#eaf2f9] px-3 py-2 font-medium text-[#0e4e8a]">Attendance</div>
                  <div className="border-r border-slate-200 px-3 py-2">{run.presentDays ?? 0} present · {run.leaveDays ?? 0} leave · {run.absentDays ?? 0} absent</div>
                  <div className="border-r border-slate-200 bg-[#eaf2f9] px-3 py-2 font-medium text-[#0e4e8a]">Status</div>
                  <div className="px-3 py-2 capitalize">{run.status || '—'}</div>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-sm border border-slate-300">
                <div className="bg-[#0e4e8a] px-4 py-2 text-[13px] font-bold uppercase tracking-wider text-white">Earnings</div>
                <Row label="Basic Salary" value={rs(run.basicSalary)} />
                <Row label="Allowances &amp; Bonuses" value={rs(allowances)} note={extrasNote || undefined} />
                <Row label="Overtime Pay" value={rs(run.otPay)} />
                <Row label="Double-Shift Bonus" value={rs(run.doubleShift)} />
                <Row label="Gross Pay" value={rs(run.grossPay)} bold />
              </div>

              <div className="mt-5 overflow-hidden rounded-sm border border-slate-300">
                <div className="bg-[#0e4e8a] px-4 py-2 text-[13px] font-bold uppercase tracking-wider text-white">Deductions</div>
                {Number(run.absentDeduction || 0) > 0 ? <Row label="Absent Deduction" value={rs(run.absentDeduction)} note={`(${run.absentDays ?? 0} days)`} /> : null}
                {Number(run.lateDeduction || 0) > 0 ? <Row label="Late Deduction" value={rs(run.lateDeduction)} note={`${run.lateDays ?? 0} days · ${run.totalLateMinutes ?? 0} min`} /> : null}
                {Number(run.earlyOutDeduction || 0) > 0 ? <Row label="Early Out Deduction" value={rs(run.earlyOutDeduction)} note={`${run.earlyOutDays ?? 0} days · ${run.totalEarlyOutMinutes ?? 0} min`} /> : null}
                {Number(run.manualDeduction || 0) > 0 ? <Row label="Adjustment (Deduction)" value={rs(run.manualDeduction)} /> : null}
                <Row label="Advance Repayment" value={rs(run.advanceDeducted)} />
                {Number(run.purchaseDeducted || 0) > 0 ? <Row label="Staff Purchases (unpaid)" value={rs(run.purchaseDeducted)} note={details.purchases.length ? `${details.purchases.length} order(s)` : undefined} /> : null}
                <Row label="Total Deductions" value={rs(totalDeduct)} bold />
              </div>

              <div className="mt-5 flex items-center justify-between rounded-sm bg-[#0e4e8a] px-5 py-3 text-white">
                <div className="text-[16px] font-semibold">Net Pay</div>
                <div className="text-[20px] font-bold tabular-nums">{rs(run.netPay)}</div>
              </div>

              <div className="mt-14 grid grid-cols-2 items-end text-[12px] text-[#54677a]">
                <div>Generated on {generatedOn}</div>
                <div className="text-right">
                  <div className="mb-8">Authorized Signatory</div>
                  <div className="ml-auto w-48 border-t border-slate-400" />
                </div>
              </div>

              {(details.attendance.length > 0 || details.entries.length > 0 || details.advances.length > 0 || details.purchases.length > 0) && (
                <div className="mt-10 border-t-2 border-dashed border-slate-300 pt-2 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">{loadingDetails ? 'Loading details…' : 'Page 2 — Details'}</div>
              )}

              {details.attendance.length > 0 && (
                <div className="mt-6 overflow-hidden rounded-sm border border-slate-300">
                  <div className="bg-[#0e4e8a] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white">Attendance Record — {run.period}</div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Date</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Status</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Check In</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Check Out</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...details.attendance].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1 border-b border-slate-100">{r.date}</td>
                          <td className={`px-3 py-1 border-b border-slate-100 font-bold ${attStatus(r.status)}`}>{r.status || '—'}</td>
                          <td className="px-3 py-1 border-b border-slate-100">{r.checkIn || '—'}</td>
                          <td className="px-3 py-1 border-b border-slate-100">{r.checkOut || '—'}</td>
                          <td className="px-3 py-1 border-b border-slate-100 text-slate-500">{r.notes || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {details.entries.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-sm border border-slate-300">
                  <div className="bg-[#0e4e8a] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white">Earnings &amp; Deductions Entries</div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Date</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Category</th>
                        <th className="px-3 py-1.5 text-right border-b border-slate-200 text-[10px] uppercase">Amount</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...details.entries].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r, i) => {
                        const isDed = r.category === 'Deduction';
                        return (
                          <tr key={i}>
                            <td className="px-3 py-1 border-b border-slate-100">{r.date}</td>
                            <td className="px-3 py-1 border-b border-slate-100">{isDed ? 'Adjustment (Deduction)' : r.category}</td>
                            <td className={`px-3 py-1 border-b border-slate-100 text-right font-bold ${isDed ? 'text-rose-600' : 'text-emerald-700'}`}>{isDed ? '-' : '+'}{rs(r.amount)}</td>
                            <td className="px-3 py-1 border-b border-slate-100 text-slate-500">{r.notes || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {details.purchases.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-sm border border-slate-300">
                  <div className="bg-[#0e4e8a] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white">Unpaid Staff Purchases — {run.period}</div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Date</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Bill No</th>
                        <th className="px-3 py-1.5 text-right border-b border-slate-200 text-[10px] uppercase">Amount</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...details.purchases].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1 border-b border-slate-100">{String(r.date || '').slice(0, 10)}</td>
                          <td className="px-3 py-1 border-b border-slate-100">{r.billNo || '—'}</td>
                          <td className="px-3 py-1 border-b border-slate-100 text-right font-bold text-rose-600">-{rs(r.amount)}</td>
                          <td className="px-3 py-1 border-b border-slate-100 text-slate-500">Salary deduct</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {details.advances.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-sm border border-slate-300">
                  <div className="bg-[#0e4e8a] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white">Advance Entries</div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Date</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Type</th>
                        <th className="px-3 py-1.5 text-right border-b border-slate-200 text-[10px] uppercase">Amount</th>
                        <th className="px-3 py-1.5 text-left border-b border-slate-200 text-[10px] uppercase">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...details.advances].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r, i) => {
                        const t = r.type || 'issue';
                        const label = t === 'issue' ? 'Advance' : t === 'payroll_deduct' ? 'Salary deduct' : 'Repayment';
                        return (
                          <tr key={i}>
                            <td className="px-3 py-1 border-b border-slate-100">{String(r.date || '').slice(0, 10)}</td>
                            <td className="px-3 py-1 border-b border-slate-100">{label}</td>
                            <td className={`px-3 py-1 border-b border-slate-100 text-right font-bold ${t === 'issue' ? 'text-rose-600' : 'text-emerald-700'}`}>{t === 'issue' ? '+' : '-'}{rs(r.amount)}</td>
                            <td className="px-3 py-1 border-b border-slate-100 text-slate-500">{r.notes || r.note || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
