const helmet = require('helmet')
const xss = require('xss-clean')

const sanitizeInput = (req, res, next) => {
    if (req.body) {
        const sanitize = (obj) => {
            Object.keys(obj).forEach(key => {
                if (typeof obj[key] === 'string') {
                    // Remove any $ or . from keys (NoSQL injection prevention)
                    obj[key] = obj[key].replace(/\$|\./g, '')
                    // Strip script tags
                    obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitize(obj[key])
                }
            })
        }
        sanitize(req.body)
    }
    next()
}

module.exports = { helmet, xss, sanitizeInput }