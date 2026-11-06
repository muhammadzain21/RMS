import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import settingsRouter from './routes/settings.js'
import staffSettingsRouter from './routes/staffSettings.js'
import menuRouter from './routes/menu.js'
import customersRouter from './routes/customers.js'
import staffRouter from './routes/staff.js'
import ridersRouter from './routes/riders.js'
import salesRouter from './routes/sales.js'
import suppliersRouter from './routes/suppliers.js'
import riderCashRouter from './routes/riderCash.js'
import expensesRouter from './routes/expenses.js'
import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import rolesRouter from './routes/roles.js'
import attendanceRouter from './routes/attendance.js'
import auditRouter from './routes/audit.js'
import cashOpeningsRouter from './routes/cashOpenings.js'
import advanceBookingsRouter from './routes/advanceBookings.js'
import returnsRouter from './routes/returns.js'
import backupRouter from './routes/backup.js'
import payInOutsRouter from './routes/payInOuts.js'
import dayClosesRouter from './routes/dayCloses.js'
import cashCountsRouter from './routes/cashCounts.js'
import tablesRouter from './routes/tables.js'
import categoriesRouter from './routes/categories.js'
import ingredientsRouter from './routes/ingredients.js'
import suppliesRouter from './routes/supplies.js'
import demandsRouter from './routes/demands.js'
import staffEarningsRouter from './routes/staffEarnings.js'
import staffAdvancesRouter from './routes/staffAdvances.js'
import staffPurchasesRouter from './routes/staffPurchases.js'
import staffPortalRouter from './routes/staffPortal.js'
import myRouter from './routes/my.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import payrollRouter from './routes/payroll.js'
import kotsRouter from './routes/kots.js'
import voidsRouter from './routes/voids.js'
import recallsRouter from './routes/recalls.js'
import heldsRouter from './routes/helds.js'
import printRouter from './routes/print.js'
import biometricRouter from './biometric/routes/index.js'
import biometricConfigRouter from './routes/biometricConfig.js'
import inventorySnapshotsRouter, { takeSnapshot } from './routes/inventorySnapshots.js'
import dataManagerRouter from './routes/dataManager.js'
import { startBiometricPoller } from './biometric/jobs/poller.js'
import bcrypt from 'bcryptjs'
import User from './models/User.js'

dotenv.config()

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/'
const DB_NAME = process.env.DB_NAME || 'restaurant_pos'
const PORT = process.env.PORT || 5000

const app = express()
// Configure CORS to allow Authorization header so authenticated GETs succeed after preflight
app.use(cors({
  origin: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Delete-Key'],
  credentials: false,
  optionsSuccessStatus: 204,
}))
app.use(express.json({ limit: '5000mb' }))
app.use(morgan('dev'))

// Old staff portal page redirects to the main app — everyone uses the same login page.
// The folder's files (icons, installer downloads, APK) remain reachable.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.get(['/staff', '/staff/', '/staff/index.html'], (_req, res) => res.redirect('/'))
app.use('/staff', express.static(path.join(__dirname, '../public/staff')))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

