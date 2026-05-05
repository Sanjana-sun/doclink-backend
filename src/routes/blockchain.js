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

module.exports = router
