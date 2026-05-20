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

// Store encrypted case key (called when posting a case)
router.post('/:id/key', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { encryptedKey } = req.body
        if (!encryptedKey) return res.status(400).json({ error: 'encryptedKey required' })

        // Verify requester owns the case
        const caseData = await db.case.findUnique({
            where: { id: req.params.id },
            select: { doctorId: true, tag: true }
        })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        if (caseData.doctorId !== req.doctorId) return res.status(403).json({ error: 'Unauthorized' })

        // Store encrypted key for case author
        await db.caseKey.upsert({
            where: { caseId_doctorId: { caseId: req.params.id, doctorId: req.doctorId } },
            update: { encryptedKey },
            create: { caseId: req.params.id, doctorId: req.doctorId, encryptedKey }
        })

        res.json({ message: 'Key stored' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get case key (server checks verification + specialty, logs access)
router.get('/:id/key', auth, async (req, res) => {
    try {
        const db = await getPrisma()

        // Get case
        const caseData = await db.case.findUnique({
            where: { id: req.params.id },
            select: { doctorId: true, tag: true }
        })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })

        // Get requesting doctor
        const doctor = await db.doctor.findUnique({
            where: { id: req.doctorId },
            select: { verified: true, specialty: true, publicKey: true }
        })
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
        if (!doctor.verified) return res.status(403).json({ error: 'Account not verified' })

        // Log every access attempt — immutable audit trail
        await db.blockchainLog.create({
            data: {
                action: 'CASE_KEY_REQUEST',
                entityType: 'Case',
                entityId: req.params.id,
                doctorId: req.doctorId,
                dataHash: `${req.doctorId}-${req.params.id}-${Date.now()}`,
                previousHash: req.headers['x-forwarded-for'] || 'unknown',
                blockHash: require('crypto').createHash('sha256')
                    .update(`${req.doctorId}${req.params.id}${Date.now()}`)
                    .digest('hex')
            }
        })

        // Check if doctor already has a key (author or previously shared)
        let caseKey = await db.caseKey.findUnique({
            where: { caseId_doctorId: { caseId: req.params.id, doctorId: req.doctorId } }
        })

        if (caseKey) {
            return res.json({ encryptedKey: caseKey.encryptedKey })
        }

        // Doctor doesn't have key yet — check if they're in the right specialty
        if (doctor.specialty !== caseData.tag && caseData.doctorId !== req.doctorId) {
            return res.status(403).json({ error: 'You need to be in the same specialty to access this case' })
        }

        // Get case author's key and re-encrypt for requesting doctor
        // For now return null — key sharing from author needed
        return res.status(404).json({ error: 'No key available — request access from case author' })

    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/', async (req, res) => {
    try {
        const db = await getPrisma()
        const { tag, search } = req.query
        const cases = await db.case.findMany({
            where: {
                ...(tag && { tag }),
                ...(search && { title: { contains: search, mode: 'insensitive' } })
            },
            include: {
                doctor: { select: { name: true, hospital: true, specialty: true } },
                _count: { select: { responses: true } }
            },
            orderBy: { createdAt: 'desc' }
        })
        res.json(cases)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/:id', async (req, res) => {
    try {
        const db = await getPrisma()
        const caseData = await db.case.findUnique({
            where: { id: req.params.id },
            include: {
                doctor: { select: { name: true, hospital: true, specialty: true } },
                responses: {
                    include: { doctor: { select: { name: true, hospital: true, specialty: true, reputation: true } } },
                    orderBy: { helpful: 'desc' }
                }
            }
        })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        await db.case.update({ where: { id: req.params.id }, data: { views: { increment: 1 } } })
        res.json(caseData)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { title, tag, urgency, age, sex, history, examination, investigations, question } = req.body
        if (!title || !tag || !urgency || !age || !sex || !history || !question) {
            return res.status(400).json({ error: 'Required fields missing' })
        }
        const newCase = await db.case.create({
            data: { title, tag, urgency, age: parseInt(age), sex, history, examination, investigations, question, doctorId: req.doctorId }
        })

        await db.cMELog.create({
            data: { action: 'Posted a case', points: 1.0, doctorId: req.doctorId, caseId: newCase.id }
        })

        await db.doctor.update({
            where: { id: req.doctorId },
            data: { cmeCredits: { increment: 1.0 }, reputation: { increment: 5 } }
        })

        await createBlock(db, {
            action: 'CASE_POSTED',
            entityType: 'Case',
            entityId: newCase.id,
            doctorId: req.doctorId,
            data: { title, tag, urgency, age, sex, question }
        })

        res.status(201).json(newCase)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.delete('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const caseData = await db.case.findUnique({ where: { id: req.params.id } })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        if (caseData.doctorId !== req.doctorId) return res.status(403).json({ error: 'Unauthorized' })
        await db.case.delete({ where: { id: req.params.id } })
        res.json({ message: 'Case deleted' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router