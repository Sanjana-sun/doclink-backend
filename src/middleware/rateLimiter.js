const rateLimit = require('express-rate-limit')

const WHITELIST = ['49.43.227.185']

// Coarse DoS guard across all /api traffic. Kept generous on purpose: a
// data-heavy SPA session (dashboard + browsing + SSE + votes) makes hundreds of
// requests, and hospital networks NAT many doctors to one public IP. Real abuse
// (scraping, honeypot access) is caught precisely by the app-level detectors.
const general = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => WHITELIST.includes(req.ip),
})

// Tighter guard on auth (OTP send / login) to blunt brute force, but not so
// tight that a mistyped code or a shared IP locks legitimate users out.
const auth = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
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