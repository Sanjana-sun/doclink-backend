const express = require('express')
const auth = require('../middleware/auth')
const { randomBytes } = require('crypto')
const { sendNotification } = require('./notifications')
const behaviorLog = require('../services/behaviorLog')

const router = express.Router()

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

const roomUrl = (name) => `https://meet.jit.si/${name}`
const withUrl = (b) => ({ ...b, url: roomUrl(b.roomName) })

// Create a multi-doctor board (tumor board / MDT / second opinion).
router.post('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { topic, caseId, participantIds, scheduledAt } = req.body
        if (!topic) return res.status(400).json({ error: 'Topic required' })

        const board = await db.board.create({
            data: {
                topic,
                caseId: caseId || null,
                createdById: req.doctorId,
                roomName: `dlb-${randomBytes(8).toString('hex')}`,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                participants: {
                    create: [
                        { doctorId: req.doctorId },
                        ...(Array.isArray(participantIds) ? participantIds : [])
                            .filter(id => id && id !== req.doctorId)
                            .map(id => ({ doctorId: id })),
                    ],
                },
            },
            include: { participants: { include: { doctor: { select: { id: true, name: true, specialty: true } } } } },
        })

        // Notify invited participants
        const inviter = await db.doctor.findUnique({ where: { id: req.doctorId }, select: { name: true } })
        for (const p of board.participants) {
            if (p.doctorId === req.doctorId) continue
            const n = await db.notification.create({
                data: { type: 'board', message: `${inviter.name} invited you to a case board: "${topic.slice(0, 50)}"`, doctorId: p.doctorId, caseId: caseId || null },
            })
            sendNotification(p.doctorId, { type: 'board', message: n.message, id: n.id, caseId: caseId || null })
        }
        behaviorLog.log(req.doctorId, 'BOARD_CREATED', board.id, { topic, participants: board.participants.length }, req.headers['x-forwarded-for'] || req.ip)
        res.status(201).json(withUrl(board))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// My boards (created or participating)
router.get('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const boards = await db.board.findMany({
            where: { participants: { some: { doctorId: req.doctorId } } },
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { id: true, name: true } },
                case: { select: { id: true, title: true, tag: true } },
                participants: { include: { doctor: { select: { id: true, name: true, specialty: true, hospital: true } } } },
            },
        })
        res.json(boards.map(withUrl))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Board detail (participants only)
router.get('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const board = await db.board.findUnique({
            where: { id: req.params.id },
            include: {
                createdBy: { select: { id: true, name: true } },
                case: { select: { id: true, title: true, tag: true } },
                participants: { include: { doctor: { select: { id: true, name: true, specialty: true, hospital: true } } } },
            },
        })
        if (!board) return res.status(404).json({ error: 'Board not found' })
        if (!board.participants.some(p => p.doctorId === req.doctorId)) {
            return res.status(403).json({ error: 'You are not a participant of this board' })
        }
        res.json(withUrl(board))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Close a board (creator only)
router.post('/:id/close', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const board = await db.board.findUnique({ where: { id: req.params.id }, select: { createdById: true } })
        if (!board) return res.status(404).json({ error: 'Board not found' })
        if (board.createdById !== req.doctorId) return res.status(403).json({ error: 'Only the creator can close this board' })
        const updated = await db.board.update({ where: { id: req.params.id }, data: { status: 'closed' } })
        res.json(withUrl(updated))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router
