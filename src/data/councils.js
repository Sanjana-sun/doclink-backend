// Country → medical-registration authority registry.
// `verifyUrl` is where a reviewer (or, later, an automated integration) checks a
// registration number. `api` flags countries with a machine-checkable public
// register — the hook for verification model B (see services/councilVerify.js).
const COUNCILS = [
    { code: 'IN', country: 'India', council: 'National Medical Commission (NMC)', verifyUrl: 'https://www.nmc.org.in/information-desk/indian-medical-register/', api: false },
    { code: 'US', country: 'United States', council: 'State Medical Board / NPI Registry', verifyUrl: 'https://npiregistry.cms.hhs.gov/', api: true },
    { code: 'GB', country: 'United Kingdom', council: 'General Medical Council (GMC)', verifyUrl: 'https://www.gmc-uk.org/registration-and-licensing/the-medical-register', api: true },
    { code: 'AU', country: 'Australia', council: 'AHPRA', verifyUrl: 'https://www.ahpra.gov.au/registration/registers-of-practitioners.aspx', api: true },
    { code: 'CA', country: 'Canada', council: 'Provincial College of Physicians', verifyUrl: 'https://www.fmrac.ca/', api: false },
    { code: 'AE', country: 'United Arab Emirates', council: 'DHA / MOHAP / DOH', verifyUrl: 'https://www.dha.gov.ae/', api: false },
    { code: 'SG', country: 'Singapore', council: 'Singapore Medical Council (SMC)', verifyUrl: 'https://www.healthprofessionals.gov.sg/smc', api: false },
    { code: 'ZA', country: 'South Africa', council: 'HPCSA', verifyUrl: 'https://www.hpcsa.co.za/', api: false },
    { code: 'NG', country: 'Nigeria', council: 'MDCN', verifyUrl: 'https://www.mdcn.gov.ng/', api: false },
    { code: 'PK', country: 'Pakistan', council: 'PMDC', verifyUrl: 'https://www.pmdc.pk/', api: false },
    { code: 'BD', country: 'Bangladesh', council: 'BMDC', verifyUrl: 'https://bmdc.org.bd/', api: false },
    { code: 'PH', country: 'Philippines', council: 'PRC Board of Medicine', verifyUrl: 'https://www.prc.gov.ph/', api: false },
    { code: 'OTHER', country: 'Other', council: '', verifyUrl: '', api: false },
]

const byCode = Object.fromEntries(COUNCILS.map(c => [c.code, c]))

module.exports = { COUNCILS, byCode }
