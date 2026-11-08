import { Router } from 'express'
import bcrypt from 'bcryptjs'
import Staff from '../models/Staff.js'
import User from '../models/User.js'
import Role from '../models/Role.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

// Ensure the built-in 'Staff' role exists (grants the /my self-service page by default)
async function ensureStaffRole() {
  let role = await Role.findOne({ name: 'Staff' })
  if (role) return role
  try {
    role = await Role.create({
      name: 'Staff',
      description: 'Staff self-service: own attendance, purchases and payroll',
      // /my is controlled by Staff.myWorkAccess at login time, not by this role default
      permissions: [],
      isDefault: false,
    })
  } catch { /* role may have been created concurrently */ }
  return role
}

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
    const { mergeBranchFilter } = await import('../utils/branchScope.js')
    query = mergeBranchFilter(req, query)

    const [total, rows] = await Promise.all([
      Staff.countDocuments(query),
      Staff.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean()
    ]);

    // Attach the linked login username (if any) so the edit dialog can show it
    const ids = rows.map(r => String(r._id))
    const linkedUsers = await User.find({ staffId: { $in: ids } }).select('staffId username role').lean()
    const unameByStaff = Object.fromEntries(linkedUsers.map(u => [u.staffId, u.username]))
    const roleByStaff = Object.fromEntries(linkedUsers.map(u => [u.staffId, u.role]))

    res.json({
      data: rows.map(r => ({
        ...r,
        loginUsername: unameByStaff[String(r._id)] || '',
        loginRole: roleByStaff[String(r._id)] || ''
      })),
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    // username/password are for the staff member's login account, not the staff doc
    const { username, password, role, ...staffBody } = req.body || {}
    const uname = String(username || '').trim()
    const roleName = String(role || 'Staff').trim() || 'Staff'
    if (roleName === 'SuperAdmin' && req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Only superadmin can create superadmin users' })
    }
    if (uname) {
      const exists = await User.findOne({ username: uname })
      if (exists) return res.status(409).json({ error: 'Username already exists — pick another or edit the user in Users' })
    }
    const { stampBranchId } = await import('../utils/branchScope.js')
    const s = await Staff.create(stampBranchId(req, staffBody))
    if (uname) {
      if (!password || String(password).length < 4) {
        await Staff.findByIdAndDelete(s._id)
        return res.status(400).json({ error: 'Password is required (min 4 chars) when creating a login' })
      }
      await ensureStaffRole()
      const passwordHash = await bcrypt.hash(String(password), 10)
      await User.create({ username: uname, passwordHash, role: roleName, staffId: String(s._id) })
    }
    try { await Audit.create({ type: 'staff', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Added staff ${s?.name || s?._id}`, meta: { id: s._id, login: uname || null } }) } catch {}
    res.status(201).json(s)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const { username, password, role, ...staffBody } = req.body || {}
    const uname = String(username || '').trim()
    const roleName = role !== undefined ? (String(role).trim() || 'Staff') : undefined
    if (roleName === 'SuperAdmin' && req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Only superadmin can modify superadmin accounts' })
    }

    // Reject username that belongs to a different user before touching anything
    const linked = await User.findOne({ staffId: req.params.id })
    if (uname) {
      const other = await User.findOne({ username: uname })
      if (other && (!linked || String(other._id) !== String(linked._id))) {
        return res.status(409).json({ error: 'Username already exists — pick another' })
      }
    }

    const existing = await Staff.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Staff not found' })
    try {
      const { assertDocumentBranch } = await import('../utils/branchScope.js')
      assertDocumentBranch(req, existing)
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message })
      throw e
    }
    if (existing.branchId) staffBody.branchId = String(existing.branchId)
    const s = await Staff.findByIdAndUpdate(req.params.id, staffBody, { new: true })
    if (!s) return res.status(404).json({ error: 'Not found' })

    // Sync the linked login account: create if missing, update username/password if present
    if (uname || password) {
      if (!linked) {
        if (!uname || !password || String(password).length < 4) {
          return res.status(400).json({ error: 'Username + password (min 4 chars) are required to create a login' })
        }
        await ensureStaffRole()
        const passwordHash = await bcrypt.hash(String(password), 10)
        await User.create({ username: uname, passwordHash, role: roleName || 'Staff', staffId: String(s._id) })
      } else {
        if (uname) linked.username = uname
        if (password) linked.passwordHash = await bcrypt.hash(String(password), 10)
        if (roleName) linked.role = roleName
        await linked.save()
      }
    }

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
