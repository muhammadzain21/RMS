import dotenv from 'dotenv'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import path from 'path'
import { fileURLToPath } from 'url'
import User from '../models/User.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

function getArg(key) {
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === `--${key}`) return args[i + 1] || null
    if (a.startsWith(`--${key}=`)) return a.split('=')[1]
  }
  return null
}

async function main() {
  const name = getArg('name') || 'Admin'
  const username = getArg('username') || 'admin'
  const password = getArg('password') || '123'
  const role = getArg('role') || 'Admin'
  const force = process.argv.includes('--force') || getArg('force') === 'true'
  const update = process.argv.includes('--update') || getArg('update') === 'true'
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/'
  const DB_NAME = process.env.DB_NAME || 'restaurant_pos'

  await mongoose.connect(MONGO_URI, { autoIndex: true, dbName: DB_NAME })

  const count = await User.countDocuments()
  if (count > 0 && !force) {
    console.log('Users already exist')
    process.exit(2)
  }

  const exists = await User.findOne({ username })
  if (exists) {
    if (update) {
      const updates = {}
      if (name !== null) updates.name = name
      if (role !== null) updates.role = role
      if (password) updates.passwordHash = await bcrypt.hash(password, 10)
      await User.updateOne({ _id: exists._id }, { $set: updates })
      const refreshed = await User.findById(exists._id)
      console.log(JSON.stringify({ id: refreshed._id.toString(), username: refreshed.username, role: refreshed.role }, null, 2))
      await mongoose.disconnect()
      return
    }
    console.log('Username exists')
    process.exit(3)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const created = await User.create({ name, username, passwordHash, role })
  console.log(JSON.stringify({ id: created._id.toString(), username: created.username, role: created.role }, null, 2))

  await mongoose.disconnect()
}

main().catch(async (e) => {
  console.error(e?.message || e)
  try { await mongoose.disconnect() } catch {}
  process.exit(1)
})
