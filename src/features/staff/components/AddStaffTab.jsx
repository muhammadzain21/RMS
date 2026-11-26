import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffFormDialog from '@features/staff/components/StaffFormDialog.jsx';
import StaffEarningsDialog from '@features/staff/components/StaffEarningsDialog.jsx';
import { formatTime12 } from '@shared/utils/dateUtils.js';
import Pagination from '@shared/components/Pagination.jsx';
import { DEFAULT_MY_WORK_PAGES, resolveMyWorkPages } from '@features/my-work/utils/myWorkPages.js';

export default function AddStaffTab({
 staff,
 pagination,
 setPagination,
 search,
 setSearch,
 loadingStaff,
 onAddStaff,
 onUpdateStaff,
 onDeleteStaff,
 confirm,
 token,
 API,
 shifts = [],
 onMappingsChange
}) {
 const navigate = useNavigate();
 const [showDialog, setShowDialog] = useState(false);
 const [editingId, setEditingId] = useState(null);
 const [earningStaff, setEarningStaff] = useState(null);
 const [formData, setFormData] = useState({
 id: '',
 name: '',
 position: 'Waiter',
 phone: '',
 cnic: '',
 address: '',
 salary: undefined,
 advanceLimit: 0,
 joinDate: new Date().toLocaleDateString('en-CA'),
 status: 'active',
 shiftId: '',
 username: '',
 password: '',
 role: 'Staff',
 myWorkAccess: true,
 myWorkPages: [...DEFAULT_MY_WORK_PAGES],
 });
 const [customPos, setCustomPos] = useState('');
 const [jump, setJump] = useState(1);
 const [roles, setRoles] = useState([]);
 const [subTab, setSubTab] = useState('staff'); // staff | map

 // Roles for the login-account dropdown
 useEffect(() => {
 let dead = false;
 (async () => {
 try {
 const res = await fetch(`${API}/api/roles`, { headers: { Authorization: `Bearer ${token}` } });
 if (res.ok && !dead) setRoles(await res.json());
 } catch {}
 })();
 return () => { dead = true };
 }, [API, token]);

 // Biometric device state
 const [deviceUsers, setDeviceUsers] = useState([]);
 const [deviceLoading, setDeviceLoading] = useState(false);
 const [deviceError, setDeviceError] = useState('');
 const [mappings, setMappings] = useState([]);
 const [selectedMapping, setSelectedMapping] = useState({ enrollId: '', staffId: '' });
 const [biometricDeviceId, setBiometricDeviceId] = useState('ZK-01');

 // Mappings needed on Staff tab (bio id column); device users when Map tab is open
 useEffect(() => {
 if (!token) return;
 fetchBiometricDeviceId();
 fetchMappings();
 }, [token]);

 useEffect(() => {
 if (!token || subTab !== 'map') return;
 fetchDeviceUsers();
 fetchMappings();
 }, [token, subTab]);

 const fetchBiometricDeviceId = async () => {
 try {
 const res = await fetch(`${API}/api/biometric-config`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 const data = await res.json();
 if (data.deviceId) setBiometricDeviceId(String(data.deviceId));
 }
 } catch {}
 };

 const fetchDeviceUsers = async () => {
 setDeviceLoading(true);
 setDeviceError('');
 try {
 const res = await fetch(`${API}/api/biometric/device/users`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 const data = await res.json();
 setDeviceUsers(data.users || []);
 } else {
 const err = await res.json();
 setDeviceError([err.message, err.error].filter(Boolean).join(' — ') || 'Failed to fetch device users');
 }
 } catch (e) {
 setDeviceError('Network error - device unreachable');
 } finally {
 setDeviceLoading(false);
 }
 };

 const fetchMappings = async () => {
 try {
 const res = await fetch(`${API}/api/biometric/mappings`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 const data = await res.json();
 setMappings(data.items || []);
 }
 } catch (e) {
 console.error('Failed to fetch mappings:', e);
 }
 };

 const handleCreateMapping = async () => {
 if (!selectedMapping.enrollId || !selectedMapping.staffId) return;
 try {
 const res = await fetch(`${API}/api/biometric/mappings`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`
 },
 body: JSON.stringify({
 // Server always uses Device ID from Biometric Settings; send it for clarity only
 deviceId: biometricDeviceId || 'ZK-01',
 enrollId: String(selectedMapping.enrollId).trim(),
 staffId: selectedMapping.staffId,
 active: true
 })
 });
 if (res.ok) {
 await fetchMappings();
 try { await onMappingsChange?.() } catch {}
 setSelectedMapping({ enrollId: '', staffId: '' });
 }
 } catch (e) {
 console.error('Failed to create mapping:', e);
 }
 };

 const handleDeleteMapping = async (id) => {
 const confirmed = await confirm({ title: 'Remove Mapping', message: 'Remove this biometric mapping?' });
 if (!confirmed) return;
 try {
 const res = await fetch(`${API}/api/biometric/mappings/${id}`, {
 method: 'DELETE',
 headers: { Authorization: `Bearer ${token}` }
 });
 if (res.ok) {
 await fetchMappings();
 try { await onMappingsChange?.() } catch {}
 }
 } catch (e) {
 console.error('Failed to delete mapping:', e);
 }
 };

 const getMappedStaff = (enrollId) => {
 const mapping = mappings.find(m => m.enrollId === enrollId);
 if (!mapping) return null;
 return staff.find(s => s.id === mapping.staffId);
 };

 const isEnrollIdMapped = (enrollId) => {
 return mappings.some(m => m.enrollId === enrollId);
 };

 const handleEdit = (s) => {
 setEditingId(s.id);
 setFormData({
 id: s.id,
 name: s.name,
 position: s.position,
 phone: s.phone || '',
 cnic: s.cnic || '',
 address: s.address || '',
 salary: s.salary,
 advanceLimit: s.advanceLimit || 0,
 joinDate: s.joinDate,
 status: s.status || 'active',
 shiftId: s.shiftId || '',
 username: s.loginUsername || '',
 password: '',
 role: s.loginRole || 'Staff',
 myWorkAccess: s.myWorkAccess !== false,
 myWorkPages: resolveMyWorkPages(s),
 });
 setCustomPos('');
 setShowDialog(true);
 };

 const handleAdd = () => {
 setEditingId(null);
 setFormData({
 id: '',
 name: '',
 position: 'Waiter',
 phone: '',
 cnic: '',
 address: '',
 salary: undefined,
 advanceLimit: 0,
 joinDate: new Date().toLocaleDateString('en-CA'),
 status: 'active',
 shiftId: '',
 username: '',
 password: '',
 role: 'Staff',
 myWorkAccess: true,
 myWorkPages: [...DEFAULT_MY_WORK_PAGES],
 });
 setCustomPos('');
 setShowDialog(true);
 };

 const handleSave = () => {
 const pos = formData.position === 'Other' ? (customPos.trim() || 'Other') : formData.position;
 const pages = Array.isArray(formData.myWorkPages) ? formData.myWorkPages : [];
 const payload = {
   ...formData,
   position: pos,
   myWorkPages: pages,
   myWorkAccess: pages.length > 0,
 };
 if (!payload.username && !payload.password) { delete payload.username; delete payload.password; delete payload.role } // no login change
 if (editingId) {
 onUpdateStaff(editingId, payload);
 } else {
 onAddStaff(payload);
 }
 setShowDialog(false);
 setEditingId(null);
 };

 const handleDelete = async (id) => {
 const confirmed = await confirm({ title: 'Delete Staff', message: 'Delete this staff?' });
 if (confirmed) {
 onDeleteStaff(id);
 }
 };

 return (
 <div className="space-y-4">
 {/* Header Card */}
 <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-4 text-white">
  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
   <div>
    <h2 className="text-lg font-semibold">Staff Directory</h2>
    <p className="text-blue-100 text-sm">Manage staff and biometric device mappings</p>
   </div>
   <div className="text-right">
    <div className="text-3xl font-bold">{staff.length}</div>
    <div className="text-sm text-blue-100">Total Staff</div>
   </div>
  </div>
 </div>

 {/* Sub-tabs: Staff | Map Staff */}
 <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 w-fit">
  <button
   type="button"
   onClick={() => setSubTab('staff')}
   className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
    subTab === 'staff'
     ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow'
     : 'text-slate-600 dark:text-slate-300'
   }`}
  >
   Staff
  </button>
  <button
   type="button"
   onClick={() => setSubTab('map')}
   className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
    subTab === 'map'
     ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow'
     : 'text-slate-600 dark:text-slate-300'
   }`}
  >
   Map Staff
  </button>
 </div>

 {subTab === 'map' && (
 <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
 <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
 <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
 Map Staff — ZKTeco K70
 </h3>
 <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
 Map each device Enroll ID to a staff member for attendance
 </p>
 </div>
 <button
 type="button"
 onClick={fetchDeviceUsers}
 disabled={deviceLoading}
 className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 self-start sm:self-auto"
 >
 {deviceLoading ? 'Loading...' : 'Refresh'}
 </button>
 </div>

 {deviceError && (
 <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800">
 <p className="text-red-600 dark:text-red-400 text-sm">{deviceError}</p>
 </div>
 )}

 <div className="p-4">
 <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
 Device Users ({deviceUsers.length})
 </h4>
 {deviceUsers.length === 0 && !deviceLoading && (
 <p className="text-slate-500 dark:text-slate-400 text-sm">
 No users found on device. Make sure the device is connected.
 </p>
 )}
 {deviceUsers.length > 0 && (
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-slate-100 dark:bg-slate-700/50">
 <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Enroll ID</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Device Name</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Mapped To</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
 {deviceUsers.map((user) => {
 const mappedStaff = getMappedStaff(user.enrollId);
 const mapping = mappings.find(m => m.enrollId === user.enrollId);
 return (
 <tr key={user.enrollId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
 <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{user.enrollId}</td>
 <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{user.name || '-'}</td>
 <td className="px-3 py-2">
 {mappedStaff ? (
 <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 text-xs">
 {mappedStaff.name}
 </span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500 text-xs">Not mapped</span>
 )}
 </td>
 <td className="px-3 py-2">
 {mapping ? (
 <button
 type="button"
 onClick={() => handleDeleteMapping(mapping._id)}
 className="text-red-500 hover:text-red-600 text-xs"
 >
 Remove
 </button>
 ) : (
 <div className="flex items-center gap-2">
 <select
 value={selectedMapping.enrollId === user.enrollId ? selectedMapping.staffId : ''}
 onChange={(e) => setSelectedMapping({ enrollId: user.enrollId, staffId: e.target.value })}
 className="text-xs border rounded px-2 py-1 dark:bg-slate-700 dark:border-slate-600"
 >
 <option value="">Select staff...</option>
 {staff.filter(s => s.status !== 'inactive').map(s => (
 <option key={s.id} value={s.id}>{s.name}</option>
 ))}
 </select>
 <button
 type="button"
 onClick={handleCreateMapping}
 disabled={selectedMapping.enrollId !== user.enrollId || !selectedMapping.staffId}
 className="text-blue-500 hover:text-blue-600 text-xs disabled:opacity-50"
 >
 Map
 </button>
 </div>
 )}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>

 <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-800">
 <p className="text-xs text-blue-600 dark:text-blue-400">
 <strong>Instructions:</strong> Enroll fingerprints directly on the K70 device. Then refresh this list and map each Enroll ID to a staff member. Once mapped, attendance will be automatically recorded when staff scan their fingerprint.
 </p>
 </div>
 </div>
 )}

 {subTab === 'staff' && (
 <>
 {/* Action Bar */}
 <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4 gap-4"><div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto"><div className="relative w-full sm:w-64"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></span><input
 type="text"
 placeholder="Search staff..."
 value={search}
 onChange={(e) => {
 setSearch(e.target.value);
 setPagination(prev => ({ ...prev, page: 1 }));
 }}
 className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-teal-500 transition-all outline-none"
 /></div><div className="flex items-center gap-4 whitespace-nowrap"><div className="flex items-center gap-2"><span className="w-3 h-3 bg-green-500 rounded-full"></span><span className="text-sm text-slate-600 dark:text-slate-400">
 Active
 </span></div><div className="flex items-center gap-2"><span className="w-3 h-3 bg-slate-400 rounded-full"></span><span className="text-sm text-slate-600 dark:text-slate-400">
 Inactive
 </span></div></div></div><div className="flex items-center gap-3 w-full md:w-auto justify-end"><button
 className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200"
 onClick={handleAdd}
 ><span>+</span><span>Add Staff</span></button></div></div>

 {/* Staff Table */}
 {loadingStaff ? (
 <div className="py-20 text-center"><div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-teal-500 border-t-transparent"></div><p className="mt-2 text-slate-500">Loading staff directory...</p></div>
 ) : staff.length === 0 ? (
 <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center"><div className="text-6xl mb-4"></div><h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No Staff Members</h3><p className="text-slate-500 dark:text-slate-400 mb-4">Start building your team by adding staff members</p><button
 className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 text-white font-medium shadow-md hover:shadow-lg transition-all"
 onClick={handleAdd}
 >
 Add First Staff
 </button></div>
 ) : (
 <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
   <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
    <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
    Staff Directory ({staff.length})
   </h3>
  </div>
  <div className="overflow-x-auto">
   <table className="w-full">
    <thead>
     <tr className="bg-slate-100 dark:bg-slate-700/50">
      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Staff</th>
      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Position</th>
      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Phone</th>
      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Biometric</th>
      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Shift</th>
      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Salary</th>
      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Status</th>
      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
     </tr>
    </thead>
    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
     {staff.map((s, idx) => {
      const shift = shifts.find(sh => sh.id === s.shiftId);
      const bioId = s.biometricId || mappings.find(m => String(m.staffId) === String(s.id))?.enrollId;
      return (
       <tr
        key={s.id}
        className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${s.status === 'inactive' ? 'opacity-70' : ''} ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}
       >
        <td className="px-4 py-3">
         <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${s.status === 'inactive' ? 'bg-slate-400' : 'bg-gradient-to-br from-teal-400 to-blue-500'}`}>
           {s.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
           <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{s.name}</div>
           {s.joinDate ? <div className="text-xs text-slate-400">Joined {s.joinDate}</div> : null}
          </div>
         </div>
        </td>
        <td className="px-4 py-3">
         <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
          {s.position || '-'}
         </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
         {s.phone || '—'}
        </td>
        <td className="px-4 py-3">
         <span className={`font-mono text-sm ${bioId ? 'text-blue-700 dark:text-blue-300' : 'text-slate-400'}`}>
          {bioId || '—'}
         </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
         {shift ? (
          <div>
           <div className="font-medium text-slate-700 dark:text-slate-300">{shift.name}</div>
           <div className="text-xs text-slate-400">
            {formatTime12(shift.checkIn)} – {formatTime12(shift.checkOut)}
           </div>
          </div>
         ) : (
          <span className="text-slate-400">No shift</span>
         )}
        </td>
        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
         {s.salary ? `${Number(s.salary).toLocaleString()} PKR` : '—'}
        </td>
        <td className="px-4 py-3 text-center">
         <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${s.status === 'inactive' ? 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>
          {s.status === 'inactive' ? 'Inactive' : 'Active'}
         </span>
        </td>
        <td className="px-4 py-3">
         <div className="flex flex-wrap gap-1.5 justify-center">
          <button
           className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium text-xs hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
           onClick={() => handleEdit(s)}
          >
           Edit
          </button>
          <button
           className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-medium text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
           onClick={() => setEarningStaff(s)}
          >
           Earnings
          </button>
          <button
           className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
           onClick={() => navigate(`/staff/history/${s.id}`)}
          >
           History
          </button>
          <button
           className="px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium text-xs hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
           onClick={() => handleDelete(s.id)}
          >
           Delete
          </button>
         </div>
        </td>
       </tr>
      );
     })}
    </tbody>
   </table>
  </div>
 </div>
 )}

 {/* Pagination Controls */}
 {pagination.total > 0 && (
 <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onLimitChange={n=>{ setPagination(prev => ({ ...prev, limit: n, page: 1 })); setJump(1); }} onPageChange={p=>setPagination(prev => ({ ...prev, page: p }))} />
 )}
 </>
 )}

 <StaffFormDialog
 isOpen={showDialog}
 onClose={() => setShowDialog(false)}
 onSave={handleSave}
 formData={formData}
 setFormData={setFormData}
 customPos={customPos}
 setCustomPos={setCustomPos}
 isEditing={!!editingId}
 shifts={shifts}
 roles={roles}
 />

 <StaffEarningsDialog
 open={!!earningStaff}
 onClose={() => setEarningStaff(null)}
 staff={earningStaff}
 API={API}
 token={token}
 /></div>
 );
}
