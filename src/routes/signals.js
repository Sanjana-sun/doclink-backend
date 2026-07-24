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

const MIN_CELL = 3 // k-anonymity: suppress any bucket smaller than this
const WEEK = 7 * 24 * 60 * 60 * 1000

// Aggregate, de-identified case-volume signal by specialty × country × week.
// Surfaces spikes (this week vs trailing-8-week average) as a soft public-health
// signal. No case content, no author identity, small cells suppressed.
router.get('/', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const since = new Date(Date.now() - 9 * WEEK)
        const cases = await db.case.findMany({
            where: { isHoneypot: false, createdAt: { gte: since } },
            select: { tag: true, createdAt: true, doctor: { select: { country: true } } },
        })

        const now = Date.now()
        const weekIndex = (d) => Math.floor((now - new Date(d).getTime()) / WEEK) // 0 = current week

        // key = tag|country → array of 9 weekly counts (index 0 = current)
        const buckets = {}
        for (const c of cases) {
            const wi = weekIndex(c.createdAt)
            if (wi < 0 || wi > 8) continue
            const key = `${c.tag}|${c.doctor?.country || 'XX'}`
            if (!buckets[key]) buckets[key] = Array(9).fill(0)
            buckets[key][wi]++
        }

        const signals = Object.entries(buckets).map(([key, weeks]) => {
            const [tag, country] = key.split('|')
            const current = weeks[0]
            const trailing = weeks.slice(1) // weeks 1..8
            const total = weeks.reduce((a, b) => a + b, 0)
            const avg = trailing.reduce((a, b) => a + b, 0) / trailing.length
            const ratio = avg > 0 ? current / avg : (current > 0 ? Infinity : 0)
            return { tag, country, current, avg: Math.round(avg * 10) / 10, ratio, total, spike: current >= MIN_CELL && ratio >= 2 }
        })
            .filter(s => s.total >= MIN_CELL) // suppress sparse cells
            .sort((a, b) => (b.spike - a.spike) || (b.ratio - a.ratio) || (b.total - a.total))

        res.json({ generatedAt: new Date(), minCell: MIN_CELL, signals })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router
