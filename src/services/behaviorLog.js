let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

const log = async (doctorId, action, entityId = null, metadata = null, ip = null) => {
    try {
        const db = await getPrisma()
        await db.behaviorLog.create({
            data: {
                doctorId,
                action,
                entityId,
                metadata,
                ip,
            }
        })
    } catch (err) {
        console.error('BehaviorLog error:', err)
        // Non-fatal — never block the main flow
    }
}

module.exports = { log }