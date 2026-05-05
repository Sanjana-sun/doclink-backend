const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

const sendWelcomeEmail = async ({ name, email }) => {
    try {
        await resend.emails.send({
            from: 'DocLink <onboarding@resend.dev>',
            to: email,
            subject: 'Welcome to DocLink — Verification in progress',
            html: `
        <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="margin-bottom: 32px;">
            <span style="font-size: 24px; font-weight: 600; color: #1a1a18;">Doc</span><span style="font-size: 24px; font-weight: 600; color: #0a8f6e;">Link</span>
          </div>
          
          <h1 style="font-size: 28px; font-weight: 400; color: #1a1a18; margin-bottom: 16px;">
            Welcome, ${name} 👋
          </h1>
          
          <p style="font-size: 16px; color: #6b6b62; line-height: 1.7; margin-bottom: 24px;">
            Your DocLink account has been created successfully. We're now verifying your medical license and hospital affiliation.
          </p>

          <div style="background: #f7f7f5; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="font-size: 13px; font-weight: 500; color: #a0a097; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px;">Verification steps</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 18px;">✅</span>
                <span style="font-size: 15px; color: #1a1a18; font-weight: 500;">Account created</span>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 18px;">🔄</span>
                <span style="font-size: 15px; color: #6b6b62;">Medical license verification</span>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 18px;">⏳</span>
                <span style="font-size: 15px; color: #6b6b62;">Hospital affiliation check</span>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 18px;">⏳</span>
                <span style="font-size: 15px; color: #6b6b62;">Account activation</span>
              </div>
            </div>
          </div>

          <p style="font-size: 15px; color: #6b6b62; line-height: 1.7; margin-bottom: 32px;">
            This usually takes <strong style="color: #1a1a18;">1–2 business days</strong>. You'll receive another email once your account is fully activated.
          </p>

          <a href="https://www.doclink.in/dashboard" style="display: inline-block; background: #0a8f6e; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 500;">
            Preview dashboard →
          </a>

          <p style="font-size: 13px; color: #a0a097; margin-top: 40px; padding-top: 24px; border-top: 1px solid #f0efec;">
            DocLink · The doctor collaboration network · <a href="https://www.doclink.in" style="color: #0a8f6e;">doclink.in</a>
          </p>
        </div>
      `
        })
        console.log(`Welcome email sent to ${email}`)
    } catch (err) {
        console.error('Email send failed:', err)
    }
}

const sendVerificationApprovedEmail = async ({ name, email }) => {
    try {
        await resend.emails.send({
            from: 'DocLink <onboarding@resend.dev>',
            to: email,
            subject: 'Your DocLink account is verified ✅',
            html: `
        <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="margin-bottom: 32px;">
            <span style="font-size: 24px; font-weight: 600; color: #1a1a18;">Doc</span><span style="font-size: 24px; font-weight: 600; color: #0a8f6e;">Link</span>
          </div>
          
          <h1 style="font-size: 28px; font-weight: 400; color: #1a1a18; margin-bottom: 16px;">
            You're verified, ${name}! 🎉
          </h1>
          
          <p style="font-size: 16px; color: #6b6b62; line-height: 1.7; margin-bottom: 24px;">
            Your medical license and hospital affiliation have been verified. You now have full access to DocLink.
          </p>

          <div style="background: #e6f5f0; border: 1px solid rgba(10,143,110,0.2); border-radius: 12px; padding: 24px; margin-bottom: 32px;">
            <p style="font-size: 15px; color: #0a8f6e; margin: 0;">
              ✅ You can now post cases, respond to peers, earn CME credits, and collaborate with specialists globally.
            </p>
          </div>

          <a href="https://www.doclink.in/dashboard" style="display: inline-block; background: #0a8f6e; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 500;">
            Go to dashboard →
          </a>

          <p style="font-size: 13px; color: #a0a097; margin-top: 40px; padding-top: 24px; border-top: 1px solid #f0efec;">
            DocLink · The doctor collaboration network · <a href="https://www.doclink.in" style="color: #0a8f6e;">doclink.in</a>
          </p>
        </div>
      `
        })
        console.log(`Verification approved email sent to ${email}`)
    } catch (err) {
        console.error('Email send failed:', err)
    }
}

module.exports = { sendWelcomeEmail, sendVerificationApprovedEmail }