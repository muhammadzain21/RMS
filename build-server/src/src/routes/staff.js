import { Router } from 'express'
import Staff from '../models/Staff.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

// All endpoints require authentication
router.use(authRequired)

// GET /api/staff with pagination and search
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    
    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { position: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const [total, rows] = await Promise.all([
      Staff.countDocuments(query),
      Staff.find(query).sort({ name: 1 }).skip(skip).limit(limit)
    ]);

    res.json({
      data: rows,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const s = await Staff.create(req.body)
    try { await Audit.create({ type: 'staff', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Added staff ${s?.name || s?._id}`, meta: { id: s._id } }) } catch {}
    res.status(201).json(s)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const s = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true })
    try { await Audit.create({ type: 'staff', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated staff ${req.params.id}`, meta: { id: req.params.id, patch: req.body } }) } catch {}
    res.json(s)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await Staff.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'staff', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted staff ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