// Public client config: lets the frontend discover the API base from server env or request host
app.get('/api/client-config', (req, res) => {
  try {
    const explicit = process.env.PUBLIC_API_BASE
    if (explicit) return res.json({ apiBase: String(explicit) })
    const proto = (req.headers['x-forwarded-proto'] || (req.protocol || 'http')).toString()
    const host = (req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`).toString()
    return res.json({ apiBase: `${proto}://${host}` })
  } catch {
    res.json({ apiBase: `http://localhost:${PORT}` })
  }
})

app.use('/api/settings', settingsRouter)
app.use('/api/staff-settings', staffSettingsRouter)
app.use('/api/menu', menuRouter)
app.use('/api/customers', customersRouter)
app.use('/api/staff', staffRouter)
app.use('/api/riders', ridersRouter)
app.use('/api/sales', salesRouter)
app.use('/api/expenses', expensesRouter)
app.use('/api/suppliers', suppliersRouter)
app.use('/api/rider-cash', riderCashRouter)
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/roles', rolesRouter)
app.use('/api/attendance', attendanceRouter)
app.use('/api/audit', auditRouter)
app.use('/api/cash-openings', cashOpeningsRouter)
app.use('/api/advance-bookings', advanceBookingsRouter)
app.use('/api/pay-in-outs', payInOutsRouter)
app.use('/api/day-closes', dayClosesRouter)
app.use('/api/returns', returnsRouter)
app.use('/api/tables', tablesRouter)
app.use('/api/backup', backupRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/ingredients', ingredientsRouter)
app.use('/api/supplies', suppliesRouter)
app.use('/api/demands', demandsRouter)
app.use('/api/cash-counts', cashCountsRouter)
app.use('/api/staff-earnings', staffEarningsRouter)
app.use('/api/staff-advances', staffAdvancesRouter)
app.use('/api/staff-purchases', staffPurchasesRouter)
app.use('/api/staff-portal', staffPortalRouter)
app.use('/api/my', myRouter)
app.use('/api/payroll', payrollRouter)
app.use('/api/kots', kotsRouter)
app.use('/api/voids', voidsRouter)
app.use('/api/recalls', recallsRouter)
app.use('/api/helds', heldsRouter)
app.use('/api/print', printRouter)
app.use('/api/biometric', biometricRouter)
app.use('/api/biometric-config', biometricConfigRouter)
app.use('/api/inventory-snapshots', inventorySnapshotsRouter)
// Serve the built frontend so the POS is reachable in the browser
// (localhost / LAN) while the desktop app is running.
// Packaged Electron: resources/app/dist  |  Dev monorepo: <repo>/dist
const distCandidates = [
  path.join(__dirname, '../../dist'), // server/src → ../../dist (dev) or resources/app/dist (packaged + extraResources)
  process.resourcesPath ? path.join(process.resourcesPath, 'app', 'dist') : null,
  process.resourcesPath ? path.join(process.resourcesPath, 'dist') : null,
].filter(Boolean)
const distDir = distCandidates.find(d => {
  try { return fs.existsSync(path.join(d, 'index.html')) } catch { return false }
}) || distCandidates[0]
console.log('[server] Serving frontend from:', distDir, fs.existsSync(path.join(distDir, 'index.html')) ? '(ok)' : '(MISSING index.html)')
app.use(express.static(distDir))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/staff')) return next()
  // Never SPA-fallback asset-like URLs (prevents blank page: JS served as text/html)
  if (/\.[a-zA-Z0-9]+$/.test(req.path)) return next()
  const indexPath = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    return res.status(404).send(
      'Frontend not found. Rebuild the installer (npm run electron:build) so dist is bundled, or run npm run build in development.'
    )
  }
  res.sendFile(indexPath, (err) => { if (err) next(err) })
})

app.use('/api/data-manager', dataManagerRouter)

async function start() {
  try {
    await mongoose.connect(MONGO_URI, { autoIndex: true, dbName: DB_NAME })
    console.log('MongoDB connected:', MONGO_URI, 'db:', DB_NAME)

    // Seed the hidden SuperAdmin account (owner of the feature-access portal)
    try {
      const saUser = process.env.SUPERADMIN_USERNAME || 'superadmin'
      const saPass = process.env.SUPERADMIN_PASSWORD || 'epicspire@123'
      const existing = await User.findOne({ username: saUser })
      if (!existing) {
        const passwordHash = await bcrypt.hash(saPass, 10)
        await User.create({ username: saUser, passwordHash, role: 'SuperAdmin' })
        console.log('Seeded superadmin account:', saUser)
      }
    } catch (e) { console.error('SuperAdmin seed failed:', e?.message) }

    app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on http://localhost:${PORT}`))

    // Start biometric attendance poller
    await startBiometricPoller()
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

start()
