const express = require('express')
const auth = require('../middleware/auth')
const { createBlock } = require('../services/blockchain')
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

const ip = (req) => req.headers['x-forwarded-for'] || req.ip

// Adjust a doctor's reputation/CME, clamped at zero (used when votes/responses are reversed).
const adjustDoctor = async (db, doctorId, repDelta, cmeDelta) => {
    const d = await db.doctor.findUnique({ where: { id: doctorId }, select: { reputation: true, cmeCredits: true } })
    if (!d) return
    await db.doctor.update({
        where: { id: doctorId },
        data: { reputation: Math.max(0, d.reputation + repDelta), cmeCredits: Math.max(0, d.cmeCredits + cmeDelta) },
    })
}

// Create a response to a case
router.post('/:caseId', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { text } = req.body
        if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Response must be at least 10 characters' })

        const caseData = await db.case.findUnique({ where: { id: req.params.caseId } })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })

        const response = await db.response.create({
            data: { text, doctorId: req.doctorId, caseId: req.params.caseId }
        })

        await db.cMELog.create({
            data: { action: 'Responded to case', points: 2.5, doctorId: req.doctorId, caseId: req.params.caseId }
        })
        await db.doctor.update({
            where: { id: req.doctorId },
            data: { cmeCredits: { increment: 2.5 }, reputation: { increment: 10 } }
        })

        await createBlock(db, {
            action: 'RESPONSE_POSTED', entityType: 'Response', entityId: response.id, doctorId: req.doctorId,
            data: { text: text.slice(0, 100), caseId: req.params.caseId }
        })
        behaviorLog.log(req.doctorId, 'RESPONSE_SUBMITTED', req.params.caseId, { caseTitle: caseData.title.slice(0, 80) }, ip(req))

        // Notify case owner
        if (caseData.doctorId !== req.doctorId) {
            const responder = await db.doctor.findUnique({ where: { id: req.doctorId }, select: { name: true } })
            const notification = await db.notification.create({
                data: { type: 'response', message: `${responder.name} responded to your case: "${caseData.title.slice(0, 50)}"`, doctorId: caseData.doctorId, caseId: req.params.caseId }
            })
            sendNotification(caseData.doctorId, { type: 'response', message: notification.message, caseId: req.params.caseId, id: notification.id })
        }

        res.status(201).json(response)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Which responses in a case the current doctor has marked helpful
router.get('/:caseId/myvotes', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const votes = await db.helpfulVote.findMany({
            where: { doctorId: req.doctorId, response: { caseId: req.params.caseId } },
            select: { responseId: true },
        })
        res.json(votes.map(v => v.responseId))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Toggle a "helpful" vote — one per doctor per response, can't vote your own
router.post('/:id/helpful', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const response = await db.response.findUnique({
            where: { id: req.params.id },
            select: { id: true, doctorId: true, caseId: true, helpful: true },
        })
        if (!response) return res.status(404).json({ error: 'Response not found' })
        if (response.doctorId === req.doctorId) {
            return res.status(400).json({ error: 'You cannot mark your own response as helpful' })
        }

        const existing = await db.helpfulVote.findUnique({
            where: { responseId_doctorId: { responseId: req.params.id, doctorId: req.doctorId } },
        })

        if (existing) {
            await db.helpfulVote.delete({ where: { id: existing.id } })
            const updated = await db.response.update({ where: { id: req.params.id }, data: { helpful: { decrement: 1 } } })
            await adjustDoctor(db, response.doctorId, -5, -0.5)
            behaviorLog.log(req.doctorId, 'HELPFUL_UNVOTED', req.params.id, null, ip(req))
            return res.json({ helpful: Math.max(0, updated.helpful), voted: false })
        }

        await db.helpfulVote.create({ data: { responseId: req.params.id, doctorId: req.doctorId } })
        const updated = await db.response.update({ where: { id: req.params.id }, data: { helpful: { increment: 1 } } })
        await db.cMELog.create({ data: { action: 'Received helpful vote', points: 0.5, doctorId: response.doctorId, caseId: response.caseId } })
        await adjustDoctor(db, response.doctorId, +5, +0.5)
        behaviorLog.log(req.doctorId, 'HELPFUL_VOTED', req.params.id, null, ip(req))
        res.json({ helpful: updated.helpful, voted: true })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Edit your own response
router.put('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { text } = req.body
        if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Response must be at least 10 characters' })
        const r = await db.response.findUnique({ where: { id: req.params.id }, select: { doctorId: true } })
        if (!r) return res.status(404).json({ error: 'Response not found' })
        if (r.doctorId !== req.doctorId) return res.status(403).json({ error: 'You can only edit your own response' })
        const updated = await db.response.update({ where: { id: req.params.id }, data: { text } })
        behaviorLog.log(req.doctorId, 'RESPONSE_EDITED', req.params.id, null, ip(req))
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Delete your own response (reverses the posting reward; votes cascade)
router.delete('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const r = await db.response.findUnique({ where: { id: req.params.id }, select: { doctorId: true } })
        if (!r) return res.status(404).json({ error: 'Response not found' })
        if (r.doctorId !== req.doctorId) return res.status(403).json({ error: 'You can only delete your own response' })
        await db.response.delete({ where: { id: req.params.id } })
        await adjustDoctor(db, req.doctorId, -10, -2.5)
        behaviorLog.log(req.doctorId, 'RESPONSE_DELETED', req.params.id, null, ip(req))
        res.json({ message: 'Response deleted' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router
