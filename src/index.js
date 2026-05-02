const express = require('express')
const cors = require('cors')
require('dotenv').config()

const authRoutes = require('./routes/auth')
const caseRoutes = require('./routes/cases')
const responseRoutes = require('./routes/responses')
const doctorRoutes = require('./routes/doctors')

const app = express()

app.use(cors({ origin: 'http://localhost:5174' }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/cases', caseRoutes)
app.use('/api/responses', responseRoutes)
app.use('/api/doctors', doctorRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'DocLink API running' }))

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`DocLink API running on port ${PORT}`))