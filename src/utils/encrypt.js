const crypto = require('crypto')

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY // 32-char hex string
const ALGORITHM = 'aes-256-gcm'

const encrypt = (text) => {
    if (!text || !ENCRYPTION_KEY) return text
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const tag = cipher.getAuthTag()
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

const decrypt = (text) => {
    if (!text || !ENCRYPTION_KEY) return text
    if (!text.includes(':')) return text // not encrypted
    const [ivHex, tagHex, encrypted] = text.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
    decipher.setAuthTag(tag)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
}

module.exports = { encrypt, decrypt }