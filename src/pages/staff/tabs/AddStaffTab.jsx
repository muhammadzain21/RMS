import React, { useState, useEffect } from 'react';
import StaffFormDialog from '../components/StaffFormDialog';
import { formatTime12 } from '../../../utils/dateUtils.js';

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
  shifts = []
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    position: 'Waiter',
    phone: '',
    cnic: '',
    address: '',
    salary: undefined,
    joinDate: new Date().toLocaleDateString('en-CA'),
    status: 'active',
    shiftId: ''
  });
  const [customPos, setCustomPos] = useState('');
  const [jump, setJump] = useState(1);

  // Biometric device state
  const [deviceUsers, setDeviceUsers] = useState([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const [mappings, setMappings] = useState([]);
  const [showBiometricPanel, setShowBiometricPanel] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState({ enrollId: '', staffId: '' });

  // Fetch device users and mappings
  useEffect(() => {
    if (!token || !showBiometricPanel) return;
    fetchDeviceUsers();
    fetchMappings();
  }, [token, showBiometricPanel]);

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
        setDeviceError(err.message || 'Failed to fetch device users');
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
          deviceId: 'ZK-K70-01',
          enrollId: selectedMapping.enrollId,
          staffId: selectedMapping.staffId,
          active: true
        })
      });
      if (res.ok) {
        await fetchMappings();
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
      joinDate: s.joinDate,
      status: s.status || 'active',
      shiftId: s.shiftId || ''
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
      joinDate: new Date().toLocaleDateString('en-CA'),
      status: 'active',
      shiftId: ''
    });
    setCustomPos('');
    setShowDialog(true);
  };

  const handleSave = () => {
    const pos = formData.position === 'Other' ? (customPos.trim() || 'Other') : formData.position;
    const payload = { ...formData, position: pos };
    
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
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-lg p-4 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">👤 Staff Directory</h2>
            <p className="text-purple-100 text-sm">Manage your team members and their details</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{staff.length}</div>
            <div className="text-sm text-purple-100">Total Staff</div>
          </div>
        </div>
      </div>

      {/* Biometric Device Panel Toggle */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
        <button
          onClick={() => setShowBiometricPanel(!showBiometricPanel)}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className="text-2xl">👆</span>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">Biometric Device (K70)</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {showBiometricPanel ? 'Click to hide device panel' : 'Click to manage fingerprint device mappings'}
            </p>
          </div>
          <span className={`transform transition-transform ${showBiometricPanel ? 'rotate-180' : ''}`}>▼</span>
        </button>
      </div>

      {/* Biometric Device Panel */}
      {showBiometricPanel && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              ZKTeco K70 Device
            </h3>
            <button
              onClick={fetchDeviceUsers}
              disabled={deviceLoading}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
            >
              {deviceLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {deviceError && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800">
              <p className="text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                <span>⚠️</span> {deviceError}
              </p>
            </div>
          )}

          {/* Device Users Table */}
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
                                ✓ {mappedStaff.name}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 text-xs">Not mapped</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {mapping ? (
                              <button
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

          {/* Instructions */}
          <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-800">
            <p className="text-xs text-blue-600 dark:text-blue-400">
              <strong>Instructions:</strong> Enroll fingerprints directly on the K70 device. Then refresh this list and map each Enroll ID to a staff member. Once mapped, attendance will be automatically recorded when staff scan their fingerprint.
            </p>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4 gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input
              type="text"
              placeholder="Search staff..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-purple-500 transition-all outline-none"
            />
          </div>
          <div className="flex items-center gap-4 whitespace-nowrap">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Active
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-slate-400 rounded-full"></span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Inactive
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200"
            onClick={handleAdd}
          >
            <span>+</span>
            <span>Add Staff</span>
          </button>
        </div>
      </div>

      {/* Staff Cards Grid */}
      {loadingStaff ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
          <p className="mt-2 text-slate-500">Loading staff directory...</p>
        </div>
      ) : staff.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No Staff Members</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">Start building your team by adding staff members</p>
          <button
            className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium shadow-md hover:shadow-lg transition-all"
            onClick={handleAdd}
          >
            Add First Staff
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map(s => (
            <div key={s.id} className={`bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-all duration-200 ${s.status === 'inactive' ? 'opacity-75' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${s.status === 'inactive' ? 'bg-slate-400' : 'bg-gradient-to-br from-purple-400 to-pink-500'}`}>
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">{s.name}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.status === 'inactive' ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'}`}>
                      {s.status === 'inactive' ? 'Inactive' : 'Active'}
                    </span>
                  </div>
                </div>
                {/* Biometric indicator */}
                {mappings.some(m => m.staffId === s.id) && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full" title="Fingerprint mapped">
                    👆
                  </span>
                )}
              </div>
              
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">💼</span>
                  <span className="text-slate-600 dark:text-slate-400">{s.position}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">📞</span>
                  <span className="text-slate-600 dark:text-slate-400">{s.phone || 'No phone'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">💰</span>
                  <span className="text-slate-600 dark:text-slate-400 font-medium">
                    {s.salary ? `${s.salary.toLocaleString()} PKR` : 'Salary not set'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">🕐</span>
                  <span className="text-slate-600 dark:text-slate-400">
                    {(() => {
                      const shift = shifts.find(sh => sh.id === s.shiftId);
                      if (!shift) return 'No shift assigned';
                      return `${shift.name} (${formatTime12(shift.checkIn)} - ${formatTime12(shift.checkOut)})`;
                    })()}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button 
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-50 text-blue-600 font-medium text-sm hover:bg-blue-100 transition-colors"
                  onClick={() => handleEdit(s)}
                >
                  Edit
                </button>
                <button 
                  className="flex-1 px-4 py-2 rounded-lg bg-red-50 text-red-600 font-medium text-sm hover:bg-red-100 transition-colors"
                  onClick={() => handleDelete(s.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {pagination.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {pagination.page} of {pagination.pages} • {pagination.total} total</span>
            <div className="flex items-center gap-1">
              <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
              <select value={pagination.limit} onChange={e=>{ setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 })); setJump(1); }} className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button disabled={pagination.page<=1} onClick={()=>setPagination(prev => ({ ...prev, page: prev.page - 1 }))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
            <button disabled={pagination.page>=pagination.pages} onClick={()=>setPagination(prev => ({ ...prev, page: prev.page + 1 }))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
            <div className="flex items-center gap-1 ml-2">
              <input type="number" min={1} max={pagination.pages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
              <button disabled={pagination.pages<1} onClick={()=>setPagination(prev => ({ ...prev, page: Math.min(pagination.pages, Math.max(1, Number(jump)||1)) }))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
            </div>
          </div>
        </div>
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
      />
    </div>
  );
}
