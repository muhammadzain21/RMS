import React, { useState } from 'react';
import { formatTime12 } from '../../../utils/dateUtils.js';

export default function StaffSettingsTab({ settings, setSettings, onSave }) {
  const inputClasses = "w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all";
  const labelClasses = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2";
  
  const [newShift, setNewShift] = useState({ id: '', name: '', checkIn: '09:00', checkOut: '17:00' });
  const [editingShiftId, setEditingShiftId] = useState(null);

  const shifts = settings.shifts || [];

  const addShift = () => {
    if (!newShift.name.trim()) return;
    const id = newShift.id.trim() || `shift-${Date.now()}`;
    setSettings({ 
      ...settings, 
      shifts: [...shifts, { ...newShift, id }] 
    });
    setNewShift({ id: '', name: '', checkIn: '09:00', checkOut: '17:00' });
  };

  const updateShift = (index, field, value) => {
    const updated = [...shifts];
    updated[index] = { ...updated[index], [field]: value };
    setSettings({ ...settings, shifts: updated });
  };

  const deleteShift = (index) => {
    const updated = shifts.filter((_, i) => i !== index);
    setSettings({ ...settings, shifts: updated });
  };

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-4 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Staff Settings</h2>
            <p className="text-blue-100 text-sm">Configure shifts, attendance rules and salary calculations</p>
          </div>
        </div>
      </div>

      {/* Shifts Management */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Shift Timings
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Define shifts and assign them to staff members</p>
        </div>

        <div className="p-6">
          {/* Existing Shifts */}
          <div className="space-y-3 mb-6">
            {shifts.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-center py-4">No shifts defined. Add your first shift below.</p>
            ) : (
              shifts.map((shift, index) => (
                <div key={shift.id} className="flex flex-col md:flex-row items-start md:items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
                  {editingShiftId === shift.id ? (
                    <>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Shift Name</label>
                        <input
                          type="text"
                          placeholder="Shift Name"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                          value={shift.name}
                          onChange={e => updateShift(index, 'name', e.target.value)}
                        />
                      </div>
                      <input
                        type="time"
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                        value={shift.checkIn}
                        onChange={e => updateShift(index, 'checkIn', e.target.value)}
                      />
                      <span className="text-slate-400">to</span>
                      <input
                        type="time"
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                        value={shift.checkOut}
                        onChange={e => updateShift(index, 'checkOut', e.target.value)}
                      />
                      <button
                        onClick={() => setEditingShiftId(null)}
                        className="px-3 py-2 rounded-lg bg-teal-500 text-white text-sm"
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{shift.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded text-green-700 dark:text-green-400">{formatTime12(shift.checkIn)}</span>
                        <span>to</span>
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 rounded text-red-700 dark:text-red-400">{formatTime12(shift.checkOut)}</span>
                      </div>
                      <div className="flex gap-2 sm:ml-auto">
                        <button
                          onClick={() => setEditingShiftId(shift.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 text-sm hover:bg-blue-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteShift(index)}
                          className="px-3 py-1.5 rounded-lg bg-red-100 text-red-600 text-sm hover:bg-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Add New Shift */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-3">Add New Shift</h4>
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Shift Name</label>
                <input
                  type="text"
                  placeholder="Shift Name (e.g., Morning Shift)"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                  value={newShift.name}
                  onChange={e => setNewShift({ ...newShift, name: e.target.value })}
                />
              </div>
              <input
                type="time"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                value={newShift.checkIn}
                onChange={e => setNewShift({ ...newShift, checkIn: e.target.value })}
              />
              <input
                type="time"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                value={newShift.checkOut}
                onChange={e => setNewShift({ ...newShift, checkOut: e.target.value })}
              />
              <button
                onClick={addShift}
                className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600"
              >
                + Add Shift
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Late Policy & Salary Settings */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
            Attendance & Salary Configuration
          </h3>
        </div>

        <div className="p-6">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Late Threshold */}
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
              <h4 className="font-medium text-orange-800 dark:text-orange-300 mb-4">Late Threshold (minutes)</h4>
              <input
                type="number"
                min={0}
                className={inputClasses}
                value={settings.lateThresholdMinutes}
                onChange={e => setSettings({ ...settings, lateThresholdMinutes: Number(e.target.value) })}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Staff arriving after this threshold will be marked as Late
              </p>
            </div>

            {/* Bonus Per Present Day */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
              <h4 className="font-medium text-green-800 dark:text-green-300 mb-4">Bonus Per Present Day (PKR)</h4>
              <input
                type="number"
                min={0}
                step={50}
                className={inputClasses}
                value={settings.bonusPerDay}
                onChange={e => setSettings({ ...settings, bonusPerDay: Number(e.target.value) })}
              />
            </div>

            {/* Deduction Per Absent */}
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
              <h4 className="font-medium text-red-800 dark:text-red-300 mb-4">Deduction Per Absent (PKR)</h4>
              <input
                type="number"
                min={0}
                step={50}
                className={inputClasses}
                value={settings.deductionPerAbsent}
                onChange={e => setSettings({ ...settings, deductionPerAbsent: Number(e.target.value) })}
              />
            </div>

            {/* Deduction Per Late */}
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
              <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-4">Deduction Per Late (PKR)</h4>
              <input
                type="number"
                min={0}
                step={50}
                className={inputClasses}
                value={settings.deductionPerLate}
                onChange={e => setSettings({ ...settings, deductionPerLate: Number(e.target.value) })}
              />
            </div>

            {/* Deduction Per Minute Late */}
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
              <h4 className="font-medium text-purple-800 dark:text-purple-300 mb-4">Deduction Per Minute Late (PKR)</h4>
              <input
                type="number"
                min={0}
                step={5}
                className={inputClasses}
                value={settings.deductionPerMinute}
                onChange={e => setSettings({ ...settings, deductionPerMinute: Number(e.target.value) })}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                e.g., 10 PKR × 30 min = 300 PKR
              </p>
            </div>

            {/* Deduction Per Minute Early Out */}
            <div className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-4 border border-pink-200 dark:border-pink-800">
              <h4 className="font-medium text-pink-800 dark:text-pink-300 mb-4">Deduction Per Minute Early Out (PKR)</h4>
              <input
                type="number"
                min={0}
                step={5}
                className={inputClasses}
                value={settings.deductionPerMinuteEarlyOut}
                onChange={e => setSettings({ ...settings, deductionPerMinuteEarlyOut: Number(e.target.value) })}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                e.g., 10 PKR × 30 min early = 300 PKR
              </p>
            </div>
          </div>

          {/* Absent Charges Checkbox - Full Width */}
          <div className="mt-6 bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="absentChargesEnabled"
                checked={settings.absentChargesEnabled}
                onChange={e => setSettings({ ...settings, absentChargesEnabled: e.target.checked })}
                className="mt-1 w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
              />
              <div>
                <label htmlFor="absentChargesEnabled" className="font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                  Enable Absent Charges (Per Day Rate)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  When enabled, absent days will deduct the staff's daily salary rate (Salary/30) instead of fixed amount
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button 
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-teal-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all"
            onClick={onSave}
          >
            <span></span>
            <span>Save Settings</span>
          </button>
        </div>
      </div>

    </div>
  );
}
