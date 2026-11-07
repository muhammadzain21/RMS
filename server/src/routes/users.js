import { Router } from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Role from '../models/Role.js'
import Audit from '../models/Audit.js'
import { authRequired } from '../middleware/auth.js'
import { defaultSidebarItems } from '../utils/sidebarDefaults.js'
import { isHqUser } from '../utils/branchScope.js'

function toPublicUser(u) {
  const custom = !!u.useCustomPermissions
  return {
    id: u._id,
    username: u.username,
    role: u.role,
    homeBranchId: u.homeBranchId || '',
    branchIds: Array.isArray(u.branchIds) ? u.branchIds : [],
    isHq: !!u.isHq,
    staffId: u.staffId || '',
    useCustomPermissions: custom,
    pageAccess: custom
      ? (u.permissions || []).filter(p => p.visible && p.path !== '/my').map(p => p.path)
      : null,
  }
}

function pageAccessUpdates(body, { grantable = null, preservePaths = [] } = {}) {
  if (!body || !('pageAccess' in body)) return {}
  if (body.pageAccess === null) {
    return { useCustomPermissions: false, permissions: [] }
  }
  if (Array.isArray(body.pageAccess)) {
    let paths = body.pageAccess.map(String).filter(Boolean)
    if (grantable) {
      paths = paths.filter(p => grantable.has(p))
      for (const p of preservePaths) {
        if (!grantable.has(p) && !paths.includes(p)) paths.push(p)
      }
    }
    const allowed = new Set(paths)
    return {
      useCustomPermissions: true,
      permissions: defaultSidebarItems
        .filter(i => i.path !== '/my')
        .map(i => ({
          path: i.path,
          label: i.label,
          visible: allowed.has(i.path),
          order: i.order,
          section: i.section,
        })),
    }
  }
  return {}
}

/** Paths this actor may assign to other users. null = unrestricted (Admin/HQ). */
async function resolveActorGrantablePaths(actor) {
  if (isAdminActor(actor) || isHqUser(actor)) return null
  const dbUser = await User.findById(actor.id || actor._id)
  if (!dbUser) return new Set()
  let perms = []
  if (dbUser.useCustomPermissions && Array.isArray(dbUser.permissions)) {
    perms = dbUser.permissions
  } else if (dbUser.role) {
    const role = await Role.findOne({ name: dbUser.role })
    perms = Array.isArray(role?.permissions) ? role.permissions : []
  }
  return new Set(
    perms
      .filter(p => p?.visible && p.path && p.path !== '/my')
      .map(p => String(p.path))
  )
}

function isAdminActor(user) {
  return user?.role === 'Admin' || user?.role === 'SuperAdmin'
}

function actorBranchIds(user) {
  const ids = [
    ...(Array.isArray(user?.branchIds) ? user.branchIds : []),
    user?.homeBranchId,
  ].filter(Boolean).map(String)
  return [...new Set(ids)]
}

function userInBranches(u, allowed) {
  if (!allowed.length) return false
  if (allowed.includes(String(u.homeBranchId || ''))) return true
  return Array.isArray(u.branchIds) && u.branchIds.some(id => allowed.includes(String(id)))
}

function assertCanManageTarget(actor, target) {
  if (isAdminActor(actor) || isHqUser(actor)) return true
  if (!target) return false
  if (target.role === 'Admin' || target.role === 'SuperAdmin' || target.isHq) return false
  return userInBranches(target, actorBranchIds(actor))
}

const router = Router()

router.use(authRequired)

// GET /api/users — optional ?branchId=
router.get('/', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 })
    let filtered = req.user?.role === 'SuperAdmin' ? users : users.filter(u => u.role !== 'SuperAdmin')

    const branchId = String(req.query.branchId || req.headers['x-branch-id'] || '').trim()
    const hq = isHqUser(req.user) || isAdminActor(req.user)

    if (branchId) {
      if (!hq) {
        const allowed = actorBranchIds(req.user)
        if (!allowed.includes(branchId)) {
          return res.status(403).json({ error: 'Forbidden for this branch' })
        }
      }
      filtered = filtered.filter(u => {
        // Branch managers should not see HQ admins in their branch list
        if (!hq && (u.role === 'Admin' || u.role === 'SuperAdmin' || u.isHq)) return false
        if (hq && (u.role === 'Admin' || u.role === 'SuperAdmin' || u.isHq)) return true
        if (String(u.homeBranchId || '') === branchId) return true
        return Array.isArray(u.branchIds) && u.branchIds.map(String).includes(branchId)
      })
    } else if (!hq) {
      const allowed = actorBranchIds(req.user)
      filtered = filtered.filter(u => {
        if (u.role === 'Admin' || u.role === 'SuperAdmin' || u.isHq) return false
        return userInBranches(u, allowed)
      })
    }

    res.json(filtered.map(toPublicUser))
  } catch (e) { next(e) }
})

