const express = require('express')
const cors = require('cors')
require('dotenv').config()

const authRoutes = require('./routes/auth')
const caseRoutes = require('./routes/cases')
const responseRoutes = require('./routes/responses')
const doctorRoutes = require('./routes/doctors')
const cmeRoutes = require('./routes/cme')
const blockchainRoutes = require('./routes/blockchain')
const followRoutes = require('./routes/follow')
const knowledgeRoutes = require('./routes/knowledge')
const { router: notificationRoutes } = require('./routes/notifications')
const adminRoutes = require('./routes/admin')
const leaderboardRoutes = require('./routes/leaderboard')
const videocallRoutes = require('./routes/videocall')
const consultationRoutes = require('./routes/consultations')
const { general, auth, api } = require('./middleware/rateLimiter')
const { helmet, xss, sanitizeInput } = require('./middleware/sanitize')

const app = express()

app.use(cors({
    origin: [
        'http://localhost:5174',
        'https://doclink-frontend-kappa.vercel.app',
        'https://doclink.in',
        'https://www.doclink.in'
    ],
    credentials: true
}))

// Security middleware FIRST — before all routes
app.use(helmet())
app.use(xss())
app.use(sanitizeInput)
app.use(general)
app.use('/api/auth', auth)

app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/cases', caseRoutes)
app.use('/api/responses', responseRoutes)
app.use('/api/doctors', doctorRoutes)
app.use('/api/cme', cmeRoutes)
app.use('/api/blockchain', blockchainRoutes)
app.use('/api/follow', followRoutes)
app.use('/api/knowledge', knowledgeRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/videocall', videocallRoutes)
app.use('/api/consultations', consultationRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'DocLink API running' }))

const PORT = process.env.PORT || 8000
app.listen(PORT, '0.0.0.0', () => console.log(`DocLink API running on port ${PORT}`))