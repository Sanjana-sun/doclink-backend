const express = require('express')
const auth = require('../middleware/auth')

const router = express.Router()
const clients = new Map()

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

// SSE connection endpoint
router.get('/connect', auth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.flushHeaders()

    const doctorId = req.doctorId
    clients.set(doctorId, res)

    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to DocLink notifications' })}\n\n`)

    const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
    }, 30000)

    req.on('close', () => {
        clients.delete(doctorId)
        clearInterval(heartbeat)
    })
})

const sendNotification = (doctorId, notification) => {
    const client = clients.get(doctorId)
    if (client) {
        client.write(`data: ${JSON.stringify(notification)}\n\n`)
    }
}

// Get notifications
router.get('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const notifications = await db.notification.findMany({
            where: { doctorId: req.doctorId },
            orderBy: { createdAt: 'desc' },
            take: 20
        })
        res.json(notifications)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Mark one as read (only your own)
router.put('/:id/read', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        // updateMany scopes to the owner — you can't mark someone else's notification read
        const result = await db.notification.updateMany({
            where: { id: req.params.id, doctorId: req.doctorId },
            data: { read: true }
        })
        if (result.count === 0) return res.status(404).json({ error: 'Notification not found' })
        res.json({ success: true })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Mark all as read
router.put('/read-all', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        await db.notification.updateMany({
            where: { doctorId: req.doctorId, read: false },
            data: { read: true }
        })
        res.json({ success: true })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = { router, sendNotification }