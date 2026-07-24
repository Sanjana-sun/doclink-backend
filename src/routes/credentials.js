const express = require('express')
const { verifyChain, hashData } = require('../services/blockchain')

const router = express.Router()

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

// PUBLIC: a hospital can verify a doctor's DocLink credential in seconds, with no
// account. Returns the verified attributes + a blockchain-anchored proof hash and
// the chain's integrity status. Only verified doctors expose a credential.
router.get('/:doctorId', async (req, res) => {
    try {
        const db = await getPrisma()
        const doctor = await db.doctor.findUnique({
            where: { id: req.params.doctorId },
            select: {
                id: true, name: true, specialty: true, hospital: true, country: true,
                medicalCouncil: true, verified: true, verificationStatus: true,
                reputation: true, cmeCredits: true, createdAt: true, updatedAt: true,
            },
        })
        if (!doctor) return res.status(404).json({ error: 'Credential not found' })
        if (!doctor.verified) {
            return res.status(404).json({ error: 'This doctor is not verified', verified: false })
        }

        // Deterministic credential payload + its hash (what the anchor commits to)
        const payload = {
            id: doctor.id, name: doctor.name, specialty: doctor.specialty,
            country: doctor.country, council: doctor.medicalCouncil,
            status: doctor.verificationStatus,
        }
        const credentialHash = hashData(payload)

        // Find the on-chain anchor for this credential (if issued)
        const anchor = await db.blockchainLog.findFirst({
            where: { action: 'CREDENTIAL_ISSUED', entityId: doctor.id },
            orderBy: { createdAt: 'desc' },
        })
        const chain = await verifyChain(db)

        res.json({
            verified: true,
            name: doctor.name,
            specialty: doctor.specialty,
            hospital: doctor.hospital,
            country: doctor.country,
            council: doctor.medicalCouncil,
            tier: doctor.verificationStatus,
            memberSince: doctor.createdAt,
            reputation: doctor.reputation,
            cmeCredits: doctor.cmeCredits,
            credentialHash,
            anchored: !!anchor,
            blockHash: anchor?.blockHash || null,
            issuedAt: anchor?.createdAt || null,
            chainValid: chain.valid,
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router
