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
import cashHandoversRouter from './routes/cashHandovers.js'
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
import staffPayNotesRouter from './routes/staffPayNotes.js'
import kotsRouter from './routes/kots.js'
import voidsRouter from './routes/voids.js'
import recallsRouter from './routes/recalls.js'
import heldsRouter from './routes/helds.js'
import printRouter from './routes/print.js'
import biometricRouter from './biometric/routes/index.js'
import biometricConfigRouter from './routes/biometricConfig.js'
import { startBiometricPoller } from './biometric/jobs/poller.js'

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
app.use('/api/cash-handovers', cashHandoversRouter)
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
app.use('/api/staff-pay-notes', staffPayNotesRouter)
app.use('/api/kots', kotsRouter)
app.use('/api/voids', voidsRouter)
app.use('/api/recalls', recallsRouter)
app.use('/api/helds', heldsRouter)
app.use('/api/print', printRouter)
app.use('/api/biometric', biometricRouter)
app.use('/api/biometric-config', biometricConfigRouter)

async function start() {
  try {
    await mongoose.connect(MONGO_URI, { autoIndex: true, dbName: DB_NAME })
    console.log('MongoDB connected:', MONGO_URI, 'db:', DB_NAME)
    app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on http://localhost:${PORT}`))

    // Start biometric attendance poller
    await startBiometricPoller()
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

start()
