const rateLimit = require('express-rate-limit')

const general = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
})

const auth = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // only 10 login attempts per 15 min
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
})

const api = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: { error: 'Rate limit exceeded.' },
    standardHeaders: true,
    legacyHeaders: false,
})

module.exports = { general, auth, api }