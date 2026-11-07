import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/'
const DB_NAME = process.env.DB_NAME || 'restaurant'

async function main() {
  const username = process.argv[2] || 'admin'
  const password = process.argv[3] || 'admin123'

  await mongoose.connect(MONGO_URI, { dbName: DB_NAME })
  const passwordHash = await bcrypt.hash(password, 10)

  const existing = await User.findOne({ username })
  if (existing) {
    existing.passwordHash = passwordHash
    existing.role = 'Admin'
    existing.isHq = true
    existing.useCustomPermissions = false
    existing.permissions = []
    await existing.save()
    console.log(JSON.stringify({
      action: 'updated',
      id: String(existing._id),
      username: existing.username,
      role: existing.role,
      password,
    }))
  } else {
    const created = await User.create({
      username,
      passwordHash,
      role: 'Admin',
      isHq: true,
      useCustomPermissions: false,
      permissions: [],
    })
    console.log(JSON.stringify({
      action: 'created',
      id: String(created._id),
      username: created.username,
      role: created.role,
      password,
    }))
  }

  await mongoose.disconnect()
}

main().catch(async (e) => {
  console.error(e?.message || e)
  try { await mongoose.disconnect() } catch {}
  process.exit(1)
})
