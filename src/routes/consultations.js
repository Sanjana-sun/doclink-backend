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

// Get my consultations
router.get('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const consultations = await db.consultation.findMany({
            where: {
                OR: [
                    { doctorId: req.doctorId },
                    { specialistId: req.doctorId }
                ]
            },
            include: {
                doctor: { select: { id: true, name: true, specialty: true, hospital: true } },
                specialist: { select: { id: true, name: true, specialty: true, hospital: true } }
            },
            orderBy: { createdAt: 'desc' }
        })
        res.json(consultations)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Request a consultation
router.post('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { specialistId, topic, scheduledAt } = req.body
        if (!specialistId || !topic) return res.status(400).json({ error: 'Specialist and topic required' })

        const consultation = await db.consultation.create({
            data: {
                topic,
                doctorId: req.doctorId,
                specialistId,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                status: 'pending'
            },
            include: {
                doctor: { select: { id: true, name: true, specialty: true, hospital: true } },
                specialist: { select: { id: true, name: true, specialty: true, hospital: true } }
            }
        })
        res.status(201).json(consultation)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Update consultation status
router.put('/:id/status', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { status, notes } = req.body
        const consultation = await db.consultation.update({
            where: { id: req.params.id },
            data: { status, ...(notes && { notes }) }
        })
        res.json(consultation)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router