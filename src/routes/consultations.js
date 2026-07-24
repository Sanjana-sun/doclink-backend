const express = require('express')
const auth = require('../middleware/auth')
const { sendNotification } = require('./notifications')

const router = express.Router()

const ALLOWED_STATUS = ['pending', 'scheduled', 'active', 'accepted', 'declined', 'completed', 'cancelled']

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
        if (specialistId === req.doctorId) return res.status(400).json({ error: 'You cannot request a consultation with yourself' })

        const specialist = await db.doctor.findUnique({ where: { id: specialistId }, select: { id: true } })
        if (!specialist) return res.status(404).json({ error: 'Specialist not found' })

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

        // Notify the specialist of the incoming request
        const notification = await db.notification.create({
            data: { type: 'consultation', message: `${consultation.doctor.name} requested a consultation: "${topic.slice(0, 50)}"`, doctorId: specialistId }
        })
        sendNotification(specialistId, { type: 'consultation', message: notification.message, id: notification.id })

        res.status(201).json(consultation)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Update consultation status (participants only)
router.put('/:id/status', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { status, notes } = req.body
        if (status && !ALLOWED_STATUS.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' })
        }
        const existing = await db.consultation.findUnique({
            where: { id: req.params.id },
            select: { doctorId: true, specialistId: true }
        })
        if (!existing) return res.status(404).json({ error: 'Consultation not found' })
        if (existing.doctorId !== req.doctorId && existing.specialistId !== req.doctorId) {
            return res.status(403).json({ error: 'You are not part of this consultation' })
        }
        const consultation = await db.consultation.update({
            where: { id: req.params.id },
            data: { ...(status && { status }), ...(notes !== undefined && { notes }) }
        })
        res.json(consultation)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router