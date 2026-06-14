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

router.post('/:caseId', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { text } = req.body
        if (!text) return res.status(400).json({ error: 'Response text required' })

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
            action: 'RESPONSE_POSTED',
            entityType: 'Response',
            entityId: response.id,
            doctorId: req.doctorId,
            data: { text: text.slice(0, 100), caseId: req.params.caseId }
        })

        behaviorLog.log(req.doctorId, 'RESPONSE_SUBMITTED', req.params.caseId, { caseTitle: caseData.title.slice(0, 80) }, req.headers['x-forwarded-for'] || req.ip)

        // Notify case owner
        if (caseData.doctorId !== req.doctorId) {
            const responder = await db.doctor.findUnique({
                where: { id: req.doctorId },
                select: { name: true }
            })
            const notification = await db.notification.create({
                data: {
                    type: 'response',
                    message: `${responder.name} responded to your case: "${caseData.title.slice(0, 50)}"`,
                    doctorId: caseData.doctorId,
                    caseId: req.params.caseId
                }
            })
            sendNotification(caseData.doctorId, {
                type: 'response',
                message: notification.message,
                caseId: req.params.caseId,
                id: notification.id
            })
        }

        res.status(201).json(response)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/:id/helpful', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const response = await db.response.update({
            where: { id: req.params.id },
            data: { helpful: { increment: 1 } }
        })

        await db.cMELog.create({
            data: { action: 'Received helpful vote', points: 0.5, doctorId: response.doctorId, caseId: response.caseId }
        })

        await db.doctor.update({
            where: { id: response.doctorId },
            data: { cmeCredits: { increment: 0.5 }, reputation: { increment: 5 } }
        })

        behaviorLog.log(req.doctorId, 'HELPFUL_VOTED', req.params.id, null, req.headers['x-forwarded-for'] || req.ip)

        res.json(response)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router