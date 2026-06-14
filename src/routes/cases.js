const express = require('express')
const auth = require('../middleware/auth')
const { createBlock } = require('../services/blockchain')

const router = express.Router()

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

// Edit a case
router.put('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { title, question, urgency } = req.body
        const caseData = await db.case.findUnique({ where: { id: req.params.id } })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        if (caseData.doctorId !== req.doctorId) return res.status(403).json({ error: 'Unauthorized' })
        const updated = await db.case.update({
            where: { id: req.params.id },
            data: { title, question, urgency }
        })
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Delete a case
router.delete('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const caseData = await db.case.findUnique({ where: { id: req.params.id } })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        if (caseData.doctorId !== req.doctorId) return res.status(403).json({ error: 'Unauthorized' })
        await db.case.delete({ where: { id: req.params.id } })
        res.json({ message: 'Case deleted' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Store encrypted case key
router.post('/:id/key', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { encryptedKey } = req.body
        if (!encryptedKey) return res.status(400).json({ error: 'encryptedKey required' })
        const caseData = await db.case.findUnique({
            where: { id: req.params.id },
            select: { doctorId: true, tag: true }
        })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        if (caseData.doctorId !== req.doctorId) return res.status(403).json({ error: 'Unauthorized' })
        await db.caseKey.upsert({
            where: { caseId_doctorId: { caseId: req.params.id, doctorId: req.doctorId } },
            update: { encryptedKey },
            create: { caseId: req.params.id, doctorId: req.doctorId, encryptedKey }
        })
        res.json({ message: 'Key stored' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get case key
router.get('/:id/key', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const caseData = await db.case.findUnique({
            where: { id: req.params.id },
            select: { doctorId: true, tag: true }
        })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        const doctor = await db.doctor.findUnique({
            where: { id: req.doctorId },
            select: { verified: true, specialty: true, publicKey: true }
        })
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
        if (!doctor.verified) return res.status(403).json({ error: 'Account not verified' })

        await db.blockchainLog.create({
            data: {
                action: 'CASE_KEY_REQUEST',
                entityType: 'Case',
                entityId: req.params.id,
                doctorId: req.doctorId,
                dataHash: `${req.doctorId}-${req.params.id}-${Date.now()}`,
                previousHash: req.headers['x-forwarded-for'] || 'unknown',
                blockHash: require('crypto').createHash('sha256')
                    .update(`${req.doctorId}${req.params.id}${Date.now()}`)
                    .digest('hex')
            }
        })

        let caseKey = await db.caseKey.findUnique({
            where: { caseId_doctorId: { caseId: req.params.id, doctorId: req.doctorId } }
        })
        if (caseKey) return res.json({ encryptedKey: caseKey.encryptedKey })
        if (doctor.specialty !== caseData.tag && caseData.doctorId !== req.doctorId) {
            return res.status(403).json({ error: 'You need to be in the same specialty to access this case' })
        }
        return res.status(404).json({ error: 'No key available — request access from case author' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get all cases
router.get('/', async (req, res) => {
    try {
        const db = await getPrisma()
        const { tag, search } = req.query
        const cases = await db.case.findMany({
            where: {
                isHoneypot: false, // Never show honeypot cases in feeds
                ...(tag && { tag }),
                ...(search && { title: { contains: search, mode: 'insensitive' } })
            },
            include: {
                doctor: { select: { name: true, hospital: true, specialty: true } },
                _count: { select: { responses: true } }
            },
            orderBy: { createdAt: 'desc' }
        })
        res.json(cases)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get single case — detects honeypot access
router.get('/:id', async (req, res) => {
    try {
        const db = await getPrisma()
        const caseData = await db.case.findUnique({
            where: { id: req.params.id },
            include: {
                doctor: { select: { name: true, hospital: true, specialty: true, id: true } },
                responses: {
                    include: { doctor: { select: { name: true, hospital: true, specialty: true, reputation: true, id: true } } },
                    orderBy: { helpful: 'desc' }
                }
            }
        })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })

        // Increment views
        await db.case.update({ where: { id: req.params.id }, data: { views: { increment: 1 } } })

        // Detect honeypot access
        if (caseData.isHoneypot) {
            // Get the requesting doctor from token if available
            const token = req.headers.authorization?.split(' ')[1]
            if (token) {
                try {
                    const jwt = require('jsonwebtoken')
                    const decoded = jwt.verify(token, process.env.JWT_SECRET)
                    const accessingDoctorId = decoded.doctorId

                    if (accessingDoctorId !== caseData.doctorId) {
                        console.warn(`🚨 HONEYPOT ACCESS: Doctor ${accessingDoctorId} accessed honeypot case ${req.params.id}`)

                        // Log to blockchain
                        await db.blockchainLog.create({
                            data: {
                                action: 'HONEYPOT_ACCESS',
                                entityType: 'Case',
                                entityId: req.params.id,
                                doctorId: accessingDoctorId,
                                dataHash: `HONEYPOT-${accessingDoctorId}-${Date.now()}`,
                                previousHash: req.headers['x-forwarded-for'] || req.ip || 'unknown',
                                blockHash: require('crypto').createHash('sha256')
                                    .update(`HONEYPOT${accessingDoctorId}${req.params.id}${Date.now()}`)
                                    .digest('hex')
                            }
                        })

                        // Send alert email to admin
                        try {
                            const { Resend } = require('resend')
                            const resend = new Resend(process.env.RESEND_API_KEY)
                            const accessingDoctor = await db.doctor.findUnique({
                                where: { id: accessingDoctorId },
                                select: { name: true, email: true, specialty: true, hospital: true }
                            })
                            await resend.emails.send({
                                from: 'noreply@doclink.in',
                                to: 'sanjanainjamuri13@gmail.com',
                                subject: '🚨 HONEYPOT ACCESS DETECTED — DocLink Security Alert',
                                html: `
                  <div style="font-family: sans-serif; padding: 2rem; max-width: 560px;">
                    <h2 style="color: #ef4444; margin-bottom: 1rem;">Honeypot Access Alert</h2>
                    <p style="color: #6b6b62; margin-bottom: 1.5rem;">A doctor has accessed a honeypot case. This may indicate malicious intent.</p>
                    <table style="border-collapse: collapse; width: 100%; margin-bottom: 1.5rem;">
                      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Doctor</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${accessingDoctor?.name}</td></tr>
                      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Email</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${accessingDoctor?.email}</td></tr>
                      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Specialty</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${accessingDoctor?.specialty}</td></tr>
                      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Hospital</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${accessingDoctor?.hospital}</td></tr>
                      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Case ID</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${req.params.id}</td></tr>
                      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Case Title</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${caseData.title}</td></tr>
                      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>IP Address</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${req.headers['x-forwarded-for'] || req.ip || 'unknown'}</td></tr>
                      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Time</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td></tr>
                    </table>
                    <a href="https://www.doclink.in/admin" style="display: inline-block; background: #ef4444; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 500;">Review in Admin Panel →</a>
                  </div>
                `
                            })
                        } catch (emailErr) {
                            console.error('Failed to send honeypot alert email:', emailErr)
                        }
                    }
                } catch (jwtErr) {
                    // Invalid token — still return the case
                }
            }
        }

        res.json(caseData)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Post a case
router.post('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { title, tag, urgency, age, sex, history, examination, investigations, question } = req.body
        if (!title || !tag || !urgency || !age || !sex || !history || !question) {
            return res.status(400).json({ error: 'Required fields missing' })
        }
        const newCase = await db.case.create({
            data: { title, tag, urgency, age: parseInt(age), sex, history, examination, investigations, question, doctorId: req.doctorId }
        })

        await db.cMELog.create({
            data: { action: 'Posted a case', points: 1.0, doctorId: req.doctorId, caseId: newCase.id }
        })

        await db.doctor.update({
            where: { id: req.doctorId },
            data: { cmeCredits: { increment: 1.0 }, reputation: { increment: 5 } }
        })

        await createBlock(db, {
            action: 'CASE_POSTED',
            entityType: 'Case',
            entityId: newCase.id,
            doctorId: req.doctorId,
            data: { title, tag, urgency, age, sex, question }
        })

        res.status(201).json(newCase)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router