const rateLimit = require('express-rate-limit')

const WHITELIST = ['49.43.227.185']

const general = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => WHITELIST.includes(req.ip),
})

const auth = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => WHITELIST.includes(req.ip),
})

const api = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { error: 'Rate limit exceeded.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => WHITELIST.includes(req.ip),
})

module.exports = { general, auth, api }