const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { sendWelcomeEmail } = require('../services/email')

const router = express.Router()

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

router.post('/register', async (req, res) => {
    try {
        const db = await getPrisma()
        const { name, email, password, license, hospital, specialty } = req.body

        if (!name || !email || !password || !license || !hospital || !specialty) {
            return res.status(400).json({ error: 'All fields are required' })
        }

        const existing = await db.doctor.findUnique({ where: { email } })
        if (existing) return res.status(400).json({ error: 'Email already registered' })

        const existingLicense = await db.doctor.findUnique({ where: { license } })
        if (existingLicense) return res.status(400).json({ error: 'License number already registered' })

        const hashed = await bcrypt.hash(password, 10)
        const doctor = await db.doctor.create({
            data: { name, email, password: hashed, license, hospital, specialty }
        })

        const token = jwt.sign(
            { id: doctor.id, verified: doctor.verified },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        // Send welcome email
        await sendWelcomeEmail({ name: doctor.name, email: doctor.email })

        res.status(201).json({
            token,
            doctor: {
                id: doctor.id,
                name: doctor.name,
                email: doctor.email,
                specialty: doctor.specialty,
                hospital: doctor.hospital,
                verified: doctor.verified
            }
        })
    } catch (err) {
        console.error(err)
        if (err.code === 'P2002') return res.status(400).json({ error: 'License number already registered' })
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/login', async (req, res) => {
    try {
        const db = await getPrisma()
        const { email, password } = req.body
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

        const doctor = await db.doctor.findUnique({ where: { email } })
        if (!doctor) return res.status(400).json({ error: 'Invalid credentials' })

        const match = await bcrypt.compare(password, doctor.password)
        if (!match) return res.status(400).json({ error: 'Invalid credentials' })

        const token = jwt.sign(
            { id: doctor.id, verified: doctor.verified },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.json({
            token,
            doctor: {
                id: doctor.id,
                name: doctor.name,
                email: doctor.email,
                specialty: doctor.specialty,
                hospital: doctor.hospital,
                verified: doctor.verified
            }
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/me', async (req, res) => {
    try {
        const db = await getPrisma()
        const token = req.headers.authorization?.split(' ')[1]
        if (!token) return res.status(401).json({ error: 'No token' })
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        const doctor = await db.doctor.findUnique({
            where: { id: decoded.id },
            select: {
                id: true, name: true, email: true, specialty: true,
                hospital: true, verified: true, reputation: true, cmeCredits: true
            }
        })
        res.json(doctor)
    } catch (err) {
        console.error(err)
        res.status(401).json({ error: 'Invalid token' })
    }
})

module.exports = router