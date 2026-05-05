const express = require('express')
const { PrismaClient } = require('@prisma/client')
const auth = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

// Get CME log for logged in doctor
router.get('/me', auth, async (req, res) => {
    try {
        const logs = await prisma.cMELog.findMany({
            where: { doctorId: req.doctorId },
            include: {
                case: { select: { title: true, tag: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        const doctor = await prisma.doctor.findUnique({
            where: { id: req.doctorId },
            select: { cmeCredits: true, reputation: true }
        })

        // Calculate this month's credits
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const thisMonth = logs
            .filter(l => new Date(l.createdAt) >= startOfMonth)
            .reduce((sum, l) => sum + l.points, 0)

        // Calculate this year's credits
        const startOfYear = new Date(now.getFullYear(), 0, 1)
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