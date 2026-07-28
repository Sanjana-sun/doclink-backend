const express = require('express')
const auth = require('../middleware/auth')
const { createBlock } = require('../services/blockchain')
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

// --- Case twin: similar-case retrieval ---
// Clinical fields are E2E-encrypted, so similarity uses the plaintext signal
// we do hold: title + question text, plus specialty tag and demographics.
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'with', 'is', 'was', 'are', 'be', 'at', 'by', 'from', 'as', 'this', 'that', 'has', 'had', 'no', 'not', 'yr', 'yo', 'old', 'patient', 'case', 'history', 'presenting'])
const tokenize = (s) => (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
const jaccard = (a, b) => {
    if (!a.size || !b.size) return 0
    let inter = 0
    for (const t of a) if (b.has(t)) inter++
    return inter / (a.size + b.size - inter)
}

router.get('/:id/similar', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const target = await db.case.findUnique({
            where: { id: req.params.id },
            select: { id: true, tag: true, age: true, sex: true, title: true, question: true }
        })
        if (!target) return res.status(404).json({ error: 'Case not found' })

        const candidates = await db.case.findMany({
            where: { id: { not: target.id }, isHoneypot: false },
            // Bound the scan: score against the most recent cases only
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: {
                id: true, tag: true, age: true, sex: true, title: true, question: true, createdAt: true,
                doctor: { select: { name: true, specialty: true } },
                responses: { orderBy: { helpful: 'desc' }, take: 1, select: { text: true, helpful: true } },
                _count: { select: { responses: true } },
            },
        })

        const tTokens = new Set(tokenize(`${target.title} ${target.question}`))
        const scored = candidates.map(c => {
            const text = jaccard(tTokens, new Set(tokenize(`${c.title} ${c.question}`)))
            const tagBoost = c.tag === target.tag ? 0.35 : 0
            const sexBoost = c.sex === target.sex ? 0.05 : 0
            const ageBoost = Math.abs((c.age || 0) - (target.age || 0)) <= 10 ? 0.05 : 0
            return { c, score: text + tagBoost + sexBoost + ageBoost }
        })
            .filter(s => s.score > 0.12)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4)

        res.json(scored.map(({ c, score }) => ({
            id: c.id, title: c.title, tag: c.tag, age: c.age, sex: c.sex,
            createdAt: c.createdAt, specialty: c.doctor?.specialty,
            responseCount: c._count.responses,
            topResponse: c.responses[0]?.text?.slice(0, 180) || null,
            match: Math.round(Math.min(score, 1) * 100),
        })))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Edit a case
router.put('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { title, question, urgency } = req.body
        if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: 'Title cannot be empty' })
        if (question !== undefined && !String(question).trim()) return res.status(400).json({ error: 'Question cannot be empty' })
        if (urgency !== undefined && !['routine', 'urgent', 'critical'].includes(urgency)) return res.status(400).json({ error: 'Invalid urgency' })
        const caseData = await db.case.findUnique({ where: { id: req.params.id } })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        if (caseData.doctorId !== req.doctorId) return res.status(403).json({ error: 'Unauthorized' })
        const updated = await db.case.update({
            where: { id: req.params.id },
            data: {
                ...(title !== undefined && { title }),
                ...(question !== undefined && { question }),
                ...(urgency !== undefined && { urgency }),
            }
        })
        behaviorLog.log(req.doctorId, 'CASE_EDITED', req.params.id, { title, urgency }, req.headers['x-forwarded-for'] || req.ip)
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Delete a case
router.delete('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const caseData = await db.case.findUnique({ where: { id: req.params.id } })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        if (caseData.doctorId !== req.doctorId) return res.status(403).json({ error: 'Unauthorized' })
        behaviorLog.log(req.doctorId, 'CASE_DELETED', req.params.id, { title: caseData.title }, req.headers['x-forwarded-for'] || req.ip)
        await db.case.delete({ where: { id: req.params.id } })
        res.json({ message: 'Case deleted' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Store encrypted case key
router.post('/:id/key', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { encryptedKey } = req.body
        if (!encryptedKey) return res.status(400).json({ error: 'encryptedKey required' })
        const caseData = await db.case.findUnique({
            where: { id: req.params.id },
            select: { doctorId: true, tag: true }
        })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        if (caseData.doctorId !== req.doctorId) return res.status(403).json({ error: 'Unauthorized' })
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

// Get case key
router.get('/:id/key', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const caseData = await db.case.findUnique({
            where: { id: req.params.id },
            select: { doctorId: true, tag: true }
        })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })
        const doctor = await db.doctor.findUnique({
            where: { id: req.doctorId },
            select: { verified: true, specialty: true, publicKey: true }
        })
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
        if (!doctor.verified) return res.status(403).json({ error: 'Account not verified' })

        await createBlock(db, {
            action: 'CASE_KEY_REQUEST',
            entityType: 'Case',
            entityId: req.params.id,
            doctorId: req.doctorId,
            data: { doctorId: req.doctorId, caseId: req.params.id, ts: Date.now() },
        })

        let caseKey = await db.caseKey.findUnique({
            where: { caseId_doctorId: { caseId: req.params.id, doctorId: req.doctorId } }
        })
        if (caseKey) return res.json({ encryptedKey: caseKey.encryptedKey })
        if (doctor.specialty !== caseData.tag && caseData.doctorId !== req.doctorId) {
            return res.status(403).json({ error: 'You need to be in the same specialty to access this case' })
        }
        return res.status(404).json({ error: 'No key available — request access from case author' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get all cases
router.get('/', async (req, res) => {
    try {
        const db = await getPrisma()
        const { tag, search } = req.query
        const cases = await db.case.findMany({
            where: {
                isHoneypot: false,
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

// Get single case — detects honeypot access + logs view. Auth required: this
// serves clinical case data, and an authenticated identity is what makes the
// honeypot tripwire meaningful (anonymous access can no longer slip past it).
router.get('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const caseData = await db.case.findUnique({
            where: { id: req.params.id },
            include: {
                doctor: { select: { name: true, hospital: true, specialty: true, id: true } },
                responses: {
                    include: { doctor: { select: { name: true, hospital: true, specialty: true, reputation: true, id: true } } },
                    orderBy: { helpful: 'desc' }
                }
            }
        })
        if (!caseData) return res.status(404).json({ error: 'Case not found' })

        // Increment views
        await db.case.update({ where: { id: req.params.id }, data: { views: { increment: 1 } } })

        const accessingDoctorId = req.doctorId
        const ip = req.headers['x-forwarded-for'] || req.ip

        // Log case view
        behaviorLog.log(accessingDoctorId, 'CASE_VIEWED', req.params.id, { title: caseData.title, tag: caseData.tag }, ip)

        // Detect honeypot access by anyone other than its author.
        if (caseData.isHoneypot && accessingDoctorId !== caseData.doctorId) {
            // Throttle: only alert once per (doctor, honeypot) per 24h so a scrape
            // loop or an innocent re-open can't produce an email/chain storm.
            const DAY = 24 * 60 * 60 * 1000
            const recentTrip = await db.behaviorLog.findFirst({
                where: {
                    doctorId: accessingDoctorId,
                    action: 'HONEYPOT_ACCESSED',
                    entityId: req.params.id,
                    createdAt: { gte: new Date(Date.now() - DAY) },
                },
                select: { id: true },
            })

            // Always record the access for the audit trail.
            behaviorLog.log(accessingDoctorId, 'HONEYPOT_ACCESSED', req.params.id, { title: caseData.title }, ip)

            if (!recentTrip) {
                console.warn(`🚨 HONEYPOT ACCESS: Doctor ${accessingDoctorId} accessed honeypot case ${req.params.id}`)

                await createBlock(db, {
                    action: 'HONEYPOT_ACCESS',
                    entityType: 'Case',
                    entityId: req.params.id,
                    doctorId: accessingDoctorId,
                    data: { accessingDoctorId, caseId: req.params.id, ip, ts: Date.now() },
                })

                // Contain: flag the doctor for admin review (access retained).
                try {
                    await db.doctor.update({
                        where: { id: accessingDoctorId },
                        data: {
                            flagged: true,
                            flaggedReason: `Accessed honeypot case "${caseData.title}"`,
                            flaggedAt: new Date(),
                        },
                    })
                } catch (flagErr) { console.error('Failed to flag doctor (non-fatal):', flagErr) }

                try {
                    const { Resend } = require('resend')
                    const resend = new Resend(process.env.RESEND_API_KEY)
                    const accessingDoctor = await db.doctor.findUnique({
                        where: { id: accessingDoctorId },
                        select: { name: true, email: true, specialty: true, hospital: true }
                    })
                    await resend.emails.send({
                        from: 'noreply@doclink.in',
                        to: process.env.SECURITY_ALERT_EMAIL || 'noreply@doclink.in',
                    subject: '🚨 HONEYPOT ACCESS DETECTED — DocLink Security Alert',
                    html: `
            <div style="font-family: sans-serif; padding: 2rem; max-width: 560px;">
              <h2 style="color: #ef4444; margin-bottom: 1rem;">Honeypot Access Alert</h2>
              <p style="color: #6b6b62; margin-bottom: 1.5rem;">A doctor has accessed a honeypot case. This may indicate malicious intent.</p>
              <table style="border-collapse: collapse; width: 100%; margin-bottom: 1.5rem;">
                <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Doctor</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${accessingDoctor?.name}</td></tr>
                <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Email</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${accessingDoctor?.email}</td></tr>
                <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Specialty</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${accessingDoctor?.specialty}</td></tr>
                <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Hospital</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${accessingDoctor?.hospital}</td></tr>
                <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Case ID</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${req.params.id}</td></tr>
                <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Case Title</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${caseData.title}</td></tr>
                <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>IP Address</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${req.headers['x-forwarded-for'] || req.ip || 'unknown'}</td></tr>
                <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Time</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${new Date().toLocaleString('en-US', { timeZone: process.env.ALERT_TIMEZONE || 'UTC', timeZoneName: 'short' })}</td></tr>
              </table>
              <a href="https://www.doclink.in/admin" style="display: inline-block; background: #ef4444; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 500;">Review in Admin Panel →</a>
            </div>
          `
                    })
                } catch (emailErr) {
                    console.error('Failed to send honeypot alert email:', emailErr)
                }
            }
        }

        res.json(caseData)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Post a case
router.post('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { title, tag, urgency, age, sex, history, examination, investigations, question } = req.body
        if (!title || !tag || !urgency || !sex || !history || !question) {
            return res.status(400).json({ error: 'Required fields missing' })
        }
        const ageNum = parseInt(age)
        if (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 130) {
            return res.status(400).json({ error: 'Age must be a whole number between 0 and 130' })
        }
        if (!['routine', 'urgent', 'critical'].includes(urgency)) {
            return res.status(400).json({ error: 'Invalid urgency' })
        }
        const newCase = await db.case.create({
            data: { title, tag, urgency, age: ageNum, sex, history, examination, investigations, question, doctorId: req.doctorId }
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

        behaviorLog.log(req.doctorId, 'CASE_POSTED', newCase.id, { title, tag, urgency }, req.headers['x-forwarded-for'] || req.ip)

        res.status(201).json(newCase)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router