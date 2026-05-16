const express = require('express')
const auth = require('../middleware/auth')

const router = express.Router()

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

// Search doctors
router.get('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { search, specialty } = req.query
        const doctors = await db.doctor.findMany({
            where: {
                ...(search && { name: { contains: search, mode: 'insensitive' } }),
                ...(specialty && { specialty })
            },
            select: {
                id: true, name: true, specialty: true, hospital: true,
                reputation: true, cmeCredits: true,
                _count: { select: { cases: true, responses: true, followers: true } }
            },
            orderBy: { reputation: 'desc' },
            take: 20
        })
        res.json(doctors)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get my cases
router.get('/me/cases', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const cases = await db.case.findMany({
            where: { doctorId: req.doctorId },
            include: { _count: { select: { responses: true } } },
            orderBy: { createdAt: 'desc' }
        })
        res.json(cases)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Update my profile
router.put('/me', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { name, hospital, specialty } = req.body
        const doctor = await db.doctor.update({
            where: { id: req.doctorId },
            data: { name, hospital, specialty },
            select: {
                id: true, name: true, email: true, specialty: true,
                hospital: true, reputation: true, cmeCredits: true
            }
        })
        res.json(doctor)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get any doctor's public profile
router.get('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const doctor = await db.doctor.findUnique({
            where: { id: req.params.id },
            select: {
                id: true, name: true, specialty: true, hospital: true,
                reputation: true, cmeCredits: true, createdAt: true,
                _count: {
                    select: {
                        cases: true,
                        responses: true,
                        followers: true,
                        following: true
                    }
                }
            }
        })
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
        res.json(doctor)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/me/stats', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const doctor = await db.doctor.findUnique({
            where: { id: req.doctorId },
            select: {
                reputation: true,
                cmeCredits: true,
                _count: { select: { cases: true, responses: true } }
            }
        })
        res.json({
            reputation: doctor.reputation,
            cmeCredits: doctor.cmeCredits,
            casesPosted: doctor._count.cases,
            responsesGiven: doctor._count.responses,
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router