// Demo seed for a live walkthrough: verified doctors + cases + responses.
// Prints a JWT + doctor JSON so a session can be injected in the browser
// (bypasses the email-OTP login for local demos only).
require('dotenv').config()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const pw = await bcrypt.hash('demopassword123', 12)
    const mk = (over) => ({
        password: pw, verified: true, verificationStatus: 'verified', ...over,
    })

    const docs = [
        mk({ name: 'Dr. Aisha Okafor', email: 'demo.okafor@doclink.dev', license: 'GMC-7712345', hospital: 'St. Thomas Hospital', specialty: 'Cardiology', country: 'GB', medicalCouncil: 'General Medical Council (GMC)', reputation: 320, cmeCredits: 41.5, verificationStatus: 'council_verified' }),
        mk({ name: 'Dr. Marco Rossi', email: 'demo.rossi@doclink.dev', license: 'US-1477889900', hospital: 'Mayo Clinic', specialty: 'Neurology', country: 'US', medicalCouncil: 'State Medical Board / NPI', reputation: 210, cmeCredits: 27 }),
        mk({ name: 'Dr. Priya Nair', email: 'demo.nair@doclink.dev', license: 'NMC-2018-55231', hospital: 'AIIMS Delhi', specialty: 'Cardiology', country: 'IN', medicalCouncil: 'National Medical Commission (NMC)', reputation: 175, cmeCredits: 19, availability: 'available', availabilityUpdatedAt: new Date() }),
        mk({ name: 'Dr. Chen Wei', email: 'demo.chen@doclink.dev', license: 'SG-99123', hospital: 'Singapore General', specialty: 'Oncology', country: 'SG', medicalCouncil: 'Singapore Medical Council (SMC)', reputation: 260, cmeCredits: 33, availability: 'available', availabilityUpdatedAt: new Date() }),
    ]

    const created = []
    for (const d of docs) {
        const doc = await prisma.doctor.upsert({ where: { email: d.email }, update: d, create: d })
        created.push(doc)
    }
    const [okafor, rossi, nair, chen] = created

    const cases = [
        { doctorId: okafor.id, tag: 'Cardiology', country: 'GB', title: '62F, progressive dyspnoea & raised BNP', question: 'Preserved EF with grade II diastolic dysfunction. Best next step for suspected HFpEF?', age: 62, sex: 'Female', urgency: 'urgent' },
        { doctorId: nair.id, tag: 'Cardiology', country: 'IN', title: '58M exertional dyspnoea, elevated BNP, preserved EF', question: 'Query HFpEF vs constrictive physiology. Which imaging next?', age: 58, sex: 'Male', urgency: 'routine' },
        { doctorId: okafor.id, tag: 'Cardiology', country: 'GB', title: '70F new AF with fast ventricular response', question: 'Rate vs rhythm control in an elderly patient with HFpEF?', age: 70, sex: 'Female', urgency: 'urgent' },
        { doctorId: rossi.id, tag: 'Neurology', country: 'US', title: '34M thunderclap headache, normal CT', question: 'CT negative at 8h. Do I still need LP for SAH?', age: 34, sex: 'Male', urgency: 'critical' },
        { doctorId: rossi.id, tag: 'Neurology', country: 'US', title: '45F worsening headache with papilloedema', question: 'Suspected IIH. Workup and threshold for shunting?', age: 45, sex: 'Female', urgency: 'urgent' },
        { doctorId: chen.id, tag: 'Oncology', country: 'SG', title: '55M incidental lung nodule 9mm', question: 'Solid 9mm nodule, smoker. Fleischner follow-up vs PET?', age: 55, sex: 'Male', urgency: 'routine' },
        // extra Cardiology/GB volume to demonstrate a signal spike above the k-anonymity floor
        { doctorId: okafor.id, tag: 'Cardiology', country: 'GB', title: '64F HFpEF with volume overload', question: 'Diuretic strategy in decompensated HFpEF?', age: 64, sex: 'Female', urgency: 'urgent' },
        { doctorId: okafor.id, tag: 'Cardiology', country: 'GB', title: '59M cardiorenal syndrome, preserved EF', question: 'Balancing decongestion and renal function in HFpEF?', age: 59, sex: 'Male', urgency: 'urgent' },
    ]

    for (const c of cases) {
        const country = c.country; delete c.country
        const exists = await prisma.case.findFirst({ where: { title: c.title } })
        const cs = exists || await prisma.case.create({ data: { ...c, history: 'De-identified demo history.', examination: 'Demo exam.', investigations: 'Demo investigations.' } })
        // ensure at least one response (a teaching point + case-twin signal)
        const rc = await prisma.response.count({ where: { caseId: cs.id } })
        if (rc === 0) {
            const responder = created.find(d => d.id !== cs.doctorId && d.specialty === cs.tag) || created.find(d => d.id !== cs.doctorId)
            await prisma.response.create({ data: { caseId: cs.id, doctorId: responder.id, helpful: 4, text: 'Consensus: confirm the diagnosis with the targeted test above, optimise guideline-directed therapy, and arrange specialist follow-up. Escalate if red-flag features develop.' } })
        }
    }

    const token = jwt.sign({ doctorId: okafor.id, verified: true, isAdmin: okafor.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' })
    const doctorPayload = { id: okafor.id, name: okafor.name, email: okafor.email, specialty: okafor.specialty, hospital: okafor.hospital, verified: true, verificationStatus: okafor.verificationStatus, country: okafor.country, isAdmin: okafor.isAdmin, availability: okafor.availability }

    console.log('SEED_OK')
    console.log('TOKEN=' + token)
    console.log('DOCTOR=' + JSON.stringify(doctorPayload))
    console.log('OKAFOR_ID=' + okafor.id)
    await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
