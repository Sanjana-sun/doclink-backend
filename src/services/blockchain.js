const crypto = require('crypto')

const hashData = (data) => {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
}

const getLastHash = async (prisma) => {
  const last = await prisma.blockchainLog.findFirst({
    orderBy: { blockNumber: 'desc' }
  })
  return last ? last.blockHash : '0000000000000000000000000000000000000000000000000000000000000000'
}

const createBlock = async (prisma, { action, entityType, entityId, doctorId, data }) => {
  const previousHash = await getLastHash(prisma)
  const dataHash = hashData(data)
  const timestamp = new Date().toISOString()
  const blockHash = hashData({ action, entityType, entityId, doctorId, dataHash, previousHash, timestamp })
  const block = await prisma.blockchainLog.create({
    data: { action, entityType, entityId, doctorId, dataHash, previousHash, blockHash }
  })
  return block
}

const verifyChain = async (prisma) => {
  const blocks = await prisma.blockchainLog.findMany({ orderBy: { blockNumber: 'asc' } })
  if (blocks.length === 0) return { valid: true, blocks: 0 }
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].previousHash !== blocks[i - 1].blockHash) {
      return { valid: false, tamperedAt: blocks[i].blockNumber, message: `Chain broken at block ${blocks[i].blockNumber}` }
    }
  }
  return { valid: true, blocks: blocks.length }
}

module.exports = { createBlock, verifyChain, hashData }
