import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../state/AuthContext.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useConfirm } from '../../components/useConfirm.jsx';
import { toast } from 'react-hot-toast';
import { getLocalDateString, formatTime12 } from '../../utils/dateUtils.js';
import MarkAttendanceTab from './tabs/MarkAttendanceTab';
import AddStaffTab from './tabs/AddStaffTab';
import DailyViewTab from './tabs/DailyViewTab';
import MonthlyViewTab from './tabs/MonthlyViewTab';
import AdvancesTab from './tabs/AdvancesTab';
import PayrollTab from './tabs/PayrollTab';
import StaffMonthSummaryPage from './StaffMonthSummaryPage.jsx';
import StaffHistoryPage from './StaffHistoryPage.jsx';
import StaffSettingsTab from './tabs/StaffSettingsTab';

export default function StaffAttendance({ initialTab = 'attendance', showTabs = true }) {
 const auth = useAuth();
 const token = auth?.token;
 const { state, businessDate } = useData();
 const { confirm, ConfirmDialog } = useConfirm();
 const API = (import.meta).env.VITE_API_BASE || 'http://localhost:5000';

 const [tab, setTab] = useState(initialTab);
 const [staff, setStaff] = useState([]);
 const [biometricMaps, setBiometricMaps] = useState([]); // { staffId, enrollId }
 const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, pages: 1 });
 const [search, setSearch] = useState('');
 const [loadingStaff, setLoadingStaff] = useState(false);
 const [attendance, setAttendance] = useState([]);
 const [settings, setSettings] = useState({
 shifts: [],
 lateThresholdMinutes: 15,
 bonusPerDay: 0,
 deductionPerAbsent: 0,
 deductionPerLate: 0,
 deductionPerMinute: 0,
 deductionPerMinuteEarlyOut: 0,
 absentChargesEnabled: false
 });
 const [advances, setAdvances] = useState([]);
 const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

 // Load staff with pagination
 const fetchStaff = async () => {
 if (!token) return;
 setLoadingStaff(true);
 try {
 const params = new URLSearchParams({
 page: pagination.page,
 limit: pagination.limit,
 search: search
 });
 const res = await fetch(`${API}/api/staff?${params.toString()}`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 const result = await res.json();
 const docs = result.data || [];
        const mapped = docs.map(d => ({
 id: d._id || d.id || crypto.randomUUID(),
 name: d.name,
 position: d.position || 'Staff',
 phone: d.phone,
 cnic: d.cnic,
 address: d.address,
 salary: typeof d.salary === 'number' ? d.salary : Number(d.salary || 0),
 advanceLimit: Number(d.advanceLimit || 0),
 joinDate: d.joinDate ? String(d.joinDate).slice(0, 10) : undefined,
 status: d.status === 'Inactive' ? 'inactive' : 'active',
 shiftId: d.shiftId || '',
 loginUsername: d.loginUsername || '',
 loginRole: d.loginRole || 'Staff',
 myWorkAccess: d.myWorkAccess !== false,
 myWorkPages: Array.isArray(d.myWorkPages) ? d.myWorkPages : undefined,
 }));
 setStaff(mapped);
 setPagination(prev => ({
 ...prev,
 total: result.total || 0,
 pages: result.pages || 1
 }));
 }
 } catch (e) {
 console.error('Failed to fetch staff:', e);
 } finally {
 setLoadingStaff(false);
 }
 };

 useEffect(() => {
 fetchStaff();
 }, [token, API, pagination.page, pagination.limit, search]);

 const fetchBiometricMaps = useCallback(async () => {
 if (!token) return;
 try {
 const res = await fetch(`${API}/api/biometric/mappings`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 const data = await res.json();
 const items = Array.isArray(data?.items) ? data.items : [];
 setBiometricMaps(
 items
 .filter(m => m && m.active !== false && m.staffId && m.enrollId)
 .map(m => ({
 staffId: String(m.staffId),
 enrollId: String(m.enrollId).trim(),
 }))
 );
 }
 } catch (e) {
 console.error('Failed to fetch biometric mappings:', e);
 }
 }, [token, API]);

 useEffect(() => {
 fetchBiometricMaps();
 }, [fetchBiometricMaps]);

 const staffWithBio = useMemo(() => {
 const byStaff = new Map(biometricMaps.map(m => [String(m.staffId), m.enrollId]));
 return staff.map(s => ({
 ...s,
 biometricId: byStaff.get(String(s.id)) || '',
 }));
 }, [staff, biometricMaps]);

 useEffect(() => {
 setTab(initialTab);
 }, [initialTab]);

 // Load settings
 useEffect(() => {
 if (!token) return;
 (async () => {
 try {
 const res = await fetch(`${API}/api/staff-settings`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 const s = await res.json();
 setSettings(prev => ({
 shifts: s.shifts || [],
 lateThresholdMinutes: Number(s.lateThresholdMinutes ?? prev.lateThresholdMinutes),
 bonusPerDay: Number(s.bonusPerDay ?? prev.bonusPerDay),
 deductionPerAbsent: Number(s.deductionPerAbsent ?? prev.deductionPerAbsent),
 deductionPerLate: Number(s.deductionPerLate ?? prev.deductionPerLate),
 deductionPerMinute: Number(s.deductionPerMinute ?? prev.deductionPerMinute),
 deductionPerMinuteEarlyOut: Number(s.deductionPerMinuteEarlyOut ?? prev.deductionPerMinuteEarlyOut),
 absentChargesEnabled: Boolean(s.absentChargesEnabled ?? prev.absentChargesEnabled)
 }));
 }
 } catch {}
 })();
 }, [token, API]);

 // Load attendance
 useEffect(() => {
 if (!token) return;
 (async () => {
 try {
 const res = await fetch(`${API}/api/attendance?month=${encodeURIComponent(month)}`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 const docs = await res.json();
 const mapped = docs.map(d => ({
 id: d._id || crypto.randomUUID(),
 staffId: d.staffId,
 staffName: d.staffName,
 date: d.date,
 checkIn: d.checkIn,
 checkOut: d.checkOut,
 status: d.status,
 lateMinutes: d.lateMinutes,
 earlyOutMinutes: d.earlyOutMinutes,
 notes: d.notes
 }));
 setAttendance(mapped);
 }
 } catch {}
 })();
 }, [token, month, API]);

 // Load staff advances
 const fetchAdvances = async () => {
 if (!token) return;
 try {
 const res = await fetch(`${API}/api/staff-advances?month=${encodeURIComponent(month)}`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 const rows = await res.json();
 const mapped = (Array.isArray(rows) ? rows : []).map(n => ({
 id: n._id || crypto.randomUUID(),
 staffId: String(n.staffId || ''),
 staffName: n.staffName || '',
 month: n.month,
 date: n.date || '',
 notes: n.notes || '',
 amount: Number(n.amount || 0),
 type: n.type || 'issue',
 createdAt: n.createdAt || new Date().toISOString()
 }));
 setAdvances(mapped);
 }
 } catch {}
 };
 useEffect(() => { fetchAdvances(); }, [token, month, API]);

 const addStaff = async (payload) => {
 try {
 const res = await fetch(`${API}/api/staff`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`
 },
 body: JSON.stringify({
 name: payload.name.trim(),
 phone: payload.phone || '',
 cnic: payload.cnic || '',
 address: payload.address || '',
 position: payload.position,
 salary: Number(payload.salary || 0),
 advanceLimit: Number(payload.advanceLimit || 0),
 status: payload.status === 'inactive' ? 'Inactive' : 'Active',
 joinDate: payload.joinDate,
 shiftId: payload.shiftId || '',
 myWorkAccess: Array.isArray(payload.myWorkPages) ? payload.myWorkPages.length > 0 : payload.myWorkAccess !== false,
 ...(Array.isArray(payload.myWorkPages) ? { myWorkPages: payload.myWorkPages } : {}),
 ...(payload.username ? { username: payload.username, password: payload.password || '', role: payload.role || 'Staff' } : {})
 })
 });
 if (res.ok) {
 const created = await res.json();
 fetchStaff();
 toast.success('Staff saved');
 } else {
 const msg = await res.text();
 toast.error(`Failed to save staff ${res.status}${msg ? `: ${msg}` : ''}`);
 }
 } catch {
 toast.error('Network error while saving staff');
 }
 };

 const updateStaff = async (id, payload) => {
 try {
 const res = await fetch(`${API}/api/staff/${id}`, {
 method: 'PATCH',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`
 },
 body: JSON.stringify({
 name: payload.name.trim(),
 phone: payload.phone || '',
 cnic: payload.cnic || '',
 address: payload.address || '',
 position: payload.position,
 salary: Number(payload.salary || 0),
 advanceLimit: Number(payload.advanceLimit || 0),
 status: payload.status === 'inactive' ? 'Inactive' : 'Active',
 joinDate: payload.joinDate,
 shiftId: payload.shiftId || '',
 myWorkAccess: Array.isArray(payload.myWorkPages) ? payload.myWorkPages.length > 0 : payload.myWorkAccess !== false,
 ...(Array.isArray(payload.myWorkPages) ? { myWorkPages: payload.myWorkPages } : {}),
 ...(payload.username || payload.password ? { username: payload.username || '', password: payload.password || '', role: payload.role || 'Staff' } : {})
 })
 });
 if (res.ok) {
 fetchStaff();
 toast.success('Staff updated');
 } else {
 const msg = await res.text();
 toast.error(`Failed to update staff ${res.status}${msg ? `: ${msg}` : ''}`);
 }
 } catch {
 toast.error('Network error while updating staff');
 }
 };

 const deleteStaff = async (id) => {
 try {
 const res = await fetch(`${API}/api/staff/${id}`, {
 method: 'DELETE',
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 fetchStaff();
 toast.success('Staff deleted');
 } else {
 const msg = await res.text();
 toast.error(`Failed to delete ${res.status}${msg ? `: ${msg}` : ''}`);
 }
 } catch {
 toast.error('Network error while deleting');
 }
 };

 const saveSettings = async () => {
 try {
 const res = await fetch(`${API}/api/staff-settings`, {
 method: 'PATCH',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`
 },
 body: JSON.stringify(settings)
 });
 if (res.ok) {
 toast.success('Staff settings saved');
 } else {
 const msg = await res.text();
 toast.error(`Failed to save settings ${res.status}${msg ? `: ${msg}` : ''}`);
 }
 } catch {
 toast.error('Network error while saving settings');
 }
 };

 // Helper to get shift for a staff member
 const getStaffShift = (staffMember) => {
 const shifts = settings.shifts || [];
 const shift = shifts.find(s => s.id === staffMember?.shiftId);
 // Fall back to first shift or default
 return shift || shifts[0] || {
 id: 'default',
 name: 'Default',
 checkIn: '09:00',
 checkOut: '17:00'
 };
 };

 const clockIn = async (staffId) => {
 const st = staff.find(s => s.id === staffId);
 if (!st) return;
 const shift = getStaffShift(st);
 const today = businessDate || getLocalDateString();
 const now = new Date();
 const time = now.toTimeString().slice(0, 5);
 const existing = attendance.find(r => r.staffId === st.id && r.date === today);

 const compareTime = (a, b) => {
 const [ah, am] = a.split(':').map(Number);
 const [bh, bm] = b.split(':').map(Number);
 return (ah * 60 + am) - (bh * 60 + bm);
 };

 // Check if this is an overnight shift (shift start > shift end, e.g., 18:00 - 02:00)
 const shiftStartMinutes = compareTime(shift.checkIn, '00:00');
 const shiftEndMinutes = compareTime(shift.checkOut, '00:00');
 const isOvernightShift = shiftStartMinutes > shiftEndMinutes;

 // For overnight shifts, handle clock-in after midnight correctly
 // If current time is in early morning (before shift end), the shift started on previous calendar day
 const currentMinutes = compareTime(time, '00:00');

 // Calculate minutes late with overnight shift handling
 let minutesLate;
 if (isOvernightShift && currentMinutes < shiftEndMinutes) {
 // Overnight shift, clocking in during early morning portion
 // Add 24 hours to current time for proper comparison
 minutesLate = (currentMinutes + 24 * 60) - shiftStartMinutes;
 } else {
 minutesLate = compareTime(time, shift.checkIn);
 }

 const late = minutesLate > settings.lateThresholdMinutes ? 'Late' : 'Present';
 const lateMinutes = late === 'Late' ? Math.max(0, minutesLate) : 0;

 if (existing) {
 if (existing.checkIn) {
 toast.error('Already clocked in today');
 return;
 }
 setAttendance(prev => prev.map(r => r.id === existing.id ? { ...r, checkIn: time, status: late, lateMinutes } : r));
 } else {
 setAttendance(prev => [...prev, {
 id: crypto.randomUUID(),
 staffId: st.id,
 staffName: st.name,
 date: today,
 checkIn: time,
 status: late,
 lateMinutes
 }]);
 }

 fetch(`${API}/api/attendance`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`
 },
 body: JSON.stringify({
 staffId: st.id,
 staffName: st.name,
 date: today,
 checkIn: time,
 status: late,
 lateMinutes
 })
 }).catch(() => {});
 };

 const clockOut = async (staffId) => {
 const st = staff.find(s => s.id === staffId);
 if (!st) return;
 const shift = getStaffShift(st);
 const today = businessDate || getLocalDateString();
 const time = new Date().toTimeString().slice(0, 5);
 const existing = attendance.find(r => r.staffId === st.id && r.date === today);

 // Calculate early out minutes
 const compareTime = (a, b) => {
 const [ah, am] = a.split(':').map(Number);
 const [bh, bm] = b.split(':').map(Number);
 return (ah * 60 + am) - (bh * 60 + bm);
 };

 // Check if this is an overnight shift (shift start > shift end, e.g., 18:00 - 02:00)
 const shiftStartMinutes = compareTime(shift.checkIn, '00:00');
 const shiftEndMinutes = compareTime(shift.checkOut, '00:00');
 const isOvernightShift = shiftStartMinutes > shiftEndMinutes;
 const currentMinutes = compareTime(time, '00:00');

 // Calculate early out minutes with overnight shift handling
 let minutesEarly;
 if (isOvernightShift && currentMinutes >= shiftStartMinutes) {
 // Overnight shift, clocking out during evening portion (before midnight)
 // Shift end is next calendar day, so add 24 hours to shift end for comparison
 // Example: shift 18:00-02:00, clock out at 20:00
 // Effective shift end = 02:00 + 24h = 26:00 = 1560 minutes
 // Current time = 20:00 = 1200 minutes
 // Early by = 1560 - 1200 = 360 minutes = 6 hours early
 minutesEarly = (shiftEndMinutes + 24 * 60) - currentMinutes;
 } else if (isOvernightShift && currentMinutes < shiftEndMinutes) {
 // Overnight shift, clocking out during early morning portion (after midnight)
 // Normal comparison works: current time vs shift end
 minutesEarly = shiftEndMinutes - currentMinutes;
 } else {
 // Regular shift (not overnight)
 minutesEarly = compareTime(shift.checkOut, time);
 }

 const earlyOutMinutes = minutesEarly > 0 ? minutesEarly : 0;

 if (existing) {
 if (existing.checkOut) {
 toast.error('Already clocked out today');
 return;
 }
 setAttendance(prev => prev.map(r => r.id === existing.id ? { ...r, checkOut: time, earlyOutMinutes } : r));
 } else {
 setAttendance(prev => [...prev, {
 id: crypto.randomUUID(),
 staffId: st.id,
 staffName: st.name,
 date: today,
 checkOut: time,
 status: 'Present',
 earlyOutMinutes
 }]);
 }

 fetch(`${API}/api/attendance`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`
 },
 body: JSON.stringify({
 staffId: st.id,
 staffName: st.name,
 date: today,
 checkOut: time,
 earlyOutMinutes
 })
 }).catch(() => {});
 };

 const markLeave = async (staffId, date, isLeave = true) => {
 const st = staff.find(s => s.id === staffId);
 if (!st) return;
 const leaveDate = date || businessDate || getLocalDateString();

 const existing = attendance.find(r => r.staffId === st.id && r.date === leaveDate);

 let status;
 let lateMinutes = 0;

 if (isLeave) {
 status = 'Leave';
 } else if (existing?.checkIn) {
 // Restore proper status based on check-in time using staff's shift
 const shift = getStaffShift(st);
 const compareTime = (a, b) => {
 const [ah, am] = a.split(':').map(Number);
 const [bh, bm] = b.split(':').map(Number);
 return (ah * 60 + am) - (bh * 60 + bm);
 };
 const minutesLate = compareTime(existing.checkIn, shift.checkIn);
 status = minutesLate > settings.lateThresholdMinutes ? 'Late' : 'Present';
 lateMinutes = status === 'Late' ? Math.max(0, minutesLate) : 0;
 } else {
 status = 'Absent';
 }

 if (existing) {
 setAttendance(prev => prev.map(r => r.id === existing.id ? { ...r, status, lateMinutes } : r));
 } else {
 setAttendance(prev => [...prev, {
 id: crypto.randomUUID(),
 staffId: st.id,
 staffName: st.name,
 date: leaveDate,
 status,
 lateMinutes
 }]);
 }

 try {
 const res = await fetch(`${API}/api/attendance`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`
 },
 body: JSON.stringify({
 staffId: st.id,
 staffName: st.name,
 date: leaveDate,
 status,
 lateMinutes
 })
 });
 if (res.ok) {
 toast.success(isLeave ? 'Marked as Leave' : `Restored as ${status}`);
 } else {
 toast.error('Failed to save');
 }
 } catch {
 toast.error('Network error');
 }
 };

 const addAdvance = async ({ staffId, month, date, notes, amount, type }) => {
 try {
 const res = await fetch(`${API}/api/staff-advances`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`
 },
 body: JSON.stringify({ staffId, month, date: date || String(businessDate||'').slice(0,10), notes, amount, type })
 });
 if (res.ok) {
 const n = await res.json();
 setAdvances(prev => [{
 id: n._id || crypto.randomUUID(),
 staffId: String(n.staffId || staffId),
 staffName: n.staffName || '',
 month: n.month || month,
 date: n.date || date || '',
 notes: n.notes || '',
 amount: Number(n.amount || 0),
 type: n.type || 'issue',
 createdAt: n.createdAt || new Date().toISOString()
 }, ...prev]);
 toast.success(n.type === 'repay' ? 'Repayment saved' : 'Advance saved');
 } else {
 const msg = await res.text();
 toast.error(`Failed to save ${res.status}${msg ? `: ${msg}` : ''}`);
 }
 } catch {
 toast.error('Network error while saving');
 }
 };

 const updateAdvance = async ({ id, staffId, month, date, notes, amount, type }) => {
 try {
 const res = await fetch(`${API}/api/staff-advances/${id}`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`
 },
 body: JSON.stringify({ staffId, month, date, notes, amount, type })
 });
 if (res.ok) {
 const n = await res.json();
 setAdvances(prev => prev.map(a => a.id === id ? {
 ...a,
 staffId: String(n.staffId || staffId),
 staffName: n.staffName || '',
 month: n.month || month,
 date: n.date || date || '',
 notes: n.notes || '',
 amount: Number(n.amount || 0),
 type: n.type || 'issue'
 } : a));
 toast.success('Advance updated');
 } else {
 const msg = await res.text();
 toast.error(`Failed to update ${res.status}${msg ? `: ${msg}` : ''}`);
 }
 } catch {
 toast.error('Network error while updating');
 }
 };

 const deleteAdvance = async (id) => {
 try {
 const res = await fetch(`${API}/api/staff-advances/${id}`, {
 method: 'DELETE',
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 setAdvances(prev => prev.filter(n => n.id !== id));
 toast.success('Advance removed');
 } else {
 const msg = await res.text();
 toast.error(`Failed to delete ${res.status}${msg ? `: ${msg}` : ''}`);
 }
 } catch {
 toast.error('Network error while deleting');
 }
 };

 const fmt12 = (t) => formatTime12(t) || '-';

 const tabs = [
 { id: 'attendance', label: 'Mark Attendance', icon: '' },
 { id: 'addStaff', label: 'Add Staff', icon: '' },
 { id: 'daily', label: 'Daily View', icon: '' },
 { id: 'monthly', label: 'Monthly View', icon: '' },
 { id: 'advances', label: 'Advances', icon: '' },
 { id: 'payroll', label: 'Payroll', icon: '' },
 { id: 'settings', label: 'Staff Settings', icon: '' }
 ];

 return (
 <div className="space-y-4 w-full">
 {/* Header Card removed */}

 {showTabs && (
 <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-2"><div className="flex flex-wrap gap-1">
 {tabs.map(t => (
 <button
 key={t.id}
 onClick={() => setTab(t.id)}
 className={`flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
 tab === t.id 
 ? 'bg-gradient-to-r from-blue-500 to-teal-500 text-white shadow-md transform scale-105' 
 : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900'
 }`}
 ><span>{t.icon}</span><span>{t.label}</span></button>
 ))}
 </div></div>
 )}

 {tab === 'attendance' && (
 <MarkAttendanceTab
 staff={staffWithBio}
 attendance={attendance}
 settings={settings}
 onClockIn={clockIn}
 onClockOut={clockOut}
 onMarkLeave={markLeave}
 fmt12={fmt12}
 token={token}
 API={API}
 shifts={settings.shifts || []}
 />
 )}

 {tab === 'addStaff' && (
 <AddStaffTab
 staff={staffWithBio}
 pagination={pagination}
 setPagination={setPagination}
 search={search}
 setSearch={setSearch}
 loadingStaff={loadingStaff}
 onAddStaff={addStaff}
 onUpdateStaff={updateStaff}
 onDeleteStaff={deleteStaff}
 confirm={confirm}
 token={token}
 API={API}
 shifts={settings.shifts || []}
 onMappingsChange={fetchBiometricMaps}
 />
 )}

 {tab === 'daily' && (
 <DailyViewTab
 attendance={attendance}
 staff={staffWithBio}
 fmt12={fmt12}
 onMarkLeave={markLeave}
 token={token}
 API={API}
 settings={state?.settings}
 month={month}
 setMonth={setMonth}
 />
 )}

 {tab === 'monthly' && (
 <MonthlyViewTab
 staff={staffWithBio}
 attendance={attendance}
 settings={settings}
 advances={advances}
 state={state}
 API={API}
 token={token}
 toast={toast}
 businessDate={businessDate}
 month={month}
 setMonth={setMonth}
 />
 )}

 {tab === 'advances' && (
 <AdvancesTab
 staff={staff}
 advances={advances}
 attendance={attendance}
 settings={settings}
 onAddAdvance={addAdvance}
 onUpdateAdvance={updateAdvance}
 onDeleteAdvance={deleteAdvance}
 month={month}
 setMonth={setMonth}
 toast={toast}
 businessDate={businessDate}
 confirm={confirm}
 API={API}
 token={token}
 />
 )}

 {tab === 'payroll' && (
 <PayrollTab
 staff={staff}
 month={month}
 setMonth={setMonth}
 toast={toast}
 businessDate={businessDate}
 API={API}
 token={token}
 confirm={confirm}
 companyName={state?.settings?.companyName}
 onRefreshAdvances={fetchAdvances}
 />
 )}

 {tab === 'payrollSummary' && (
 <StaffMonthSummaryPage
 staff={staff}
 attendance={attendance}
 settings={settings}
 advances={advances}
 month={month}
 setMonth={setMonth}
 businessDate={businessDate}
 state={state}
 API={API}
 token={token}
 />
 )}

 {tab === 'staffHistory' && (
 <StaffHistoryPage
 staff={staff}
 API={API}
 token={token}
 companyName={state?.settings?.companyName}
 companyInfo={state?.settings}
 />
 )}

 {tab === 'settings' && (
 <StaffSettingsTab
 settings={settings}
 setSettings={setSettings}
 onSave={saveSettings}
 />
 )}

 {ConfirmDialog}
 </div>
 );
}
