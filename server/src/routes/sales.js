import express from 'express'
import Sale from '../models/Sale.js'
import DeletedSale from '../models/DeletedSale.js'
import Ingredient from '../models/Ingredient.js'
import MenuItem from '../models/MenuItem.js'
import Counter from '../models/Counter.js'
import Recall from '../models/Recall.js'
import Settings from '../models/Settings.js'
import { authRequired } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
import { takeSnapshot } from './inventorySnapshots.js'

// Sales routes backed by MongoDB via Mongoose
const router = express.Router()

// All routes require authentication
router.use(authRequired)

// Helper: normalize a JS Date or timestamp to 'yyyy-MM-dd' in LOCAL timezone
// This ensures Pakistan time is used regardless of server location
const toYyyyMmDd = (dLike) => {
  try {
    const d = dLike ? new Date(dLike) : new Date()
    if (isNaN(d.getTime())) {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    }
    // Use local date getters instead of toISOString() (which returns UTC)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
}

// GET /api/sales
// Supports: ?date=YYYY-MM-DD OR ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive)
router.get('/', async (req, res) => {
  try {
    const { date, from, to } = req.query
    let filter = {}
    if (date) {
      filter.date = String(date)
    } else {
      const fromStr = from ? String(from) : '0000-00-00'
      const toStr = to ? String(to) : '9999-12-31'
      filter.date = { $gte: fromStr, $lte: toStr }
    }
    const rows = await Sale.find(filter).sort({ createdAt: -1 }).lean()
    res.json(rows || [])
  } catch (e) {
    res.status(500).json({ error: 'Failed to load sales' })
  }
})

// POST /api/sales
// Creates a sale document. If no date provided, derive from createdAt or now.
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {}
    const key = req.headers['x-idempotency-key']
    if (key) {
      try {
        const existing = await Sale.findOne({ idempotencyKey: key }).lean()
        if (existing) {
          // Even on idempotency hit, attempt to delete matching recall (idempotent operation)
          try {
            const rid = payload.recallId || payload.recall_id || null
            if (rid) {
              await Recall.findByIdAndDelete(rid).catch(()=>{})
            } else {
              const or = []
              if (payload.orderNo) or.push({ orderNo: String(payload.orderNo) })
              if (payload.tokenNo) or.push({ tokenNo: String(payload.tokenNo) })
              if (or.length) await Recall.deleteMany({ $and: [ { date: (payload.date || toYyyyMmDd(payload.createdAt) || toYyyyMmDd()) }, { $or: or } ] }).catch(()=>{})
            }
          } catch {}
          return res.status(200).json(existing)
        }
      } catch {}
    }
    const dateStr = payload.date || toYyyyMmDd(payload.createdAt) || toYyyyMmDd()
    let tokenNo = (payload.tokenNo || '').toString().trim()
    if (!tokenNo) {
      const key = `token-${dateStr}`
      const counter = await Counter.findOneAndUpdate(
        { name: key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      )
      tokenNo = String(counter?.seq || '1')
    }
    const totalComputed = (payload.total != null)
      ? Number(payload.total)
      : Number(
          (payload.totalAmount != null)
            ? payload.totalAmount
            : Math.max(0,
                Number(payload.subtotal || 0)
                - Number(payload.itemsDiscount || 0)
                - Number(payload.billDiscount || 0)
                + Number(payload.taxAmt || 0)
                + Number(payload.serviceAmt || 0)
              )
        )
    const billNo = payload.billNo || `${dateStr}_${tokenNo}`
    const paymentMethod = String(payload.paymentMethod || 'cash').toLowerCase()
    const doc = { ...payload, date: dateStr, tokenNo, billNo, total: totalComputed, paymentMethod, idempotencyKey: key || null }
    const saved = await Sale.create(doc)

    // After saving the sale, decrement inventory based on recipes
    try {
      const items = Array.isArray(payload.items) ? payload.items : []
      const baseItemIds = [...new Set(items.map(it => it.itemId).filter(Boolean))]
      const flavourIdsFromMods = []
      const flavourNamesFromMods = []
      for (const it of items) {
        try {
          const arr = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
          for (const fid of arr) if (fid) flavourIdsFromMods.push(String(fid))
        } catch {}
        try {
          const arrN = Array.isArray(it?.mods?.flavourNames) ? it.mods.flavourNames : []
          for (const nm of arrN) if (nm) flavourNamesFromMods.push(String(nm))
        } catch {}
      }
      const itemIds = [...new Set([...baseItemIds, ...flavourIdsFromMods])]
      const isValidObjectId = (s) => /^(?:[a-fA-F0-9]{24})$/.test(String(s||''))
      const validIds = itemIds.filter(isValidObjectId)
      const menuMap = new Map()
      const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g, ' ')
      const menuByNormName = new Map()
      if (validIds.length) {
        const menuRows = await MenuItem.find({ _id: { $in: validIds } }, { _id: 1, recipe: 1, name: 1 }).lean()
        for (const m of (menuRows||[])) { menuMap.set(String(m._id), m); menuByNormName.set(norm(m.name), m) }
      }
      // Also pre-load by flavour names if provided
      const uniqueNames = [...new Set(flavourNamesFromMods.map(norm).filter(Boolean))]
      if (uniqueNames.length) {
        const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const ors = uniqueNames.map(n => ({ name: new RegExp(`^\\s*${escapeRegExp(n)}\\s*$`, 'i') }))
        const nameRows = await MenuItem.find({ $or: ors }, { _id: 1, recipe: 1, name: 1 }).lean()
        for (const m of (nameRows||[])) { menuMap.set(String(m._id), m); menuByNormName.set(norm(m.name), m) }
      }

      // Aggregate consumption: ingredient name -> total qty to deduct
      const cons = new Map()
      for (const line of items) {
        const qty = Number(line?.qty || 0)
        if (!qty) continue
        const sizeRaw = (line?.mods?.size || line?.size || '').toString().trim().toUpperCase()
        const mapSize = (s) => {
          if (!s) return ''
          if (s==='S' || s.includes('SMALL')) return 'S'
          if (s==='R' || s.includes('REGULAR') || s.includes('MEDIUM')) return 'R'
          if (s==='XL' || s.includes('X-LARGE') || (s.includes('EXTRA') && s.includes('LARGE'))) return 'XL'
          if (s==='L' || s.includes('LARGE')) return 'L'
          return ''
        }
        const key = mapSize(sizeRaw)

        // 1) Apply base item's recipe
        {
          const m = menuMap.get(String(line.itemId))
          const chosen = m?.recipe && typeof m.recipe === 'object' ? m.recipe : null
          for (const [ingName, perUnit] of Object.entries(chosen || {})) {
            const useAmt = Number(perUnit || 0) * qty
            if (!useAmt) continue
            cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
          }
        }

        // 2) If flavours are selected, also apply each flavour's recipe
        {
          const flavours = Array.isArray(line?.mods?.flavours) ? line.mods.flavours : []
          const flavourNames = Array.isArray(line?.mods?.flavourNames) ? line.mods.flavourNames : []
          if (flavours.length) {
            for (const fid of flavours) {
              let fm = menuMap.get(String(fid))
              if (!fm && flavourNames.length) {
                // try to find by name fallback
                for (const nm of flavourNames) {
                  const cand = menuByNormName.get(norm(nm))
                  if (cand) { fm = cand; break }
                }
              }
              if (!fm) continue
              const chosen = fm?.recipe && typeof fm.recipe === 'object' ? fm.recipe : null
              for (const [ingName, perUnit] of Object.entries(chosen || {})) {
                const useAmt = Number(perUnit || 0) * qty
                if (!useAmt) continue
                cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
              }
            }
          }
        }
        // Optional modifier impacts: no-op for now
      }

      if (cons.size) {
        // Build canonical name maps from existing Ingredients
        const ings = await Ingredient.find({}, { name: 1 }).lean()
        const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g, ' ')
        const noSpace = (s) => norm(s).replace(/\s+/g, '')
        const canonByNorm = new Map((ings||[]).map(i => [norm(i.name), i.name]))
        const canonByNoSpace = new Map((ings||[]).map(i => [noSpace(i.name), i.name]))

        // Merge consumption by canonical ingredient name
        const canonCons = new Map()
        for (const [rawName, amt] of cons.entries()) {
          const a = Number(amt || 0)
          if (!(a > 0)) continue
          const n1 = norm(rawName)
          const n2 = noSpace(rawName)
          let key = canonByNorm.get(n1) || canonByNoSpace.get(n2)
          if (!key) {
            // Last resort: find an exact, case-insensitive match using regex when writing
            // Keep the raw normalized name so we can use anchored regex in the write filter
            key = { raw: rawName }
          }
          const mapKey = typeof key === 'string' ? key : JSON.stringify(key)
          canonCons.set(mapKey, Number((canonCons.get(mapKey) || 0) + a))
        }

        // Prepare bulk ops, supporting both direct canonical names and regex fallback
        const ops = []
        for (const [k, amt] of canonCons.entries()) {
          const parsed = (() => { try { return JSON.parse(k) } catch { return null } })()
          if (parsed && parsed.raw) {
            // Use case-insensitive exact match with trimmed spaces
            const escaped = String(parsed.raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const rx = new RegExp(`^\\s*${escaped}\\s*$`, 'i')
            ops.push({ updateOne: { filter: { name: rx }, update: { $inc: { qty: -Number(amt) } } } })
          } else {
            ops.push({ updateOne: { filter: { name: String(k) }, update: { $inc: { qty: -Number(amt) } } } })
          }
        }
        if (ops.length) {
          await Ingredient.bulkWrite(ops, { ordered: false })
        }
      }
    } catch (invErr) {
      // Log and continue; do not fail the sale creation if inventory update fails
      console.warn('[sales] inventory deduction failed:', invErr && invErr.message)
    }

    // Take inventory snapshot after sale (post-deduction stock state)
    takeSnapshot(dateStr, 'sale').catch(()=>{})

    try {
      const rid = payload.recallId || payload.recall_id || null
      if (rid) {
        await Recall.findByIdAndDelete(rid).catch(()=>{})
      } else {
        const or = []
        if (payload.orderNo) or.push({ orderNo: String(payload.orderNo) })
        if (doc.tokenNo) or.push({ tokenNo: String(doc.tokenNo) })
        if (or.length) await Recall.deleteMany({ $and: [ { date: dateStr }, { $or: or } ] }).catch(()=>{})
      }
    } catch {}

    // Log audit for sale creation
    try {
      const itemCount = Array.isArray(payload.items) ? payload.items.length : 0
      const totalDisplay = Number(saved.total || 0).toFixed(2)
      await logAudit(req, 'sale', `Sale created - Bill #${saved.billNo}, Token #${saved.tokenNo}, Items: ${itemCount}, Total: ${totalDisplay}`, { billNo: saved.billNo, tokenNo: saved.tokenNo, total: saved.total, itemCount })
    } catch {}

    res.status(201).json(saved)
  } catch (e) {
    res.status(400).json({ error: 'Failed to create sale' })
  }
})

