const express = require('express')
const auth = require('../middleware/auth')
const { verifyChain } = require('../services/blockchain')

const router = express.Router()

let prisma
const getPrisma = async () => {
  if (!prisma) {
    const { PrismaClient } = await import('@prisma/client')
    prisma = new PrismaClient()
  }
  return prisma
}

router.get('/log', auth, async (req, res) => {
  try {
    const db = await getPrisma()
    const logs = await db.blockchainLog.findMany({
      orderBy: { blockNumber: 'desc' },
      take: 50
    })
    res.json(logs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/verify', auth, async (req, res) => {
  try {
    const db = await getPrisma()
    const result = await verifyChain(db)
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get blockchain proof for a specific case
router.get('/proof/:caseId', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const logs = await db.blockchainLog.findMany({
            where: { entityId: req.params.caseId },
            orderBy: { blockNumber: 'asc' }
        })

        const caseData = await db.case.findUnique({
            where: { id: req.params.caseId },
            include: {
                doctor: { select: { name: true, hospital: true, specialty: true } },
                responses: {
                    include: { doctor: { select: { name: true, hospital: true } } },
                    orderBy: { createdAt: 'asc' }
                }
            }
        })

        if (!caseData) return res.status(404).json({ error: 'Case not found' })

// Return proof even if no blockchain logs exist yet
        if (logs.length === 0) {
            return res.json({
                case: caseData,
                caseLogs: [],
                responseLogs: [],
                chainValid: false,
                totalBlocks: 0,
                noBlockchainData: true,
                generatedAt: new Date().toISOString()
            })
        }

        // Also get response blockchain logs
        const responseLogs = await db.blockchainLog.findMany({
            where: {
                action: 'RESPONSE_POSTED',
                entityId: { in: caseData.responses.map(r => r.id) }
            },
            orderBy: { blockNumber: 'asc' }
        })

        const chainValid = await verifyChain(db)

        res.json({
            case: caseData,
            caseLogs: logs,
            responseLogs,
            chainValid: chainValid.valid,
            totalBlocks: chainValid.blocks,
            generatedAt: new Date().toISOString()
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router
