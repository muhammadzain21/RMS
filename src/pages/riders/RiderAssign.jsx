import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'

export default function RiderAssign() {
  const { state } = useData()
  const { token } = useAuth()
  const [orderId, setOrderId] = useState('')
  const [riderId, setRiderId] = useState('')
  const riders = state.riders || []
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

  useEffect(() => {
    if (!riderId && riders.length) setRiderId(riders[0].id)
  }, [riders])

  const assign = async (e) => {
    e.preventDefault()
    if (!orderId || !riderId) { toast.error('Order ID and Rider are required'); return }
    try {
      const rider = riders.find(r=>r.id===riderId)
      const payload = { orderId, riderId, riderName: rider?.name || '', date: new Date().toLocaleDateString('en-CA'), deliveries: 1, amount: 0, deliveryCharge: 0, method: 'COD', note: 'Assigned via RiderAssign' }
      const res = await fetch(`${API}/api/rider-cash`, { method: 'POST', headers, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Failed')
      toast.success(`Assigned order ${orderId} to ${rider?.name || 'rider'}`)
      setOrderId('')
    } catch {
      toast.error('Failed to assign rider')
    }
  }

  return (
    <div className="space-y-3 max-w-xl">
      <h1 className="text-xl font-semibold">Assign Delivery</h1>
      <form onSubmit={assign} className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input placeholder="Order ID" value={orderId} onChange={e=>setOrderId(e.target.value)} className="px-3 py-2 border rounded" />
        <select value={riderId} onChange={e=>setRiderId(e.target.value)} className="px-3 py-2 border rounded">
          {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button className="px-3 py-2 bg-primary-600 text-white rounded">Assign</button>
      </form>
    </div>
  )
}
