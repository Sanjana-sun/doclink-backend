const express = require('express')
const auth = require('../middleware/auth')
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

// A "teaching file" is a resolved case: one that has at least one response.
// The teaching point is the top-voted response; the case body is the prompt.
const RESOLVED = { isHoneypot: false, responses: { some: {} } }

// Library: resolved cases, annotated with this doctor's review state.
router.get('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { tag } = req.query
        const cases = await db.case.findMany({
            where: { ...RESOLVED, ...(tag && { tag }) },
            orderBy: { createdAt: 'desc' },
            take: 60,
            select: {
                id: true, title: true, tag: true, question: true, createdAt: true,
                _count: { select: { responses: true } },
            },
        })
        const reviews = await db.teachingReview.findMany({ where: { doctorId: req.doctorId } })
        const byCase = Object.fromEntries(reviews.map(r => [r.caseId, r]))
        const now = new Date()
        res.json(cases.map(c => {
            const r = byCase[c.id]
            return {
                ...c,
                studied: !!r,
                timesReviewed: r?.timesReviewed || 0,
                due: r ? r.nextDue <= now : false,
                nextDue: r?.nextDue || null,
            }
        }))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Cards due for spaced review, plus never-studied resolved cases to seed learning.
router.get('/due', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const now = new Date()
        const due = await db.teachingReview.findMany({
            where: { doctorId: req.doctorId, nextDue: { lte: now } },
            orderBy: { nextDue: 'asc' },
            include: { case: { select: { id: true, title: true, tag: true } } },
        })
        res.json(due.map(r => ({ caseId: r.caseId, title: r.case.title, tag: r.case.tag, timesReviewed: r.timesReviewed })))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// The teaching point for a case (top response) — revealed after self-assessment.
router.get('/:caseId/point', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const top = await db.response.findFirst({
            where: { caseId: req.params.caseId },
            orderBy: { helpful: 'desc' },
            include: { doctor: { select: { name: true, specialty: true } } },
        })
        if (!top) return res.status(404).json({ error: 'No teaching point available' })
        res.json({ text: top.text, author: top.doctor?.name, specialty: top.doctor?.specialty, helpful: top.helpful })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Record a review with a self-rated recall grade (0=again,1=hard,2=good,3=easy).
// SM-2-lite scheduling; awards a small CME credit for learning.
router.post('/:caseId/review', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const grade = Math.max(0, Math.min(3, parseInt(req.body?.grade ?? 2)))
        const existing = await db.teachingReview.findUnique({
            where: { doctorId_caseId: { doctorId: req.doctorId, caseId: req.params.caseId } },
        })

        let ease = existing?.ease ?? 2.5
        let interval = existing?.intervalDays ?? 1
        if (grade === 0) { interval = 1; ease = Math.max(1.3, ease - 0.2) }
        else {
            ease = Math.max(1.3, ease + (grade === 3 ? 0.15 : grade === 2 ? 0 : -0.15))
            interval = existing ? Math.round(interval * ease) : (grade === 3 ? 4 : 2)
        }
        const nextDue = new Date(Date.now() + interval * 24 * 60 * 60 * 1000)

        await db.teachingReview.upsert({
            where: { doctorId_caseId: { doctorId: req.doctorId, caseId: req.params.caseId } },
            update: { timesReviewed: { increment: 1 }, ease, intervalDays: interval, lastReviewed: new Date(), nextDue },
            create: { doctorId: req.doctorId, caseId: req.params.caseId, timesReviewed: 1, ease, intervalDays: interval, nextDue },
        })

        // Award CME for learning (smaller than answering; capped effect via 0.25/review)
        await db.cMELog.create({ data: { action: 'Studied a teaching case', points: 0.25, doctorId: req.doctorId, caseId: req.params.caseId } })
        await db.doctor.update({ where: { id: req.doctorId }, data: { cmeCredits: { increment: 0.25 } } })
        behaviorLog.log(req.doctorId, 'TEACHING_REVIEW', req.params.caseId, { grade }, req.headers['x-forwarded-for'] || req.ip)

        res.json({ intervalDays: interval, nextDue, creditsEarned: 0.25 })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router
