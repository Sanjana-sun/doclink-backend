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

// Store doctor's public key
router.post('/me/publickey', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { publicKey } = req.body
        if (!publicKey) return res.status(400).json({ error: 'Public key required' })
        await db.doctor.update({
            where: { id: req.doctorId },
            data: { publicKey }
        })
        res.json({ message: 'Public key stored' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get a doctor's public key
router.get('/:id/publickey', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const doctor = await db.doctor.findUnique({
            where: { id: req.params.id },
            select: { publicKey: true }
        })
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
        res.json({ publicKey: doctor.publicKey })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Search doctors (also powers the on-call directory)
router.get('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { search, specialty, available } = req.query
        const doctors = await db.doctor.findMany({
            where: {
                ...(search && { name: { contains: search, mode: 'insensitive' } }),
                ...(specialty && { specialty }),
                ...(available === '1' && { availability: 'available' }),
            },
            select: {
                id: true, name: true, specialty: true, hospital: true, country: true,
                reputation: true, cmeCredits: true, availability: true, availabilityUpdatedAt: true,
                _count: { select: { cases: true, responses: true, followers: true } }
            },
            orderBy: available === '1' ? { availabilityUpdatedAt: 'desc' } : { reputation: 'desc' },
            take: available === '1' ? 50 : 20
        })
        res.json(doctors)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Set my on-call availability
router.put('/me/availability', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { availability } = req.body
        if (!['available', 'busy', 'offline'].includes(availability)) {
            return res.status(400).json({ error: 'Invalid availability' })
        }
        await db.doctor.update({
            where: { id: req.doctorId },
            data: { availability, availabilityUpdatedAt: new Date() }
        })
        res.json({ availability })
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
        const { name, hospital, specialty, bio, location, subSpecialty, yearsExperience } = req.body
        // Only set fields that were provided (undefined = leave unchanged)
        const data = {}
        if (name !== undefined) data.name = name
        if (hospital !== undefined) data.hospital = hospital
        if (specialty !== undefined) data.specialty = specialty
        if (bio !== undefined) data.bio = bio
        if (location !== undefined) data.location = location
        if (subSpecialty !== undefined) data.subSpecialty = subSpecialty
        if (yearsExperience !== undefined) {
            const n = parseInt(yearsExperience)
            data.yearsExperience = Number.isNaN(n) ? null : n
        }
        const doctor = await db.doctor.update({
            where: { id: req.doctorId },
            data,
            select: {
                id: true, name: true, email: true, specialty: true, hospital: true,
                bio: true, location: true, subSpecialty: true, yearsExperience: true,
                country: true, verified: true, verificationStatus: true, isAdmin: true,
                reputation: true, cmeCredits: true
            }
        })
        res.json(doctor)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Persist the doctor's preferred UI language
router.put('/me/language', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { language } = req.body
        if (!['en', 'es', 'hi', 'fr'].includes(language)) {
            return res.status(400).json({ error: 'Unsupported language' })
        }
        await db.doctor.update({
            where: { id: req.doctorId },
            data: { preferredLanguage: language }
        })
        res.json({ preferredLanguage: language })
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
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
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