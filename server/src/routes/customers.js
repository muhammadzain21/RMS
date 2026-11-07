import { Router } from 'express'
import Customer from '../models/Customer.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { digitsOnly, normalizeCustomerFields } from '../utils/customerNormalize.js'

const router = Router()

router.use(authRequired)

router.get('/', async (req, res, next) => {
  try {
    const { phone, q: qtext } = req.query
    // Phone lookup path (used by POS / Call Center): quick, limited
    if (phone) {
      const digits = digitsOnly(phone)
      if (!digits) return res.json([])
      const pattern = digits.split('').join('\\D*')
      // Match phone field; also name (recovers older swapped name/phone rows)
      const rows = await Customer.find({
        $or: [
          { phone: { $regex: pattern, $options: 'i' } },
          { name: { $regex: `^\\s*${pattern}\\s*$`, $options: 'i' } },
        ],
      }).sort({ name: 1 }).limit(8).lean()

      // Prefer digit-normalized phone matches; repair swapped rows in the response
      const ranked = rows.map((c) => {
        const phoneDigits = digitsOnly(c.phone)
        const nameDigits = digitsOnly(c.name)
        const phoneHit = phoneDigits.includes(digits)
        const swapped = !phoneHit && nameDigits.includes(digits)
        if (swapped) {
          return {
            ...c,
            id: c._id,
            name: String(c.phone || '').trim() || c.name,
            phone: nameDigits || String(c.name || '').trim(),
            _repairedSwap: true,
          }
        }
        return { ...c, id: c._id }
      })
      return res.json(ranked)
    }

    // Paginated listing path
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)))
    const page = Math.max(1, Number(req.query.page || 1))
    const skip = (page - 1) * limit

    const query = {}
    if (qtext && String(qtext).trim()) {
      const t = String(qtext).trim()
      query.$or = [
        { name: { $regex: t, $options: 'i' } },
        { phone: { $regex: t, $options: 'i' } },
      ]
    }

    const [rows, total] = await Promise.all([
      Customer.find(query).sort({ name: 1, createdAt: -1 }).skip(skip).limit(limit),
      Customer.countDocuments(query),
    ])
    const pages = Math.max(1, Math.ceil(total / limit))
    res.json({ rows, total, page, pages, limit })
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager','Staff','CallCenter'), async (req, res, next) => {
  try {
    const payload = normalizeCustomerFields(req.body || {})
    if (!digitsOnly(payload.phone) && !String(payload.name || '').trim()) {
      return res.status(400).json({ error: 'Customer name or phone is required' })
    }
    if (payload.phone && digitsOnly(payload.phone).length < 3) {
      return res.status(400).json({ error: 'Enter a valid phone number' })
    }
    // Prefer updating an existing phone match instead of creating duplicates
    const phone = digitsOnly(payload.phone)
    if (phone) {
      const existing = await Customer.findOne({
        $or: [
          { phone },
          { phone: { $regex: phone.split('').join('\\D*'), $options: 'i' } },
        ],
      })
      if (existing) {
        existing.name = payload.name || existing.name
        existing.phone = phone
        if (payload.address) existing.address = payload.address
        if (payload.isRegular != null) existing.isRegular = Boolean(payload.isRegular)
        await existing.save()
        return res.status(200).json(existing)
      }
    }
    const c = await Customer.create({
      name: payload.name || '',
      phone: phone || payload.phone || '',
      address: payload.address || '',
      isRegular: Boolean(payload.isRegular),
    })
    try { await Audit.create({ type: 'customer', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Added customer ${c?.name || c?.phone || c?._id}`, meta: { id: c._id } }) } catch {}
    res.status(201).json(c)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager','Staff','CallCenter'), async (req, res, next) => {
  try {
    const payload = normalizeCustomerFields(req.body || {})
    const patch = {
      name: payload.name,
      phone: digitsOnly(payload.phone) || payload.phone,
      address: payload.address,
    }
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'isRegular')) {
      patch.isRegular = Boolean(payload.isRegular)
    }
    const c = await Customer.findByIdAndUpdate(req.params.id, patch, { new: true })
    if (!c) return res.status(404).json({ error: 'Customer not found' })
    try { await Audit.create({ type: 'customer', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated customer ${req.params.id}`, meta: { id: req.params.id, patch } }) } catch {}
    res.json(c)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await Customer.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'customer', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted customer ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
