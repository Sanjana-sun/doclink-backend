const express = require('express')
const auth = require('../middleware/auth')
const { createBlock } = require('../services/blockchain')

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

        res.json(response)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router