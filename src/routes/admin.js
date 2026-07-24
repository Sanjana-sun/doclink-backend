const express = require('express')
const auth = require('../middleware/auth')
const { sendVerificationApprovedEmail } = require('../services/email')
const { checkRegistration } = require('../services/councilVerify')
const { decrypt } = require('../utils/encrypt')
const { createBlock, hashData } = require('../services/blockchain')

const router = express.Router()

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

const adminOnly = async (req, res, next) => {
    try {
        const db = await getPrisma()
        const doctor = await db.doctor.findUnique({
            where: { id: req.doctorId },
            select: { isAdmin: true }
        })
        if (!doctor?.isAdmin) return res.status(403).json({ error: 'Admin access required' })
        next()
    } catch (err) {
        res.status(500).json({ error: 'Server error' })
    }
}

router.get('/stats', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        const [totalDoctors, verifiedDoctors, pendingDoctors, totalCases, totalResponses, recentDoctors] = await Promise.all([
            db.doctor.count(),
            db.doctor.count({ where: { verified: true } }),
            db.doctor.count({ where: { verified: false } }),
            db.case.count(),
            db.response.count(),
            db.doctor.findMany({
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, name: true, email: true, specialty: true, hospital: true, verified: true, verificationStatus: true, country: true, medicalCouncil: true, createdAt: true }
            })
        ])
        res.json({ totalDoctors, verifiedDoctors, pendingDoctors, totalCases, totalResponses, recentDoctors })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/doctors', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        const { filter } = req.query
        const doctors = await db.doctor.findMany({
            where: filter === 'pending' ? { verified: false } : filter === 'verified' ? { verified: true } : {},
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, name: true, email: true, specialty: true,
                hospital: true, verified: true, verificationStatus: true,
                country: true, medicalCouncil: true, isAdmin: true,
                license: true, createdAt: true, reputation: true,
                cmeCredits: true,
                _count: { select: { cases: true, responses: true } }
            }
        })
        res.json(doctors)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Run an automated register check (verification model B) against the doctor's
// country register. Manual review is still the fallback where no API exists.
router.get('/doctors/:id/council-check', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        const doctor = await db.doctor.findUnique({
            where: { id: req.params.id },
            select: { name: true, country: true, license: true }
        })
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
        const result = await checkRegistration({
            country: doctor.country,
            registrationNumber: decrypt(doctor.license),
            name: doctor.name,
        })
        res.json(result)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.put('/doctors/:id/verify', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        // Optional trust tier: 'verified' (document-checked, default) or 'council_verified' (register-confirmed)
        const status = req.body?.status === 'council_verified' ? 'council_verified' : 'verified'
        const exists = await db.doctor.findUnique({ where: { id: req.params.id }, select: { id: true } })
        if (!exists) return res.status(404).json({ error: 'Doctor not found' })
        const full = await db.doctor.update({
            where: { id: req.params.id },
            data: { verified: true, verificationStatus: status },
            select: { id: true, name: true, email: true, specialty: true, hospital: true, verified: true, verificationStatus: true, country: true, medicalCouncil: true }
        })
        // Anchor the portable credential on the tamper-evident chain
        try {
            await createBlock(db, {
                action: 'CREDENTIAL_ISSUED',
                entityType: 'Doctor',
                entityId: full.id,
                doctorId: full.id,
                data: { id: full.id, name: full.name, specialty: full.specialty, country: full.country, council: full.medicalCouncil, status: full.verificationStatus },
            })
        } catch (chainErr) { console.error('Credential anchor failed (non-fatal):', chainErr) }
        await sendVerificationApprovedEmail({ name: full.name, email: full.email })
        res.json(full)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.put('/doctors/:id/reject', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        const exists = await db.doctor.findUnique({ where: { id: req.params.id }, select: { id: true } })
        if (!exists) return res.status(404).json({ error: 'Doctor not found' })
        const doctor = await db.doctor.update({
            where: { id: req.params.id },
            data: { verified: false, verificationStatus: 'rejected' }
        })
        res.json(doctor)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.delete('/doctors/:id', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        if (req.params.id === req.doctorId) return res.status(400).json({ error: 'You cannot delete your own admin account' })
        const exists = await db.doctor.findUnique({ where: { id: req.params.id }, select: { id: true } })
        if (!exists) return res.status(404).json({ error: 'Doctor not found' })
        await db.doctor.delete({ where: { id: req.params.id } })
        res.json({ message: 'Doctor deleted' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/cases', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        const cases = await db.case.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                doctor: { select: { name: true, hospital: true } },
                _count: { select: { responses: true } }
            }
        })
        res.json(cases)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.delete('/cases/:id', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        await db.case.delete({ where: { id: req.params.id } })
        res.json({ message: 'Case deleted' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Behavior logs
router.get('/behavior-logs', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        const logs = await db.behaviorLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 200,
            include: {
                doctor: { select: { name: true, specialty: true, hospital: true } }
            }
        })
        res.json(logs)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Trigger weekly email manually
router.post('/trigger-weekly-email', auth, adminOnly, async (req, res) => {
    try {
        const { sendWeeklyEmails } = require('../jobs/weeklyEmail')
        await sendWeeklyEmails()
        res.json({ message: 'Weekly email job triggered successfully' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to trigger weekly email: ' + err.message })
    }
})

module.exports = router