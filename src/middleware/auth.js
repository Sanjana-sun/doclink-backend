const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.doctorId = decoded.id
        next()
    } catch {
        res.status(401).json({ error: 'Invalid token' })
    }
}

// Separate middleware for verified doctors only
module.exports.verifiedOnly = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.doctorId = decoded.id
        req.verified = decoded.verified
        if (!decoded.verified) return res.status(403).json({ error: 'Account pending verification' })
        next()
    } catch {
        res.status(401).json({ error: 'Invalid token' })
    }
}