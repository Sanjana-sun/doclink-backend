const jwt = require('jsonwebtoken')

module.exports = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1]
            || req.query.token
        if (!token) return res.status(401).json({ error: 'No token provided' })
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.doctorId = decoded.doctorId
        req.verified = decoded.verified
        req.isAdmin = decoded.isAdmin
        next()
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' })
    }
}