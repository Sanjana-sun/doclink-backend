const express = require('express')
const auth = require('../middleware/auth')

const router = express.Router()

// Fetch clinical trials from ClinicalTrials.gov
const fetchClinicalTrials = async (specialty) => {
    try {
        const specialtyMap = {
            'Cardiology': 'heart cardiovascular cardiac',
            'Neurology': 'neurology brain stroke seizure',
            'Oncology': 'cancer tumor oncology',
            'Pulmonology': 'lung pulmonary respiratory',
            'Gastroenterology': 'gastro intestinal liver',
            'Nephrology': 'kidney renal nephrology',
            'Endocrinology': 'diabetes endocrine thyroid',
            'Rheumatology': 'arthritis rheumatology autoimmune',
            'General Medicine': 'medicine clinical',
        }
        const query = specialtyMap[specialty] || 'medicine clinical'
        const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=5&sort=LastUpdatePostDate&fields=NCTId,BriefTitle,OverallStatus,Phase,StartDate,BriefSummary,Condition,LeadSponsorName`
        const res = await fetch(url)
        const data = await res.json()
        return (data.studies || []).map(s => ({
            id: s.protocolSection?.identificationModule?.nctId,
            title: s.protocolSection?.identificationModule?.briefTitle,
            status: s.protocolSection?.statusModule?.overallStatus,
            phase: s.protocolSection?.designModule?.phases?.[0] || 'N/A',
            condition: s.protocolSection?.conditionsModule?.conditions?.[0],
            sponsor: s.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name,
            summary: s.protocolSection?.descriptionModule?.briefSummary?.slice(0, 200),
            url: `https://clinicaltrials.gov/study/${s.protocolSection?.identificationModule?.nctId}`,
            type: 'trial'
        }))
    } catch (err) {
        console.error('ClinicalTrials fetch error:', err)
        return []
    }
}

// Fetch research papers from PubMed
const fetchPubMed = async (specialty) => {
    try {
        const specialtyMap = {
            'Cardiology': 'cardiology+heart+disease',
            'Neurology': 'neurology+brain+stroke',
            'Oncology': 'cancer+oncology+tumor',
            'Pulmonology': 'pulmonology+lung+respiratory',
            'Gastroenterology': 'gastroenterology+liver',
            'Nephrology': 'nephrology+kidney+renal',
            'Endocrinology': 'endocrinology+diabetes',
            'Rheumatology': 'rheumatology+arthritis',
            'General Medicine': 'internal+medicine+clinical',
        }
        const query = specialtyMap[specialty] || 'internal+medicine'

        // Search for IDs
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${query}&retmax=5&sort=date&retmode=json`
        const searchRes = await fetch(searchUrl)
        const searchData = await searchRes.json()
        const ids = searchData.esearchresult?.idlist || []

        if (ids.length === 0) return []

        // Fetch summaries
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`
        const summaryRes = await fetch(summaryUrl)
        const summaryData = await summaryRes.json()

        return ids.map(id => {
            const article = summaryData.result?.[id]
            if (!article) return null
            return {
                id,
                title: article.title,
                authors: article.authors?.slice(0, 3).map(a => a.name).join(', '),
                journal: article.fulljournalname,
                date: article.pubdate,
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}`,
                type: 'research'
            }
        }).filter(Boolean)
    } catch (err) {
        console.error('PubMed fetch error:', err)
        return []
    }
}

// Get knowledge feed
router.get('/', auth, async (req, res) => {
    try {
        const { specialty = 'General Medicine' } = req.query
        const [trials, papers] = await Promise.all([
            fetchClinicalTrials(specialty),
            fetchPubMed(specialty)
        ])
        res.json({ trials, papers })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router