// GET /api/sales/deleted - List all deleted sales
router.get('/deleted', async (req, res) => {
  try {
    const { date, from, to } = req.query
    let filter = {}
    if (date) {
      filter.date = String(date)
    } else if (from || to) {
      const fromStr = from ? String(from) : '0000-00-00'
      const toStr = to ? String(to) : '9999-12-31'
      filter.date = { $gte: fromStr, $lte: toStr }
    }
    const rows = await DeletedSale.find(filter).sort({ deletedAt: -1 }).lean()
    res.json(rows || [])
  } catch (e) {
    res.status(500).json({ error: 'Failed to load deleted sales' })
  }
})

// DELETE /api/sales/:id
router.delete('/:id', async (req, res) => {
  try {
    const provided = req.headers['x-delete-key'] || req.query.key || (req.body && req.body.key) || ''
    const s = await Settings.findOne({}, {}, { sort: { updatedAt: -1, createdAt: -1 } }).lean()
    const expected = String(s?.salesDeleteKey || '')
    if (!expected) return res.status(403).json({ error: 'Delete key not set. Set it in Settings.' })
    if (String(provided || '') !== expected) return res.status(403).json({ error: 'Invalid delete key' })
    const { id } = req.params
    
    // Find the sale first
    const sale = await Sale.findById(id).lean()
    if (!sale) return res.status(404).json({ error: 'Sale not found' })
    
    // Copy to DeletedSale collection
    const deletedSaleDoc = {
      ...sale,
      originalSaleId: sale._id,
      deletedAt: new Date(),
      deletedDate: toYyyyMmDd(new Date()),
      deletedBy: req.user?.username || 'system',
      userName: req.user?.username || ''
    }
    delete deletedSaleDoc._id
    delete deletedSaleDoc.__v
    await DeletedSale.create(deletedSaleDoc)
    
    // Delete from Sale collection
    await Sale.findByIdAndDelete(id)
    
    // Restore inventory: reverse the recipe consumption that was deducted when the sale was created
    try {
      const items = Array.isArray(sale.items) ? sale.items : []
      const baseItemIds = [...new Set(items.map(it => it.itemId).filter(Boolean))]
      const flavourIdsFromMods = []
      const flavourNamesFromMods = []
      for (const it of items) {
        try {
          const arr = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
          for (const fid of arr) if (fid) flavourIdsFromMods.push(String(fid))
        } catch {}
        try {
          const arrN = Array.isArray(it?.mods?.flavourNames) ? it.mods.flavourNames : []
          for (const nm of arrN) if (nm) flavourNamesFromMods.push(String(nm))
        } catch {}
      }
      const itemIds = [...new Set([...baseItemIds, ...flavourIdsFromMods])]
      const isValidObjectId = (s) => /^(?:[a-fA-F0-9]{24})$/.test(String(s||''))
      const validIds = itemIds.filter(isValidObjectId)
      const menuMap = new Map()
      const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g, ' ')
      const menuByNormName = new Map()
      if (validIds.length) {
        const menuRows = await MenuItem.find({ _id: { $in: validIds } }, { _id: 1, recipe: 1, name: 1 }).lean()
        for (const m of (menuRows||[])) { menuMap.set(String(m._id), m); menuByNormName.set(norm(m.name), m) }
      }
      const uniqueNames = [...new Set(flavourNamesFromMods.map(norm).filter(Boolean))]
      if (uniqueNames.length) {
        const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const ors = uniqueNames.map(n => ({ name: new RegExp(`^\\s*${escapeRegExp(n)}\\s*$`, 'i') }))
        const nameRows = await MenuItem.find({ $or: ors }, { _id: 1, recipe: 1, name: 1 }).lean()
        for (const m of (nameRows||[])) { menuMap.set(String(m._id), m); menuByNormName.set(norm(m.name), m) }
      }

      // Aggregate consumption to restore (same logic as sale creation, but we'll ADD back)
      const cons = new Map()
      for (const line of items) {
        const qty = Number(line?.qty || 0)
        if (!qty) continue
        // 1) Base item's recipe
        {
          const m = menuMap.get(String(line.itemId))
          const chosen = m?.recipe && typeof m.recipe === 'object' ? m.recipe : null
          for (const [ingName, perUnit] of Object.entries(chosen || {})) {
            const useAmt = Number(perUnit || 0) * qty
            if (!useAmt) continue
            cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
          }
        }
        // 2) Flavour recipes
        {
          const flavours = Array.isArray(line?.mods?.flavours) ? line.mods.flavours : []
          const flavourNames = Array.isArray(line?.mods?.flavourNames) ? line.mods.flavourNames : []
          if (flavours.length) {
            for (const fid of flavours) {
              let fm = menuMap.get(String(fid))
              if (!fm && flavourNames.length) {
                for (const nm of flavourNames) {
                  const cand = menuByNormName.get(norm(nm))
                  if (cand) { fm = cand; break }
                }
              }
              if (!fm) continue
              const chosen = fm?.recipe && typeof fm.recipe === 'object' ? fm.recipe : null
              for (const [ingName, perUnit] of Object.entries(chosen || {})) {
                const useAmt = Number(perUnit || 0) * qty
                if (!useAmt) continue
                cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
              }
            }
          }
        }
      }

      if (cons.size) {
        const ings = await Ingredient.find({}, { name: 1 }).lean()
        const norm2 = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g, ' ')
        const noSpace = (s) => norm2(s).replace(/\s+/g, '')
        const canonByNorm = new Map((ings||[]).map(i => [norm2(i.name), i.name]))
        const canonByNoSpace = new Map((ings||[]).map(i => [noSpace(i.name), i.name]))

        const canonCons = new Map()
        for (const [rawName, amt] of cons.entries()) {
          const a = Number(amt || 0)
          if (!(a > 0)) continue
          const n1 = norm2(rawName)
          const n2 = noSpace(rawName)
          let key = canonByNorm.get(n1) || canonByNoSpace.get(n2)
          if (!key) {
            key = { raw: rawName }
          }
          const mapKey = typeof key === 'string' ? key : JSON.stringify(key)
          canonCons.set(mapKey, Number((canonCons.get(mapKey) || 0) + a))
        }

        // Build bulk ops to ADD back the consumed quantities (reverse of sale creation)
        const ops = []
        for (const [k, amt] of canonCons.entries()) {
          const parsed = (() => { try { return JSON.parse(k) } catch { return null } })()
          if (parsed && parsed.raw) {
            const escaped = String(parsed.raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const rx = new RegExp(`^\\s*${escaped}\\s*$`, 'i')
            ops.push({ updateOne: { filter: { name: rx }, update: { $inc: { qty: Number(amt) } } } })
          } else {
            ops.push({ updateOne: { filter: { name: String(k) }, update: { $inc: { qty: Number(amt) } } } })
          }
        }
        if (ops.length) {
          await Ingredient.bulkWrite(ops, { ordered: false })
        }
      }

      // Take a fresh snapshot after restoring inventory
      takeSnapshot(sale.date || toYyyyMmDd(new Date()), 'sale-delete').catch(()=>{})
    } catch (invErr) {
      console.warn('[sales] inventory restore on delete failed:', invErr && invErr.message)
    }
    
    // Log audit for sale deletion
    try {
      await logAudit(req, 'deleted_sale', `Sale deleted - Bill #${sale.billNo}, Token #${sale.tokenNo}`, { billNo: sale.billNo, tokenNo: sale.tokenNo, total: sale.total })
    } catch {}
    
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: 'Failed to delete sale' })
  }
})

export default router
