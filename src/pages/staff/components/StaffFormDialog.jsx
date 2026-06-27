import React from 'react';
import { formatTime12 } from '../../../utils/dateUtils.js';

export default function StaffFormDialog({
  isOpen,
  onClose,
  onSave,
  formData,
  setFormData,
  customPos,
  setCustomPos,
  isEditing,
  shifts = []
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-full max-w-2xl p-4 rounded bg-white dark:bg-gray-900 shadow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">{isEditing ? 'Edit Staff' : 'Add Staff'}</h3>
          <button className="px-2 py-1 rounded border" onClick={onClose}>Close</button>
        </div>
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
            <label className="block text-sm mb-1">Join Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={formData.joinDate || ''}
              onChange={e => setFormData({ ...formData, joinDate: e.target.value })}
            />
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
          <button className="px-3 py-2 rounded border" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={onSave}>
            {isEditing ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
