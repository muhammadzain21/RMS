import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

export default function DeliveryCustomerModal({
 open,
 onClose,
 API,
 authHeaders,
 dispatch,
 payName,
 setPayName,
 payPhone,
 setPayPhone,
 payAddress,
 setPayAddress,
}) {
 const [loading, setLoading] = useState(false)
 const [lookupMsg, setLookupMsg] = useState('')
 const [found, setFound] = useState(false)
 const [suggestions, setSuggestions] = useState([])
 const [showSuggestions, setShowSuggestions] = useState(false)
 const [searching, setSearching] = useState(false)
 const [activeSuggestion, setActiveSuggestion] = useState(-1)
 const phoneInputRef = useRef(null)
 const nameInputRef = useRef(null)
 const phoneFocusedRef = useRef(false)
 const continueBtnRef = useRef(null)

 useEffect(()=>{ setLookupMsg(''); setFound(false); setSuggestions([]); setShowSuggestions(false); setActiveSuggestion(-1); if (open) { setPayName(''); setPayPhone(''); setPayAddress('') } }, [open])

 // Auto-lookup by phone (debounced)
 useEffect(() => {
 const phone = String(payPhone||'').trim()
 if (!open) return
 if (!phone) { setLookupMsg(''); setFound(false); setSuggestions([]); setShowSuggestions(false); return }
 const digits = phone.replace(/\D/g,'')
 if (digits.length < 3) { setLookupMsg(''); setFound(false); setSuggestions([]); setShowSuggestions(false); return }
 // Skip lookup if a customer was already selected from dropdown
 if (found) return
 const t = setTimeout(async () => {
 setSearching(true)
 try {
 const res = await fetch(`${API}/api/customers?phone=${encodeURIComponent(digits)}`, { headers: { ...(authHeaders||{}) }, cache: 'no-store' })
 if (res.ok) {
 const rows = await res.json()
 const list = Array.isArray(rows) ? rows : []
 setSuggestions(list)
 setShowSuggestions(phoneFocusedRef.current)
 setFound(false)
 setLookupMsg(list.length ? '' : 'No customer found')
 } else {
 setLookupMsg('Search failed')
 setFound(false)
 setSuggestions([])
 setShowSuggestions(false)
 }
 } catch {
 setLookupMsg('Network error while searching')
 setFound(false)
 setSuggestions([])
 setShowSuggestions(false)
 } finally {
 setSearching(false)
 }
 }, 300)
 return () => clearTimeout(t)
 }, [payPhone, open, found, API, setPayName, setPayAddress, authHeaders])

 const selectCustomer = (c) => {
 setPayPhone(String(c?.phone||''))
 setPayName(String(c?.name||''))
 setPayAddress(String(c?.address||''))
 setFound(true)
 setLookupMsg('')
 setShowSuggestions(false)
 setActiveSuggestion(-1)
 setTimeout(()=>continueBtnRef.current?.focus(), 0)
 }

 const handlePhoneKeyDown = (e) => {
 if (!showSuggestions || !suggestions.length) return
 if (e.key === 'ArrowDown') {
 e.preventDefault()
 setActiveSuggestion(prev => Math.min(prev + 1, suggestions.length - 1))
 } else if (e.key === 'ArrowUp') {
 e.preventDefault()
 setActiveSuggestion(prev => Math.max(prev - 1, 0))
 } else if (e.key === 'Enter') {
 e.preventDefault()
 if (activeSuggestion >= 0 && activeSuggestion < suggestions.length) {
 selectCustomer(suggestions[activeSuggestion])
 }
 } else if (e.key === 'Escape') {
 setShowSuggestions(false)
 setActiveSuggestion(-1)
 }
 }

 if (!open) return null

 const saveIfNew = async () => {
 const name = String(payName||'').trim()
 const phone = String(payPhone||'').trim()
 const address = String(payAddress||'').trim()
 if (!phone && !name) { toast.error('Please enter at least a Name or Phone'); return }
 setLoading(true)
 setShowSuggestions(false)
 try {
 // If user explicitly selected a customer from the dropdown (found=true),
 // update that existing customer. Otherwise, always create a new one.
 if (found) {
 // Find the selected customer to get its id
 const existing = suggestions.find(c => String(c?.phone||'').replace(/\D/g,'') === phone.replace(/\D/g,''))
 if (existing) {
 try { await fetch(`${API}/api/customers/${existing.id||existing._id}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ name: name || existing.name, phone: phone || existing.phone, address: address || existing.address }) }) } catch {}
 onClose()
 return
 }
 }
 // create new customer (even if phone matches an existing one)
 const res = await fetch(`${API}/api/customers`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ name, phone, address, isRegular: false }) })
 if (res.ok) {
 const created = await res.json()
 // hydrate customers list in state if dispatch available
 try { dispatch && dispatch({ type: 'HYDRATE', payload: { customersAppend: [{ id: created.id || created._id, name: created.name, phone: created.phone, address: created.address }] } }) } catch {}
 onClose()
 } else {
 const msg = await res.text()
 toast.error(`Failed to save customer: ${msg || res.status}`)
 }
 } catch {
 toast.error('Network error while saving customer')
 } finally {
 setLoading(false)
 }
 }

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="w-full max-w-lg bg-white dark:bg-gray-900 border rounded p-4 space-y-3"><div className="flex items-center justify-between"><div className="text-lg font-semibold dark:text-gray-100">Delivery Customer</div><button onClick={onClose} className="text-gray-500 dark:text-gray-400"></button></div><div className="space-y-2"><label className="block text-sm dark:text-gray-300">Phone
 <div className="mt-1 relative"><input
 ref={phoneInputRef}
 className="px-3 py-2 border rounded w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:border-gray-700"
 value={payPhone}
 maxLength={11}
 onChange={e=>{
 const digits = (e.target.value||'').replace(/\D/g,'').slice(0,11)
 setPayPhone(digits)
 setFound(false)
 setLookupMsg('')
 setActiveSuggestion(-1)
 if (digits.length >= 3) setShowSuggestions(true)
 }}
 onKeyDown={handlePhoneKeyDown}
 onFocus={()=>{ phoneFocusedRef.current = true; const d = String(payPhone||'').replace(/\D/g,''); if (d.length>=3 && suggestions.length) setShowSuggestions(true) }}
 onBlur={()=>{ phoneFocusedRef.current = false; setTimeout(()=>setShowSuggestions(false), 150) }}
 />
 {showSuggestions && (suggestions||[]).length>0 && (
 <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto bg-white dark:bg-gray-800 border dark:border-gray-700 rounded shadow">
 {(suggestions||[]).map((c,i)=> (
 <button
 key={c.id||c._id||i}
 type="button"
 className={`w-full text-left px-3 py-2 ${activeSuggestion === i ? 'bg-blue-100 dark:bg-blue-900/40' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
 onMouseDown={e=>{
 e.preventDefault()
 selectCustomer(c)
 }}
 ><div className="font-medium">{c?.name || '-'}</div><div className="text-xs text-gray-600 dark:text-gray-400">{c?.address || ''}</div><div className="text-xs text-gray-700 dark:text-gray-500">{c?.phone || ''}</div></button>
 ))}
 </div>
 )}
 </div></label>
 {lookupMsg && (
 <div className={`text-xs ${found ? 'text-green-700' : 'text-gray-600'}`}>{lookupMsg}</div>
 )}
 <label className="block text-sm dark:text-gray-300">Name
 <input ref={nameInputRef} className="mt-1 px-3 py-2 border rounded w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:border-gray-700" value={payName} onChange={e=>{ setPayName(e.target.value); setShowSuggestions(false) }} /></label><label className="block text-sm dark:text-gray-300">Address
 <textarea rows={2} className="mt-1 px-3 py-2 border rounded w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:border-gray-700" value={payAddress} onChange={e=>{ setPayAddress(e.target.value); setShowSuggestions(false) }} /></label><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="px-4 py-2 border dark:border-gray-600 dark:text-gray-200 rounded" disabled={loading}>Cancel</button><button ref={continueBtnRef} type="button" onClick={saveIfNew} className="px-4 py-2 bg-green-600 text-white rounded" disabled={loading}>{loading? 'Saving...' : 'Continue'}</button></div></div></div></div>
 )
}
