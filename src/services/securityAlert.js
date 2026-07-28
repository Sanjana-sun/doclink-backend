const { createBlock } = require('./blockchain')

// Flag a doctor for admin review (access is retained) and anchor the event on
// the tamper-evident chain. Used by the honeypot tripwire and the scraping
// detector. Never throws — security instrumentation must not break the request.
async function raiseFlag(db, { doctorId, reason, blockAction, blockData }) {
    try {
        await createBlock(db, {
            action: blockAction,
            entityType: 'Doctor',
            entityId: doctorId,
            doctorId,
            data: blockData || {},
        })
    } catch (e) { console.error('Security chain anchor failed (non-fatal):', e) }
    try {
        await db.doctor.update({
            where: { id: doctorId },
            data: { flagged: true, flaggedReason: reason, flaggedAt: new Date() },
        })
    } catch (e) { console.error('Flagging doctor failed (non-fatal):', e) }
}

// Send a security alert email to the configured recipient. Rows is an array of
// [label, value] pairs. Never throws.
async function sendAlertEmail({ subject, heading, intro, rows, ctaUrl }) {
    try {
        const { Resend } = require('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const to = process.env.SECURITY_ALERT_EMAIL || 'noreply@doclink.in'
        const rowsHtml = (rows || []).map(([k, v]) =>
            `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;"><strong>${k}</strong></td><td style="padding:8px 12px;border:1px solid #e5e7eb;">${v ?? 'unknown'}</td></tr>`
        ).join('')
        await resend.emails.send({
            from: 'noreply@doclink.in',
            to,
            subject,
            html: `
        <div style="font-family: sans-serif; padding: 2rem; max-width: 560px;">
          <h2 style="color: #ef4444; margin-bottom: 1rem;">${heading}</h2>
          <p style="color: #6b6b62; margin-bottom: 1.5rem;">${intro}</p>
          <table style="border-collapse: collapse; width: 100%; margin-bottom: 1.5rem;">${rowsHtml}</table>
          <a href="${ctaUrl || 'https://www.doclink.in/admin'}" style="display:inline-block;background:#ef4444;color:#fff;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:500;">Review in Admin Panel →</a>
        </div>`,
        })
    } catch (e) { console.error('Security alert email failed (non-fatal):', e) }
}

module.exports = { raiseFlag, sendAlertEmail }
