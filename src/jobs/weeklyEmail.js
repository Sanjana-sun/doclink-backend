const cron = require('node-cron')
const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

let prisma
const getPrisma = async () => {
    if (!prisma) {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
    }
    return prisma
}

const getWeeklyTop10 = async () => {
    const db = await getPrisma()
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    const doctors = await db.doctor.findMany({
        where: { verified: true },
        select: {
            id: true, name: true, email: true, specialty: true, hospital: true,
            reputation: true, cmeCredits: true,
            _count: { select: { cases: true, responses: true } }
        }
    })

    const scored = doctors.map(d => ({
        ...d,
        score: d._count.cases * 10 + d._count.responses * 15 + d.cmeCredits * 20 + d.reputation
    })).sort((a, b) => b.score - a.score).slice(0, 10)

    return scored
}

const sendWeeklyEmails = async () => {
    try {
        console.log('Running weekly top 10 email job...')
        const top10 = await getWeeklyTop10()

        // Send individual emails to each top 10 doctor
        for (let i = 0; i < top10.length; i++) {
            const doctor = top10[i]
            const rank = i + 1
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`

            await resend.emails.send({
                from: 'noreply@doclink.in',
                to: doctor.email,
                subject: `${medal} You're #${rank} on DocLink this week!`,
                html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 2rem; color: #1a1a18;">
            <div style="margin-bottom: 2rem;">
              <span style="font-family: Georgia, serif; font-size: 1.5rem; color: #1a1a18;">Doc<span style="color: #0a8f6e;">Link</span></span>
            </div>

            <h1 style="font-family: Georgia, serif; font-size: 1.75rem; font-weight: 400; color: #1a1a18; margin-bottom: 0.5rem;">
              You're ranked #${rank} this week
            </h1>
            <p style="color: #6b6b62; margin-bottom: 2rem; line-height: 1.7;">
              Hi Dr. ${doctor.name}, your contributions to the DocLink community this week have earned you a spot in the top 10. Thank you for helping your peers deliver better care.
            </p>

            <div style="background: #f5f3ef; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                  <div style="font-size: 0.75rem; color: #a0a097; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Weekly rank</div>
                  <div style="font-family: Georgia, serif; font-size: 2rem; color: #0a8f6e;">#${rank}</div>
                </div>
                <div>
                  <div style="font-size: 0.75rem; color: #a0a097; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Score</div>
                  <div style="font-family: Georgia, serif; font-size: 2rem; color: #1a1a18;">${Math.round(doctor.score)}</div>
                </div>
                <div>
                  <div style="font-size: 0.75rem; color: #a0a097; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">CME Credits</div>
                  <div style="font-family: Georgia, serif; font-size: 1.5rem; color: #1a1a18;">${doctor.cmeCredits.toFixed(1)}</div>
                </div>
                <div>
                  <div style="font-size: 0.75rem; color: #a0a097; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Responses</div>
                  <div style="font-family: Georgia, serif; font-size: 1.5rem; color: #1a1a18;">${doctor._count.responses}</div>
                </div>
              </div>
            </div>

            <div style="margin-bottom: 2rem;">
              <h2 style="font-family: Georgia, serif; font-size: 1.1rem; font-weight: 400; color: #1a1a18; margin-bottom: 1rem;">This week's top 10</h2>
              ${top10.map((d, idx) => `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px solid #f0efec;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 0.875rem; color: #a0a097; width: 24px;">#${idx + 1}</span>
                    <span style="font-size: 0.875rem; color: ${d.id === doctor.id ? '#0a8f6e' : '#1a1a18'}; font-weight: ${d.id === doctor.id ? '600' : '400'};">
                      Dr. ${d.name}
                    </span>
                  </div>
                  <span style="font-size: 0.825rem; color: #6b6b62;">${Math.round(d.score)} pts</span>
                </div>
              `).join('')}
            </div>

            <a href="https://www.doclink.in/leaderboard" style="display: inline-block; padding: 0.875rem 2rem; background: #0a8f6e; color: #fff; text-decoration: none; border-radius: 9px; font-size: 0.9rem; font-weight: 500; margin-bottom: 2rem;">
              View full leaderboard →
            </a>

            <p style="font-size: 0.8rem; color: #a0a097; line-height: 1.6; border-top: 1px solid #f0efec; padding-top: 1.5rem;">
              You're receiving this because you're a verified doctor on DocLink. To unsubscribe from weekly emails, update your preferences in your profile.
            </p>
          </div>
        `
            })

            console.log(`Sent weekly email to ${doctor.name} (rank #${rank})`)
        }

        console.log('Weekly top 10 email job completed.')
    } catch (err) {
        console.error('Weekly email job error:', err)
    }
}

// Run every Monday at 9am IST (3:30am UTC)
const scheduleWeeklyEmails = () => {
    cron.schedule('30 3 * * 1', sendWeeklyEmails, {
        timezone: 'Asia/Kolkata'
    })
    console.log('Weekly email job scheduled — runs every Monday at 9am IST')
}

module.exports = { scheduleWeeklyEmails, sendWeeklyEmails }