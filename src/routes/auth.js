const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { sendOTP, verifyOTP } = require('../middleware/otp')
const { encrypt, decrypt } = require('../utils/encrypt')
const behaviorLog = require('../services/behaviorLog')

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
        const { name, email, password, license, hospital, specialty, country, medicalCouncil } = req.body
        if (!name || !email || !password || !license || !hospital || !specialty || !country) {
            return res.status(400).json({ error: 'All fields required' })
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email address' })
        }
        if (String(password).length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' })
        }
        const exists = await db.doctor.findUnique({ where: { email } })
        if (exists) return res.status(400).json({ error: 'Email already registered' })
        const hashed = await bcrypt.hash(password, 12)
        try {
            await db.doctor.create({
                data: {
                    name, email, password: hashed, license: encrypt(license), hospital, specialty,
                    country, medicalCouncil: medicalCouncil || null,
                    verificationStatus: 'provisional',
                }
            })
        } catch (createErr) {
            // Guard the race between the existence check and insert
            if (createErr.code === 'P2002') return res.status(400).json({ error: 'Email already registered' })
            throw createErr
        }
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

        // Log login
        behaviorLog.log(doctor.id, 'LOGIN', null, { email: doctor.email }, req.headers['x-forwarded-for'] || req.ip)

        res.json({
            token,
            doctor: {
                id: doctor.id,
                name: doctor.name,
                email: doctor.email,
                specialty: doctor.specialty,
                hospital: doctor.hospital,
                verified: doctor.verified,
                verificationStatus: doctor.verificationStatus,
                country: doctor.country,
                preferredLanguage: doctor.preferredLanguage,
                isAdmin: doctor.isAdmin,
                license: decrypt(doctor.license),
            }
        })
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
            select: { id: true, name: true, email: true, specialty: true, hospital: true, verified: true, verificationStatus: true, country: true, medicalCouncil: true, preferredLanguage: true, isAdmin: true, reputation: true, cmeCredits: true, bio: true, location: true, subSpecialty: true, yearsExperience: true }
        })
        if (!doctor) return res.status(404).json({ error: 'Not found' })
        res.json(doctor)
    } catch (err) { res.status(401).json({ error: 'Invalid token' }) }
})

router.post('/forgot-password', async (req, res) => {
    try {
        const db = await getPrisma()
        const { email } = req.body
        if (!email) return res.status(400).json({ error: 'Email required' })
        const doctor = await db.doctor.findUnique({ where: { email } })
        if (!doctor) return res.json({ message: 'If that email exists, a reset link has been sent.' })

        const token = require('crypto').randomBytes(32).toString('hex')
        const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

        await db.doctor.update({
            where: { email },
            data: { passwordResetToken: token, passwordResetExpiry: expiry }
        })

        const { Resend } = require('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
            from: 'noreply@doclink.in',
            to: email,
            subject: 'Reset your DocLink password',
            html: `
        <div style="font-family: sans-serif; padding: 2rem; max-width: 480px;">
          <h2 style="font-family: Georgia, serif;">Reset your password</h2>
          <p>Hi Dr. ${doctor.name},</p>
          <p>Click the link below to reset your password. This link expires in 1 hour.</p>
          <a href="https://www.doclink.in/reset-password?token=${token}" style="display: inline-block; background: #0d9488; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 1rem 0;">Reset password →</a>
          <p style="color: #6b7280; font-size: 0.875rem;">If you didn't request this, ignore this email.</p>
        </div>
      `
        })

        res.json({ message: 'If that email exists, a reset link has been sent.' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/reset-password', async (req, res) => {
    try {
        const db = await getPrisma()
        const { token, password } = req.body
        if (!token || !password) return res.status(400).json({ error: 'Token and password required' })
        if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

        const doctor = await db.doctor.findFirst({
            where: {
                passwordResetToken: token,
                passwordResetExpiry: { gt: new Date() }
            }
        })
        if (!doctor) return res.status(400).json({ error: 'Invalid or expired reset link' })

        const hashed = await bcrypt.hash(password, 12)
        await db.doctor.update({
            where: { id: doctor.id },
            data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null }
        })

        res.json({ message: 'Password reset successfully' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router