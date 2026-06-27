import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'Admin' }, // 'Admin' or custom role name
}, { timestamps: true })

export default mongoose.model('User', UserSchema)
