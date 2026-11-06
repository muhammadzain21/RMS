import React from 'react';
import { formatTime12 } from '../../../utils/dateUtils.js';
import DatePicker from '../../../components/DatePicker.jsx';

export default function StaffFormDialog({
  isOpen,
  onClose,
  onSave,
  formData,
  setFormData,
  customPos,
  setCustomPos,
  isEditing,
  shifts = [],
  roles = []
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between px-5 py-3 text-white" style={{ background: 'linear-gradient(90deg, #0284c7, #2563eb)' }}>
          <h3 className="text-base font-semibold">{isEditing ? 'Edit Staff' : 'Add Staff'}</h3>
          <button className="rounded-md bg-white/15 px-2 py-1 text-sm hover:bg-white/25" onClick={onClose}>Close</button>
        </div>
        <div className="p-5 max-h-[78vh] overflow-y-auto">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Name</label>
            <input
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Phone</label>
            <input
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.phone || ''}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">CNIC</label>
            <input
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.cnic || ''}
              onChange={e => setFormData({ ...formData, cnic: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Address</label>
            <input
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.address || ''}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Position</label>
            <select
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.position}
              onChange={e => setFormData({ ...formData, position: e.target.value })}
            >
              <option>Waiter</option>
              <option>Chef</option>
              <option>Cashier</option>
              <option>Manager</option>
              <option>Rider</option>
              <option>Other</option>
            </select>
            {formData.position === 'Other' && (
              <input
                placeholder="Custom position"
                className="mt-2 w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
                value={customPos}
                onChange={e => setCustomPos(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="block text-sm mb-1">Shift</label>
            <select
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.shiftId || ''}
              onChange={e => setFormData({ ...formData, shiftId: e.target.value })}
            >
              <option value="">No Shift Assigned</option>
              {shifts.map(shift => (
                <option key={shift.id} value={shift.id}>
                  {shift.name} ({formatTime12(shift.checkIn)} - {formatTime12(shift.checkOut)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Salary (PKR)</label>
            <input
              type="number"
              min={0}
              step={500}
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.salary ?? ''}
              onChange={e => setFormData({ ...formData, salary: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Advance Limit (PKR)</label>
            <input
              type="number"
              min={0}
              step={500}
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.advanceLimit ?? ''}
              placeholder="Defaults to salary"
              onChange={e => setFormData({ ...formData, advanceLimit: e.target.value ? Number(e.target.value) : 0 })}
            />
          </div>
          <div>
            <DatePicker
              label="Join Date"
              value={formData.joinDate || ''}
              onChange={v => setFormData({ ...formData, joinDate: v })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Login Username (optional)</label>
            <input
              autoComplete="off"
              placeholder="e.g. ahmed.waiter — for staff app login"
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.username || ''}
              onChange={e => setFormData({ ...formData, username: e.target.value.trim() })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Login Password (optional)</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder={isEditing ? 'Leave blank to keep current' : 'Required if username is set'}
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.password || ''}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Login Role</label>
            <select
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.role || 'Staff'}
              onChange={e => setFormData({ ...formData, role: e.target.value })}
            >
              {[...new Set(['Staff', ...roles.map(r => r.name)])].map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex items-center justify-between px-3 py-2 rounded border bg-gray-50 dark:bg-gray-800/50">
            <div>
              <div className="text-sm font-medium">My Work portal</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Show this staff member their attendance, purchases & salary history</div>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, myWorkAccess: !(formData.myWorkAccess !== false) })}
              className={`relative w-11 h-6 rounded-full transition-colors ${formData.myWorkAccess !== false ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.myWorkAccess !== false ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Status</label>
            <select
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          <button className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold" onClick={onClose}>Cancel</button>
          <button className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700" onClick={onSave}>
            {isEditing ? 'Update' : 'Save'}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
