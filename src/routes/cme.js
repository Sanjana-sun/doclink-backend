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

router.get('/me', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const logs = await db.cMELog.findMany({
            where: { doctorId: req.doctorId },
            include: { case: { select: { title: true, tag: true } } },
            orderBy: { createdAt: 'desc' }
        })

        const doctor = await db.doctor.findUnique({
            where: { id: req.doctorId },
            select: { cmeCredits: true, reputation: true }
        })
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' })

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const startOfYear = new Date(now.getFullYear(), 0, 1)

        const thisMonth = logs
            .filter(l => new Date(l.createdAt) >= startOfMonth)
            .reduce((sum, l) => sum + l.points, 0)

        const thisYear = logs
            .filter(l => new Date(l.createdAt) >= startOfYear)
            .reduce((sum, l) => sum + l.points, 0)

        res.json({
            total: doctor.cmeCredits,
            thisMonth: Math.round(thisMonth * 10) / 10,
            thisYear: Math.round(thisYear * 10) / 10,
            reputation: doctor.reputation,
            logs
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router