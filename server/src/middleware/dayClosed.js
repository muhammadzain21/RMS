import DayClose from '../models/DayClose.js'
import { resolveBranchId } from '../utils/branchScope.js'

// Checks if a given YYYY-MM-DD is closed (optionally scoped to a branch)
export async function isDateClosed(date, branchId = '') {
  if (!date) return false
  const q = { date: String(date).slice(0, 10) }
  const bid = String(branchId || '').trim()
  if (bid) q.branchId = bid
  const existing = await DayClose.findOne(q).lean()
  return !!existing
}

// Middleware: block if req.body[dateField] is closed for this branch
export function blockIfClosedFromBody(dateField = 'date') {
  return async (req, res, next) => {
    try {
      const date = req.body?.[dateField]
      if (!date) return next()
      const branchId = resolveBranchId(req) || ''
      if (await isDateClosed(date, branchId)) {
        return res.status(409).json({ error: `Date ${String(date).slice(0, 10)} is closed` })
      }
      next()
    } catch (e) { next(e) }
  }
}

// Middleware: block if resource by :id in Model has closed date
export function blockIfClosedFromModel(Model) {
  return async (req, res, next) => {
    try {
      const id = req.params?.id
      if (!id) return next()
      const doc = await Model.findById(id).lean()
      if (!doc || !doc.date) return next()
      const branchId = resolveBranchId(req) || doc.branchId || ''
      if (await isDateClosed(doc.date, branchId)) {
        return res.status(409).json({ error: `Date ${String(doc.date).slice(0, 10)} is closed` })
      }
      next()
    } catch (e) { next(e) }
  }
}
