import { Router } from 'express'
import RiderLiveLocation from '../models/RiderLiveLocation.js'
import Staff from '../models/Staff.js'
import Sale from '../models/Sale.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { mergeBranchFilter, resolveBranchId } from '../utils/branchScope.js'

const router = Router()
router.use(authRequired)

const STALE_MS = 3 * 60 * 1000 // 3 minutes without ping → treat as stale on live map

async function resolveRiderIdentity(req) {
  const staffId = String(req.user?.staffId || '').trim()
  if (!staffId) {
    const err = new Error('Your login is not linked to a staff profile. Ask admin to link your user to a rider staff account.')
    err.status = 403
    throw err
  }
  const staff = await Staff.findById(staffId).lean()
  if (!staff) {
    const err = new Error('Staff profile not found')
    err.status = 404
    throw err
  }
  const riderId = String(staff._id)
  const riderName = String(staff.name || req.user?.username || 'Rider')
  let branchId = ''
  try { branchId = resolveBranchId(req) || String(staff.branchId || '') } catch { branchId = String(staff.branchId || '') }
  return { staffId, riderId, riderName, branchId, staff }
}

function serialize(doc, { now = Date.now() } = {}) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  const last = o.lastPingAt ? new Date(o.lastPingAt).getTime() : 0
  const stale = !last || (now - last) > STALE_MS
  return {
    ...o,
    id: String(o._id || ''),
    stale,
    ageSeconds: last ? Math.max(0, Math.floor((now - last) / 1000)) : null,
  }
}

/** GET /api/rider-tracking/me — rider's own session */
router.get('/me', async (req, res, next) => {
  try {
    const id = await resolveRiderIdentity(req)
    const doc = await RiderLiveLocation.findOne({ riderId: id.riderId }).lean()
    res.json({
      riderId: id.riderId,
      riderName: id.riderName,
      staffId: id.staffId,
      branchId: id.branchId,
      session: serialize(doc),
    })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** GET /api/rider-tracking/my-deliveries — today's delivery sales assigned to this rider */
router.get('/my-deliveries', async (req, res, next) => {
  try {
    const id = await resolveRiderIdentity(req)
    const date = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10)
    const rows = await Sale.find({
      date,
      orderType: 'Delivery',
      riderId: id.riderId,
    }).sort({ createdAt: -1 }).limit(50).lean()
    res.json({
      date,
      riderId: id.riderId,
      deliveries: rows.map(s => ({
        id: String(s._id),
        billNo: s.billNo || '',
        tokenNo: s.tokenNo || '',
        total: Number(s.total || 0),
        customerName: s.customer?.name || s.customerName || '',
        customerPhone: s.customer?.phone || s.customerPhone || '',
        customerAddress: s.customer?.address || s.customerAddress || '',
        createdAt: s.createdAt,
      })),
    })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** POST /api/rider-tracking/depart — start sharing / mark on delivery */
router.post('/depart', async (req, res, next) => {
  try {
    const id = await resolveRiderIdentity(req)
    const saleId = String(req.body?.saleId || '').trim()
    let orderLabel = String(req.body?.orderLabel || '').trim()
    let customerName = ''
    let customerAddress = ''
    if (saleId) {
      const sale = await Sale.findById(saleId).lean()
      if (sale) {
        orderLabel = orderLabel || sale.billNo || sale.tokenNo || saleId
        customerName = sale.customer?.name || sale.customerName || ''
        customerAddress = sale.customer?.address || sale.customerAddress || ''
      }
    }
    const doc = await RiderLiveLocation.findOneAndUpdate(
      { riderId: id.riderId },
      {
        $set: {
          riderId: id.riderId,
          riderName: id.riderName,
          staffId: id.staffId,
          branchId: id.branchId,
          status: 'on_delivery',
          saleId,
          orderLabel,
          customerName,
          customerAddress,
          startedAt: new Date(),
          lastPingAt: new Date(),
        },
      },
      { upsert: true, new: true }
    )
    res.json(serialize(doc))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** POST /api/rider-tracking/complete — stop delivery / keep available */
router.post('/complete', async (req, res, next) => {
  try {
    const id = await resolveRiderIdentity(req)
    const keepSharing = req.body?.keepSharing !== false
    const doc = await RiderLiveLocation.findOneAndUpdate(
      { riderId: id.riderId },
      {
        $set: {
          status: keepSharing ? 'available' : 'offline',
          saleId: '',
          orderLabel: '',
          customerName: '',
          customerAddress: '',
          startedAt: null,
          lastPingAt: new Date(),
        },
      },
      { upsert: true, new: true }
    )
    res.json(serialize(doc))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** POST /api/rider-tracking/ping — GPS update from rider phone */
router.post('/ping', async (req, res, next) => {
  try {
    const id = await resolveRiderIdentity(req)
    const lat = Number(req.body?.lat)
    const lng = Number(req.body?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng required' })
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'invalid coordinates' })
    }
    const accuracy = req.body?.accuracy != null ? Number(req.body.accuracy) : null
    const heading = req.body?.heading != null ? Number(req.body.heading) : null
    const speed = req.body?.speed != null ? Number(req.body.speed) : null
    const statusIn = String(req.body?.status || '').trim()
    const existing = await RiderLiveLocation.findOne({ riderId: id.riderId }).lean()
    let status = existing?.status || 'available'
    if (status === 'offline') status = 'available'
    if (statusIn === 'on_delivery' || statusIn === 'available' || statusIn === 'offline') status = statusIn

    const doc = await RiderLiveLocation.findOneAndUpdate(
      { riderId: id.riderId },
      {
        $set: {
          riderId: id.riderId,
          riderName: id.riderName,
          staffId: id.staffId,
          branchId: id.branchId || existing?.branchId || '',
          status,
          lat,
          lng,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          heading: Number.isFinite(heading) ? heading : null,
          speed: Number.isFinite(speed) ? speed : null,
          lastPingAt: new Date(),
        },
        $setOnInsert: {
          startedAt: status === 'on_delivery' ? new Date() : null,
        },
      },
      { upsert: true, new: true }
    )
    res.json(serialize(doc))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** POST /api/rider-tracking/stop — turn off sharing completely */
router.post('/stop', async (req, res, next) => {
  try {
    const id = await resolveRiderIdentity(req)
    const doc = await RiderLiveLocation.findOneAndUpdate(
      { riderId: id.riderId },
      {
        $set: {
          status: 'offline',
          saleId: '',
          orderLabel: '',
          customerName: '',
          customerAddress: '',
          startedAt: null,
          lastPingAt: new Date(),
        },
      },
      { upsert: true, new: true }
    )
    res.json(serialize(doc))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** GET /api/rider-tracking/live — restaurant map feed */
router.get('/live', requireRole('Admin', 'Manager', 'Staff'), async (req, res, next) => {
  try {
    const filter = mergeBranchFilter(req, {
      status: { $in: ['available', 'on_delivery'] },
      lat: { $ne: null },
      lng: { $ne: null },
    })
    const rows = await RiderLiveLocation.find(filter).sort({ lastPingAt: -1 }).lean()
    const now = Date.now()
    res.json({
      riders: rows.map(r => serialize(r, { now })),
      staleAfterSeconds: Math.floor(STALE_MS / 1000),
      serverTime: new Date().toISOString(),
    })
  } catch (e) { next(e) }
})

export default router
