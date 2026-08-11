import DayClose from '../models/DayClose.js'

// Checks if a given YYYY-MM-DD is closed
export async function isDateClosed(date) {
  if (!date) return false
  const existing = await DayClose.findOne({ date: String(date) }).lean()
  return !!existing
}

// Middleware: block if req.body[dateField] is closed
export function blockIfClosedFromBody(dateField = 'date') {
  return async (req, res, next) => {
    try {
      const date = req.body?.[dateField]
      if (!date) return next()
      if (await isDateClosed(date)) return res.status(409).json({ error: `Date ${date} is closed` })
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
      if (await isDateClosed(doc.date)) return res.status(409).json({ error: `Date ${doc.date} is closed` })
      next()
    } catch (e) { next(e) }
  }
}
