const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { sendOTP, verifyOTP } = require('../middleware/otp')

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
            return res.status(400).json({ error: 'All fields required' })
        }
        const exists = await db.doctor.findUnique({ where: { email } })
        if (exists) return res.status(400).json({ error: 'Email already registered' })
        const hashed = await bcrypt.hash(password, 12)
        await db.doctor.create({ data: { name, email, password: hashed, license, hospital, specialty } })
        const { Resend } = require('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        try {
            await resend.emails.send({ from: 'noreply@doclink.in', to: email, subject: 'Welcome to DocLink', html: `<p>Hi Dr. ${name}, welcome to DocLink. Your account is pending verification.</p>` })
        } catch (emailErr) { console.error('Welcome email error:', emailErr) }
        res.status(201).json({ message: 'Account created. Pending verification.' })
    } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.post('/login', async (req, res) => {
    try {
        const db = await getPrisma()
        const { email, password } = req.body
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
        const doctor = await db.doctor.findUnique({ where: { email } })
        if (!doctor) return res.status(401).json({ error: 'Invalid credentials' })
        const valid = await bcrypt.compare(password, doctor.password)
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
        try {
            await sendOTP(email, doctor.name)
        } catch (otpErr) {
            console.error('OTP send error:', otpErr.message, otpErr)
            return res.status(500).json({ error: 'Failed to send OTP: ' + otpErr.message })
        }
        res.json({ message: 'OTP sent to your email', requiresOTP: true, email })
    } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.post('/verify-otp', async (req, res) => {
    try {
        const db = await getPrisma()
        const { email, otp } = req.body
        if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' })
        const result = verifyOTP(email, otp)
        if (!result.valid) return res.status(401).json({ error: result.reason })
        const doctor = await db.doctor.findUnique({ where: { email } })
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
        const token = jwt.sign(
            { doctorId: doctor.id, verified: doctor.verified, isAdmin: doctor.isAdmin },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )
        res.json({ token, doctor: { id: doctor.id, name: doctor.name, email: doctor.email, specialty: doctor.specialty, hospital: doctor.hospital, verified: doctor.verified, isAdmin: doctor.isAdmin } })
    } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1]
        if (!token) return res.status(401).json({ error: 'No token' })
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        const db = await getPrisma()
        const doctor = await db.doctor.findUnique({
            where: { id: decoded.doctorId },
            select: { id: true, name: true, email: true, specialty: true, hospital: true, verified: true, isAdmin: true, reputation: true, cmeCredits: true }
        })
        if (!doctor) return res.status(404).json({ error: 'Not found' })
        res.json(doctor)
    } catch (err) { res.status(401).json({ error: 'Invalid token' }) }
})

module.exports = router