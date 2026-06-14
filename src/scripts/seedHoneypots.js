const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const honeypotCases = [
    {
        title: '67F with progressive memory loss and behavioral changes',
        tag: 'Neurology',
        urgency: 'routine',
        age: 67,
        sex: 'Female',
        history: 'Progressive memory loss over 18 months. Family reports personality changes, difficulty with daily tasks. Gets lost in familiar places. No prior psychiatric history. Hypertension on amlodipine.',
        examination: 'MMSE 19/30. Oriented to person only. Word finding difficulty. Apraxia present. No focal neurological deficits. BP 138/82.',
        investigations: 'MRI brain: bilateral hippocampal atrophy, posterior cortical thinning. CSF: amyloid beta 42 reduced, tau elevated. PET scan: hypometabolism in temporoparietal regions.',
        question: 'Likely Alzheimer\'s dementia. Best approach for disease-modifying therapy? Family asking about lecanemab — appropriate candidate?',
    },
    {
        title: '34M with recurrent DVT and family history of thrombosis',
        tag: 'Hematology',
        urgency: 'urgent',
        age: 34,
        sex: 'Male',
        history: 'Second DVT in 3 years. First episode unprovoked at age 31. Father had PE at 45. No malignancy. Non-smoker. BMI 24. Currently on warfarin INR 2.1.',
        examination: 'Left calf swelling and tenderness. Homans sign positive. No varicosities. No lymphadenopathy.',
        investigations: 'Doppler USS: acute DVT left popliteal vein extending to femoral. FBC normal. Thrombophilia screen: Factor V Leiden heterozygous. Protein C/S normal. Antiphospholipid negative.',
        question: 'Factor V Leiden with recurrent DVT — indefinite anticoagulation? Switch to DOAC? Any role for thrombophilia counseling for siblings?',
    },
    {
        title: '52F post-thyroidectomy with hypocalcemia and tetany',
        tag: 'Endocrinology',
        urgency: 'critical',
        age: 52,
        sex: 'Female',
        history: 'Day 2 post total thyroidectomy for multinodular goitre. Developed perioral tingling, carpopedal spasm. No prior calcium issues.',
        examination: 'Trousseau sign positive. Chvostek sign positive. Carpopedal spasm bilateral. BP 124/78. No stridor.',
        investigations: 'Corrected calcium 1.82 mmol/L. PTH <1 pg/mL. Phosphate elevated. Magnesium 0.71 mmol/L. ECG: prolonged QTc 498ms.',
        question: 'Hypoparathyroidism post thyroidectomy. IV vs oral calcium replacement? When to start calcitriol? Monitoring protocol?',
    },
]

async function seedHoneypots() {
    // Get a verified doctor to assign as author (use first admin)
    const admin = await prisma.doctor.findFirst({ where: { isAdmin: true } })
    if (!admin) { console.error('No admin found'); process.exit(1) }

    let created = 0
    for (const c of honeypotCases) {
        const existing = await prisma.case.findFirst({ where: { title: c.title, isHoneypot: true } })
        if (existing) { console.log(`Skipping existing honeypot: ${c.title}`); continue }

        await prisma.case.create({
            data: { ...c, doctorId: admin.id, isHoneypot: true }
        })
        created++
        console.log(`Created honeypot: ${c.title}`)
    }

    console.log(`Done. Created ${created} honeypot cases.`)
    await prisma.$disconnect()
}

seedHoneypots().catch(console.error)