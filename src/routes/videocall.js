const express = require('express')
const auth = require('../middleware/auth')
const { randomBytes } = require('crypto')

const router = express.Router()

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

router.post('/create/:consultationId', auth, async (req, res) => {
    try {
        const db = await getPrisma()

        const consultation = await db.consultation.findUnique({
            where: { id: req.params.consultationId },
            select: { id: true, doctorId: true, specialistId: true, roomName: true }
        })

        if (!consultation) return res.status(404).json({ error: 'Consultation not found' })

        if (consultation.doctorId !== req.doctorId && consultation.specialistId !== req.doctorId) {
            return res.status(403).json({ error: 'You are not part of this consultation' })
        }

        let roomName = consultation.roomName
        if (!roomName) {
            roomName = `dl-${randomBytes(8).toString('hex')}`
            await db.consultation.update({
                where: { id: req.params.consultationId },
                data: { roomName }
            })
        }

        res.json({ roomName, url: `https://meet.jit.si/${roomName}` })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/:consultationId', auth, async (req, res) => {
    try {
        const db = await getPrisma()

        const consultation = await db.consultation.findUnique({
            where: { id: req.params.consultationId },
            select: { id: true, doctorId: true, specialistId: true, roomName: true }
        })

        if (!consultation) return res.status(404).json({ error: 'Consultation not found' })

        if (consultation.doctorId !== req.doctorId && consultation.specialistId !== req.doctorId) {
            return res.status(403).json({ error: 'You are not part of this consultation' })
        }

        if (!consultation.roomName) return res.status(404).json({ error: 'No room created yet' })

        res.json({ roomName: consultation.roomName, url: `https://meet.jit.si/${consultation.roomName}` })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router