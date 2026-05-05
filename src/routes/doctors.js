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

router.put('/me', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { name, hospital, specialty } = req.body
        const doctor = await db.doctor.update({
            where: { id: req.doctorId },
            data: { name, hospital, specialty },
            select: { id: true, name: true, email: true, specialty: true, hospital: true, reputation: true, cmeCredits: true }
        })
        res.json(doctor)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router