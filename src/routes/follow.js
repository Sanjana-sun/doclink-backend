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

// Follow a doctor
router.post('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        if (req.params.id === req.doctorId) {
            return res.status(400).json({ error: 'You cannot follow yourself' })
        }
        const target = await db.doctor.findUnique({ where: { id: req.params.id }, select: { id: true } })
        if (!target) return res.status(404).json({ error: 'Doctor not found' })
        const follow = await db.follow.create({
            data: { followerId: req.doctorId, followingId: req.params.id }
        })
        res.status(201).json(follow)
    } catch (err) {
        if (err.code === 'P2002') return res.status(400).json({ error: 'Already following' })
        if (err.code === 'P2003') return res.status(404).json({ error: 'Doctor not found' })
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Unfollow a doctor
router.delete('/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        // deleteMany doesn't throw when the row doesn't exist (idempotent unfollow)
        await db.follow.deleteMany({
            where: { followerId: req.doctorId, followingId: req.params.id }
        })
        res.json({ message: 'Unfollowed' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get followers of a doctor
router.get('/:id/followers', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const followers = await db.follow.findMany({
            where: { followingId: req.params.id },
            include: {
                follower: {
                    select: { id: true, name: true, specialty: true, hospital: true, reputation: true }
                }
            }
        })
        res.json(followers.map(f => f.follower))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get doctors a doctor is following
router.get('/:id/following', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const following = await db.follow.findMany({
            where: { followerId: req.params.id },
            include: {
                following: {
                    select: { id: true, name: true, specialty: true, hospital: true, reputation: true }
                }
            }
        })
        res.json(following.map(f => f.following))
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Get activity feed from doctors you follow
router.get('/feed', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const following = await db.follow.findMany({
            where: { followerId: req.doctorId },
            select: { followingId: true }
        })
        const followingIds = following.map(f => f.followingId)

        const [cases, responses] = await Promise.all([
            db.case.findMany({
                where: { doctorId: { in: followingIds } },
                include: {
                    doctor: { select: { id: true, name: true, specialty: true, hospital: true } },
                    _count: { select: { responses: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: 20
            }),
            db.response.findMany({
                where: { doctorId: { in: followingIds } },
                include: {
                    doctor: { select: { id: true, name: true, specialty: true, hospital: true } },
                    case: { select: { id: true, title: true, tag: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: 20
            })
        ])

        const feed = [
            ...cases.map(c => ({ type: 'case', data: c, createdAt: c.createdAt })),
            ...responses.map(r => ({ type: 'response', data: r, createdAt: r.createdAt }))
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30)

        res.json(feed)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Check if you follow a doctor
router.get('/check/:id', auth, async (req, res) => {
    try {
        const db = await getPrisma()
        const follow = await db.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: req.doctorId,
                    followingId: req.params.id
                }
            }
        })
        res.json({ following: !!follow })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router