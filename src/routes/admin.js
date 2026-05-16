const express = require('express')
const auth = require('../middleware/auth')
const { sendVerificationApprovedEmail } = require('../services/email')

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
                select: { id: true, name: true, email: true, specialty: true, hospital: true, verified: true, createdAt: true }
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
                hospital: true, verified: true, isAdmin: true,
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

router.put('/doctors/:id/verify', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        const doctor = await db.doctor.update({
            where: { id: req.params.id },
            data: { verified: true },
            select: { id: true, name: true, email: true, specialty: true, hospital: true, verified: true }
        })
        await sendVerificationApprovedEmail({ name: doctor.name, email: doctor.email })
        res.json(doctor)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.put('/doctors/:id/reject', auth, adminOnly, async (req, res) => {
    try {
        const db = await getPrisma()
        const doctor = await db.doctor.update({
            where: { id: req.params.id },
            data: { verified: false }
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