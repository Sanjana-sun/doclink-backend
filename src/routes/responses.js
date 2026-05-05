const express = require('express')
const { PrismaClient } = require('@prisma/client')
const auth = require('../middleware/auth')
const { createBlock } = require('../services/blockchain')

const router = express.Router()
const prisma = new PrismaClient()

router.post('/:caseId', auth, async (req, res) => {
    try {
        const { text } = req.body
        if (!text) return res.status(400).json({ error: 'Response text required' })

        const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })

        const response = await prisma.response.create({
            data: { text, doctorId: req.doctorId, caseId: req.params.caseId }
        })

        // Log CME credit
        await prisma.cMELog.create({
            data: {
                action: 'Responded to case',
                points: 2.5,
                doctorId: req.doctorId,
                caseId: req.params.caseId
            }
        })

        // Update doctor stats
        await prisma.doctor.update({
            where: { id: req.doctorId },
            data: {
                cmeCredits: { increment: 2.5 },
                reputation: { increment: 10 }
            }
        })

        res.status(201).json(response)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/:id/helpful', auth, async (req, res) => {
    try {
        const response = await prisma.response.update({
            where: { id: req.params.id },
            data: { helpful: { increment: 1 } }
        })

        // Log CME credit for helpful vote
        await prisma.cMELog.create({
            data: {
                action: 'Received helpful vote',
                points: 0.5,
                doctorId: response.doctorId,
                caseId: response.caseId
            }
        })

        await prisma.doctor.update({
            where: { id: response.doctorId },
            data: {
                cmeCredits: { increment: 0.5 },
                reputation: { increment: 5 }
            }
        })

        res.json(response)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Log to blockchain
await createBlock(prisma, {
    action: 'RESPONSE_POSTED',
    entityType: 'Response',
    entityId: response.id,
    doctorId: req.doctorId,
    data: { text: text.slice(0, 100), caseId: req.params.caseId }
})

module.exports = router