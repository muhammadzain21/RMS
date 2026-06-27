import React, { useState } from 'react';

export default function PayDialog({ isOpen, onClose, onSubmit, monthlyStaffId, month }) {
  const [payNoteText, setPayNoteText] = useState('');
  const [payAmount, setPayAmount] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!monthlyStaffId) return;
    const amt = Number(payAmount || 0);
    if (!(amt > 0)) return;
    onSubmit({ staffId: monthlyStaffId, month, notes: payNoteText.trim(), amount: amt });
    setPayNoteText('');
    setPayAmount('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-full max-w-md p-4 rounded bg-white dark:bg-gray-900 shadow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">Pay Staff</h3>
          <button className="px-2 py-1 rounded border" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Notes</label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={payNoteText}
              onChange={e => setPayNoteText(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Amount (PKR)</label>
            <input
              type="number"
              min={0}
              step={100}
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="px-3 py-2 rounded border" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded bg-teal-600 text-white" onClick={handleSubmit}>Save</button>
        </div>
      </div>
    </div>
  );
}
