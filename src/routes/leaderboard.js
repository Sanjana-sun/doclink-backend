const express = require('express')
const auth = require('../middleware/auth')

const router = express.Router()

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

const calculateScore = (doctor) => {
    const caseScore = (doctor._count?.cases || 0) * 10
    const responseScore = (doctor._count?.responses || 0) * 15
    const cmeScore = (doctor.cmeCredits || 0) * 20
    const reputationScore = doctor.reputation || 0
    return caseScore + responseScore + cmeScore + reputationScore
}

// All-time leaderboard
router.get('/alltime', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { specialty } = req.query
        const doctors = await db.doctor.findMany({
            where: {
                verified: true,
                ...(specialty && specialty !== 'All' && { specialty })
            },
            select: {
                id: true, name: true, specialty: true, hospital: true,
                reputation: true, cmeCredits: true,
                _count: { select: { cases: true, responses: true } }
            },
            orderBy: { reputation: 'desc' },
            take: 50
        })

        const ranked = doctors
            .map(d => ({ ...d, score: calculateScore(d) }))
            .sort((a, b) => b.score - a.score)
            .map((d, i) => ({ ...d, rank: i + 1 }))

        res.json(ranked)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Weekly leaderboard
router.get('/weekly', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { specialty } = req.query
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)

        const doctors = await db.doctor.findMany({
            where: {
                verified: true,
                ...(specialty && specialty !== 'All' && { specialty })
            },
            select: {
                id: true, name: true, specialty: true, hospital: true,
                reputation: true, cmeCredits: true,
                cases: {
                    where: { createdAt: { gte: weekAgo } },
                    select: { id: true }
                },
                responses: {
                    where: { createdAt: { gte: weekAgo } },
                    select: { id: true, helpful: true }
                },
                cmeLog: {
                    where: { createdAt: { gte: weekAgo } },
                    select: { points: true }
                }
            }
        })

        const ranked = doctors
            .map(d => {
                const weeklyScore =
                    (d.cases?.length || 0) * 10 +
                    (d.responses?.length || 0) * 15 +
                    (d.cmeLog?.reduce((sum, l) => sum + l.points, 0) || 0) * 20
                return {
                    id: d.id, name: d.name, specialty: d.specialty,
                    hospital: d.hospital, reputation: d.reputation,
                    cmeCredits: d.cmeCredits,
                    _count: { cases: d.cases?.length || 0, responses: d.responses?.length || 0 },
                    weeklyScore
                }
            })
            .filter(d => d.weeklyScore > 0)
            .sort((a, b) => b.weeklyScore - a.weeklyScore)
            .slice(0, 10)
            .map((d, i) => ({ ...d, rank: i + 1 }))

        res.json(ranked)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Monthly leaderboard
router.get('/monthly', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const { specialty } = req.query
        const monthAgo = new Date()
        monthAgo.setDate(1)
        monthAgo.setHours(0, 0, 0, 0)

        const doctors = await db.doctor.findMany({
            where: {
                verified: true,
                ...(specialty && specialty !== 'All' && { specialty })
            },
            select: {
                id: true, name: true, specialty: true, hospital: true,
                reputation: true, cmeCredits: true,
                cases: {
                    where: { createdAt: { gte: monthAgo } },
                    select: { id: true }
                },
                responses: {
                    where: { createdAt: { gte: monthAgo } },
                    select: { id: true, helpful: true }
                },
                cmeLog: {
                    where: { createdAt: { gte: monthAgo } },
                    select: { points: true }
                }
            }
        })

        const ranked = doctors
            .map(d => {
                const monthlyScore =
                    (d.cases?.length || 0) * 10 +
                    (d.responses?.length || 0) * 15 +
                    (d.cmeLog?.reduce((sum, l) => sum + l.points, 0) || 0) * 20
                return {
                    id: d.id, name: d.name, specialty: d.specialty,
                    hospital: d.hospital, reputation: d.reputation,
                    cmeCredits: d.cmeCredits,
                    _count: { cases: d.cases?.length || 0, responses: d.responses?.length || 0 },
                    monthlyScore
                }
            })
            .filter(d => d.monthlyScore > 0)
            .sort((a, b) => b.monthlyScore - a.monthlyScore)
            .slice(0, 50)
            .map((d, i) => ({ ...d, rank: i + 1 }))

        res.json(ranked)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get my rank
router.get('/myrank', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const alltime = await db.doctor.findMany({
            where: { verified: true },
            select: {
                id: true, reputation: true, cmeCredits: true,
                _count: { select: { cases: true, responses: true } }
            }
        })

        const ranked = alltime
            .map(d => ({ id: d.id, score: calculateScore(d) }))
            .sort((a, b) => b.score - a.score)

        const idx = ranked.findIndex(d => d.id === req.doctorId)
        // Unverified/unlisted doctors aren't ranked yet
        const myRank = idx === -1 ? null : idx + 1
        const myScore = idx === -1 ? 0 : ranked[idx].score

        res.json({ rank: myRank, score: myScore, total: ranked.length, ranked: idx !== -1 })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router