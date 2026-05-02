const express = require('express')
const { PrismaClient } = require('@prisma/client')
const auth = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

router.get('/me/cases', auth, async (req, res) => {
  try {
    const cases = await prisma.case.findMany({
      where: { doctorId: req.doctorId },
      include: { _count: { select: { responses: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(cases)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/me', auth, async (req, res) => {
  try {
    const { name, hospital, specialty } = req.body
    const doctor = await prisma.doctor.update({
      where: { id: req.doctorId },
      data: { name, hospital, specialty },
      select: { id: true, name: true, email: true, specialty: true, hospital: true, reputation: true, cmeCredits: true }
    })
    res.json(doctor)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router