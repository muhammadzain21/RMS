import { z } from 'zod'
import { BiometricMapping } from '../models/BiometricMapping.js'

const upsertSchema = z.object({
  deviceId: z.string().min(1),
  enrollId: z.string().min(1),
  staffId: z.string().min(1),
  active: z.boolean().optional(),
})

export async function list(req, res) {
  const deviceId = String(req.query.deviceId || '')
  const enrollId = String(req.query.enrollId || '')
  const staffId = String(req.query.staffId || '')
  const filter = {}
  if (deviceId) filter.deviceId = deviceId
  if (enrollId) filter.enrollId = enrollId
  if (staffId) filter.staffId = staffId
  const items = await BiometricMapping.find(filter).sort({ deviceId: 1, enrollId: 1 }).lean()
  res.json({ items })
}

export async function upsert(req, res) {
  const data = upsertSchema.parse(req.body)
  const key = { deviceId: data.deviceId, enrollId: data.enrollId }
  const patch = { staffId: data.staffId }
  if (typeof data.active === 'boolean') patch.active = data.active
  const doc = await BiometricMapping.findOneAndUpdate(key, { $set: patch }, { new: true, upsert: true })
  res.json(doc)
}

export async function remove(req, res) {
  const { id } = req.params
  await BiometricMapping.findByIdAndDelete(id)
  res.json({ ok: true })
}
