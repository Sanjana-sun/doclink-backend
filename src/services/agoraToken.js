const crypto = require('crypto')

const PRIVILEGE_JOIN_CHANNEL = 1
const PRIVILEGE_PUBLISH_AUDIO = 2
const PRIVILEGE_PUBLISH_VIDEO = 3

function pack(value) {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(value, 0)
    return buf
}

function packString(str) {
    const buf = Buffer.alloc(2 + str.length)
    buf.writeUInt16LE(str.length, 0)
    Buffer.from(str).copy(buf, 2)
    return buf
}

function generateToken(appId, appCertificate, channelName, uid, expireTimestamp) {
    const version = '006'
    const uidStr = uid.toString()
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const salt = Math.floor(Math.random() * 100000)

    const privileges = {
        [PRIVILEGE_JOIN_CHANNEL]: expireTimestamp,
        [PRIVILEGE_PUBLISH_AUDIO]: expireTimestamp,
        [PRIVILEGE_PUBLISH_VIDEO]: expireTimestamp,
    }

    const msgBuf = Buffer.concat([
        packString(appId),
        packString(channelName),
        packString(uidStr),
        pack(currentTimestamp),
        pack(salt),
        ...Object.entries(privileges).map(([k, v]) =>
            Buffer.concat([pack(parseInt(k)), pack(v)])
        )
    ])

    const signature = crypto
        .createHmac('sha256', appCertificate)
        .update(msgBuf)
        .digest()

    const content = Buffer.concat([
        pack(salt),
        pack(currentTimestamp),
        pack(expireTimestamp),
        signature,
        msgBuf
    ])

    return version + appId + Buffer.from(content).toString('base64')
}

module.exports = { generateToken }