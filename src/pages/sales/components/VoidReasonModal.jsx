import React, { useState, useEffect } from 'react'

export default function VoidReasonModal({ open, onCancel, onConfirm }) {
 const [reason, setReason] = useState('')

 useEffect(() => {
 if (open) setReason('')
 }, [open])

 if (!open) return null

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="w-full max-w-md bg-white dark:bg-gray-900 border rounded p-4 space-y-4"><div className="flex items-center justify-between"><div className="text-xl font-semibold">Void Reason</div><button type="button" onClick={onCancel} className="text-gray-500"></button></div><div className="space-y-2"><label className="block text-sm text-gray-700">Reason</label><textarea
 value={reason}
 onChange={e=>setReason(e.target.value)}
 rows={3}
 className="w-full border rounded px-3 py-2 text-sm"
 placeholder="Enter reason for void"
 /></div><div className="flex items-center justify-end gap-2 pt-2"><button type="button" onClick={onCancel} className="px-3 py-2 rounded border">Cancel</button><button
 type="button"
 onClick={()=> onConfirm && onConfirm(reason.trim())}
 disabled={!reason.trim()}
 className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
 >
 Void
 </button></div></div></div>
 )
}
