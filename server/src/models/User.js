import mongoose from 'mongoose'

const SidebarPermissionSchema = new mongoose.Schema({
  path: { type: String, required: true },
  label: { type: String, required: true },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  section: { type: String, default: '' }
}, { _id: false })

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'Admin' }, // 'Admin' or custom role name
  staffId: { type: String, default: '' }, // linked Staff record for staff-role logins
  // When true, `permissions` override the role's permissions entirely
  useCustomPermissions: { type: Boolean, default: false },
  permissions: { type: [SidebarPermissionSchema], default: [] },
}, { timestamps: true })

export default mongoose.model('User', UserSchema)
