const express = require('express')
const { PrismaClient } = require('@prisma/client')
const auth = require('../middleware/auth')

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

    await prisma.doctor.update({
      where: { id: req.doctorId },
      data: { cmeCredits: { increment: 2.5 }, reputation: { increment: 10 } }
    })

    res.status(201).json(response)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/:id/helpful', auth, async (req, res) => {
  try {
    const response = await prisma.response.update({
      where: { id: req.params.id },
      data: { helpful: { increment: 1 } }
    })
    res.json(response)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router