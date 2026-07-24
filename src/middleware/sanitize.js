const helmet = require('helmet')
const xss = require('xss-clean')

// Strip <script> tags from string VALUES only. We intentionally do NOT strip
// "." or "$" from values — this is a Postgres/Prisma app (parameterized queries,
// so no NoSQL-injection risk), and stripping dots would corrupt emails, decimals,
// URLs, and license numbers. Must run AFTER express.json() (see index.js).
const SCRIPT = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
const sanitizeInput = (req, res, next) => {
    const walk = (obj) => {
        if (!obj || typeof obj !== 'object') return
        for (const key of Object.keys(obj)) {
            const val = obj[key]
            if (typeof val === 'string') obj[key] = val.replace(SCRIPT, '')
            else if (val && typeof val === 'object') walk(val)
        }
    }
    walk(req.body)
    next()
}

module.exports = { helmet, xss, sanitizeInput }