// POST /api/users — Admin or branch manager (branch-scoped)
router.post('/', async (req, res, next) => {
  try {
    const hq = isHqUser(req.user) || isAdminActor(req.user)
    const {
      username,
      password,
      role = 'Cashier',
      staffId = '',
      homeBranchId = '',
      branchIds = [],
      isHq = false,
    } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' })
    if (role === 'SuperAdmin' && req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Only superadmin can create superadmin users' })
    }
    if (role === 'Admin' && !isAdminActor(req.user)) {
      return res.status(403).json({ error: 'Only admin can create admin users' })
    }

    let home = String(homeBranchId || '').trim()
    if (!hq) {
      const allowed = actorBranchIds(req.user)
      if (!allowed.length) return res.status(403).json({ error: 'No branch assigned to your account' })
      if (!home) home = allowed[0]
      if (!allowed.includes(home)) {
        return res.status(403).json({ error: 'You can only create users for your branch' })
      }
    }

    if (role !== 'Admin' && role !== 'SuperAdmin' && !home && !isHq) {
      return res.status(400).json({ error: 'Branch is required for non-admin users' })
    }

    const exists = await User.findOne({ username })
    if (exists) return res.status(409).json({ error: 'Username exists' })
    const grantable = hq ? null : await resolveActorGrantablePaths(req.user)
    const accessPatch = pageAccessUpdates(req.body, { grantable })
    const passwordHash = await bcrypt.hash(password, 10)
    const created = await User.create({
      username,
      passwordHash,
      role,
      staffId,
      homeBranchId: home,
      branchIds: Array.isArray(branchIds) ? branchIds.map(String).filter(Boolean) : [],
      isHq: role === 'Admin' || role === 'SuperAdmin' ? true : !!isHq,
      ...accessPatch,
    })
    try {
      await Audit.create({
        type: 'user',
        userId: req.user?.id || '',
        userName: req.user?.username || 'system',
        action: `Created user ${created.username}`,
        meta: { id: created._id, role: created.role, homeBranchId: created.homeBranchId },
      })
    } catch {}
    res.status(201).json(toPublicUser(created))
  } catch (e) { next(e) }
})

// PATCH /api/users/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const hq = isHqUser(req.user) || isAdminActor(req.user)
    const { username, password, role, staffId, homeBranchId, branchIds, isHq } = req.body || {}
    const target = await User.findById(req.params.id)
    if (!target) return res.status(404).json({ error: 'Not found' })
    if (!assertCanManageTarget(req.user, target)) {
      return res.status(403).json({ error: 'You can only manage users in your branch' })
    }
    if (req.user?.role !== 'SuperAdmin' && (target.role === 'SuperAdmin' || role === 'SuperAdmin')) {
      return res.status(403).json({ error: 'Cannot modify superadmin account' })
    }
    if (role === 'Admin' && !isAdminActor(req.user)) {
      return res.status(403).json({ error: 'Only admin can promote users to admin' })
    }

    const grantable = hq ? null : await resolveActorGrantablePaths(req.user)
    const preservePaths = (!hq && target.useCustomPermissions)
      ? (target.permissions || []).filter(p => p.visible && p.path !== '/my').map(p => String(p.path))
      : []
    const updates = { ...pageAccessUpdates(req.body, { grantable, preservePaths }) }
    if (username !== undefined) updates.username = username
    if (role !== undefined) updates.role = role
    if (staffId !== undefined) updates.staffId = staffId

    if (homeBranchId !== undefined) {
      let home = String(homeBranchId || '')
      if (!hq) {
        const allowed = actorBranchIds(req.user)
        if (home && !allowed.includes(home)) {
          return res.status(403).json({ error: 'You can only assign your branch' })
        }
        if (!home) home = allowed[0] || ''
      }
      updates.homeBranchId = home
    }

    if (branchIds !== undefined) {
      updates.branchIds = Array.isArray(branchIds) ? branchIds.map(String).filter(Boolean) : []
    }
    if (isHq !== undefined && hq) updates.isHq = !!isHq
    if (role === 'Admin' || role === 'SuperAdmin') updates.isHq = true
    if (password) updates.passwordHash = await bcrypt.hash(password, 10)

    const nextRole = role !== undefined ? role : target.role
    const nextHome = updates.homeBranchId !== undefined ? updates.homeBranchId : (target.homeBranchId || '')
    if (nextRole !== 'Admin' && nextRole !== 'SuperAdmin' && !nextHome && !(updates.isHq || target.isHq)) {
      return res.status(400).json({ error: 'Branch is required for non-admin users' })
    }

    const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true })
    if (!updated) return res.status(404).json({ error: 'Not found' })
    try {
      await Audit.create({
        type: 'user',
        userId: req.user?.id || '',
        userName: req.user?.username || 'system',
        action: `Updated user ${updated.username}`,
        meta: { id: updated._id, patch: Object.keys(req.body || {}) },
      })
    } catch {}
    res.json(toPublicUser(updated))
  } catch (e) { next(e) }
})

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id)
    if (!target) return res.status(404).json({ error: 'Not found' })
    if (!assertCanManageTarget(req.user, target)) {
      return res.status(403).json({ error: 'You can only delete users in your branch' })
    }
    if (target?.role === 'SuperAdmin' && req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Cannot delete superadmin account' })
    }
    if ((target.role === 'Admin' || target.isHq) && !isAdminActor(req.user)) {
      return res.status(403).json({ error: 'Only admin can delete admin users' })
    }
    await User.findByIdAndDelete(req.params.id)
    try {
      await Audit.create({
        type: 'user',
        userId: req.user?.id || '',
        userName: req.user?.username || 'system',
        action: `Deleted user ${req.params.id}`,
        meta: { id: req.params.id },
      })
    } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
