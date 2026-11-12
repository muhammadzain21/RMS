import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'

export function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

/** Attach req.user when a valid Bearer token is present; never 401. */
export function authOptional(req, _res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return next()
  try {
    req.user = jwt.verify(token, JWT_SECRET)
  } catch {
    /* ignore invalid token — caller may still allow unauthenticated reads */
  }
  return next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    // If no specific roles required, or user is Admin, or user's role is in allowed roles -> allow
    if (!roles.length || req.user.role === 'Admin' || req.user.role === 'SuperAdmin' || roles.includes(req.user.role)) return next()
    // For custom roles (not in the roles list), allow access - sidebar permissions will handle it
    return next()
  }
}

export function signToken(user) {
  const payload = {
    id: user._id?.toString?.() || user.id,
    username: user.username,
    role: user.role,
    staffId: user.staffId ? String(user.staffId) : '',
    homeBranchId: user.homeBranchId || '',
    branchIds: Array.isArray(user.branchIds) ? user.branchIds : [],
    isHq: !!(user.isHq || user.role === 'Admin' || user.role === 'SuperAdmin'),
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}
