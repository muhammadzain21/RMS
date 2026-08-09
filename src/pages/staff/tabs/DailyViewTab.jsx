import React, { useState } from 'react';

import { toast } from 'react-hot-toast';
import { getLocalDateString } from '../../../utils/dateUtils.js';
import { useData } from '../../../state/DataContext.jsx';

export default function DailyViewTab({ attendance, staff, fmt12, onMarkLeave, token, API, settings }) {
 const { businessDate } = useData();
 const [dailyDate, setDailyDate] = useState(businessDate || getLocalDateString());
 
 const daily = attendance.filter(r => r.date === dailyDate);
 
 const getStatusColor = (status) => {
 switch(status) {
 case 'Present': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
 case 'Late': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
 case 'Absent': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
 case 'Leave': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
 default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400';
 }
 };

 // Calculate stats
 const stats = {
 present: daily.filter(r => r.status === 'Present' || r.status === 'Late').length,
 late: daily.filter(r => r.status === 'Late').length,
 absent: daily.filter(r => r.status === 'Absent').length,
 leave: daily.filter(r => r.status === 'Leave').length
 };

 return (
 <div className="space-y-6">
 {/* Header Card */}
 <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-4 text-white"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><div><h2 className="text-lg font-semibold"> Daily Attendance</h2><p className="text-blue-100 text-sm">View attendance records for a specific date</p>
 {/* DEBUG: Show date info to diagnose timezone issues */}
 <p className="text-xs text-blue-200 mt-1">
 System: {new Date().toLocaleDateString('en-CA')} | 
 Business: {businessDate} | 
 TZ: {Intl.DateTimeFormat().resolvedOptions().timeZone}
 </p></div><div className="flex items-center gap-3"><input
 type="date"
 className="px-4 py-2 rounded-lg bg-white/20 border border-white/30 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50"
 value={dailyDate}
 onChange={e => setDailyDate(e.target.value)}
 /></div></div></div>

 {/* Stats Cards */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4"><div className="text-2xl font-bold text-green-600">{stats.present}</div><div className="text-sm text-slate-500 dark:text-slate-400">Present</div></div><div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4"><div className="text-2xl font-bold text-orange-600">{stats.late}</div><div className="text-sm text-slate-500 dark:text-slate-400">Late</div></div><div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4"><div className="text-2xl font-bold text-blue-600">{stats.leave}</div><div className="text-sm text-slate-500 dark:text-slate-400">Leave</div></div><div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4"><div className="text-2xl font-bold text-red-600">{stats.absent}</div><div className="text-sm text-slate-500 dark:text-slate-400">Absent</div></div></div>

 {/* Records Table */}
 <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"><div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"><h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><span className="w-2 h-2 bg-teal-500 rounded-full"></span>
 Attendance Records ({daily.length})
 </h3></div><div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-slate-100 dark:bg-slate-700/50"><th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Staff</th><th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Position</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Status</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Check In</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Check Out</th><th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">
 {daily.length === 0 && (
 <tr><td colSpan={6} className="px-6 py-12 text-center"><div className="text-slate-400 dark:text-slate-500"><div className="text-4xl mb-2"></div><p>No records for {dailyDate}</p><p className="text-sm">Select a different date or mark attendance first</p></div></td></tr>
 )}
 {daily.map((r, idx) => {
 const st = staff.find(s => s.id === r.staffId);
 return (
 <tr key={r.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
 {r.staffName?.charAt(0).toUpperCase()}
 </div><span className="font-semibold text-slate-800 dark:text-slate-200">{r.staffName}</span></div></td><td className="px-6 py-4"><span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
 {st?.position || '-'}
 </span></td><td className="px-6 py-4 text-center"><span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(r.status)}`}>
 {r.status}
 </span></td><td className="px-6 py-4 text-center">
 {r.checkIn ? (
 <span className="font-medium text-slate-700 dark:text-slate-300">{fmt12(r.checkIn)}</span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500">-</span>
 )}
 </td><td className="px-6 py-4 text-center">
 {r.checkOut ? (
 <span className="font-medium text-slate-700 dark:text-slate-300">{fmt12(r.checkOut)}</span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500">-</span>
 )}
 </td><td className="px-6 py-4 text-center"><div className="flex gap-2 justify-center">
 {r.status !== 'Leave' ? (
 <button
 onClick={() => onMarkLeave(r.staffId, dailyDate, true)}
 className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
 >
 Mark Leave
 </button>
 ) : (
 <button
 onClick={() => onMarkLeave(r.staffId, dailyDate, false)}
 className="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full hover:bg-red-200 transition-colors"
 >
 Mark Absent
 </button>
 )}
 </div></td></tr>
 );
 })}
 </tbody></table></div></div></div>
 );
}
