const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

const otpStore = new Map() // in-memory store: email -> { otp, expires }

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

const sendOTP = async (email, name) => {
    const otp = generateOTP()
    const expires = Date.now() + 10 * 60 * 1000 // 10 minutes

    otpStore.set(email, { otp, expires })

    await resend.emails.send({
        from: 'noreply@doclink.in',
        to: email,
        subject: 'Your DocLink login code',
        html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
        <h2 style="font-size: 1.25rem; color: #1a1a18; margin-bottom: 0.5rem;">DocLink login code</h2>
        <p style="color: #6b6b62; margin-bottom: 2rem;">Hi Dr. ${name}, use this code to complete your login. It expires in 10 minutes.</p>
        <div style="background: #f5f3ef; border-radius: 10px; padding: 1.5rem; text-align: center; margin-bottom: 2rem;">
          <span style="font-size: 2.5rem; font-weight: 700; letter-spacing: 0.2em; color: #0a8f6e;">${otp}</span>
        </div>
        <p style="color: #a0a097; font-size: 0.85rem;">If you didn't request this, someone may be trying to access your account. Contact us immediately at support@doclink.in</p>
      </div>
    `
    })

    return otp
}

const verifyOTP = (email, otp) => {
    const stored = otpStore.get(email)
    if (!stored) return { valid: false, reason: 'No OTP found' }
    if (Date.now() > stored.expires) {
        otpStore.delete(email)
        return { valid: false, reason: 'OTP expired' }
    }
    if (stored.otp !== otp) return { valid: false, reason: 'Invalid OTP' }
    otpStore.delete(email)
    return { valid: true }
}

module.exports = { sendOTP, verifyOTP }