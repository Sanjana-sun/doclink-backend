const express = require('express')
const { PrismaClient } = require('@prisma/client')
const auth = require('../middleware/auth')
const { createBlock } = require('../services/blockchain')

const router = express.Router()
const prisma = new PrismaClient()

router.get('/', async (req, res) => {
  try {
    const { tag, search } = req.query
    const cases = await prisma.case.findMany({
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
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const caseData = await prisma.case.findUnique({
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
    await prisma.case.update({ where: { id: req.params.id }, data: { views: { increment: 1 } } })
    res.json(caseData)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', auth, async (req, res) => {
  try {
    const { title, tag, urgency, age, sex, history, examination, investigations, question } = req.body
    if (!title || !tag || !urgency || !age || !sex || !history || !question) {
      return res.status(400).json({ error: 'Required fields missing' })
    }
      const newCase = await prisma.case.create({
          data: { title, tag, urgency, age: parseInt(age), sex, history, examination, investigations, question, doctorId: req.doctorId }
      })

// Log CME credit for posting a case
      await prisma.cMELog.create({
          data: {
              action: 'Posted a case',
              points: 1.0,
              doctorId: req.doctorId,
              caseId: newCase.id
          }
      })

      await prisma.doctor.update({
          where: { id: req.doctorId },
          data: {
              cmeCredits: { increment: 1.0 },
              reputation: { increment: 5 }
          }
      })

      res.status(201).json(newCase)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// Log to blockchain
await createBlock({
    action: 'CASE_POSTED',
    entityType: 'Case',
    entityId: newCase.id,
    doctorId: req.doctorId,
    data: { title, tag, urgency, age, sex, question }
})

router.delete('/:id', auth, async (req, res) => {
  try {
    const caseData = await prisma.case.findUnique({ where: { id: req.params.id } })
    if (!caseData) return res.status(404).json({ error: 'Case not found' })
    if (caseData.doctorId !== req.doctorId) return res.status(403).json({ error: 'Unauthorized' })
    await prisma.case.delete({ where: { id: req.params.id } })
    res.json({ message: 'Case deleted' })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router