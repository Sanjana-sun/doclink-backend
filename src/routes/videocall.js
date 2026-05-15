const express = require('express')
const auth = require('../middleware/auth')
const { randomBytes } = require('crypto')
const { generateToken } = require('../services/agoraToken')

const router = express.Router()

const APP_ID = process.env.AGORA_APP_ID
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

const generateAgoraToken = (channelName, uid) => {
    const expirationTime = Math.floor(Date.now() / 1000) + 3600
    return generateToken(APP_ID, APP_CERTIFICATE, channelName, uid, expirationTime)
}

// Create or get room + generate secure token
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

        // Create room if doesn't exist
        let roomName = consultation.roomName
        if (!roomName) {
            roomName = `dl-${randomBytes(8).toString('hex')}`
            await db.consultation.update({
                where: { id: req.params.consultationId },
                data: { roomName }
            })
        }

        const uid = Math.floor(Math.random() * 100000)
        const token = generateAgoraToken(roomName, uid)

        res.json({
            appId: APP_ID,
            channel: roomName,
            token,
            uid
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get room token
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

        const uid = Math.floor(Math.random() * 100000)
        const token = generateAgoraToken(consultation.roomName, uid)

        res.json({
            appId: APP_ID,
            channel: consultation.roomName,
            token,
            uid
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router