const { byCode } = require('../data/councils')

// US: CMS NPI Registry — free public API, no key required.
// https://npiregistry.cms.hhs.gov/api/?version=2.1&number=<npi>
const checkNPI = async (npi, name) => {
    const number = String(npi || '').replace(/\D/g, '')
    if (number.length !== 10) {
        return { matched: false, reason: 'NPI must be a 10-digit number' }
    }
    const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${number}`
    const resp = await fetch(url)
    const data = await resp.json()
    const rec = data?.results?.[0]
    if (!rec) return { matched: false, reason: 'No NPI record found' }

    const basic = rec.basic || {}
    const registeredName = [basic.first_name, basic.last_name].filter(Boolean).join(' ').trim()
    // NPI-1 = individual provider; 'A' = active
    const isIndividual = rec.enumeration_type === 'NPI-1'
    const active = (basic.status || 'A') === 'A'

    // Loose name cross-check: does a surname from the record appear in the doctor's name?
    const supplied = String(name || '').toLowerCase()
    const nameLikelyMatches = !registeredName || [basic.first_name, basic.last_name]
        .filter(Boolean)
        .some(part => supplied.includes(String(part).toLowerCase()))

    return {
        matched: isIndividual && active,
        registeredName: registeredName || null,
        taxonomy: rec.taxonomies?.find(t => t.primary)?.desc || rec.taxonomies?.[0]?.desc || null,
        active,
        nameLikelyMatches,
        number,
    }
}

// Verification model B extension point: automated register lookups.
// Returns { automatable, checked, matched?, ... }. Countries without an
// integration return checked:false with a reviewer link (manual fallback).
const checkRegistration = async ({ country, registrationNumber, name }) => {
    const c = byCode[country] || byCode.OTHER
    try {
        if (country === 'US') {
            const npi = await checkNPI(registrationNumber, name)
            return { automatable: true, checked: true, council: c.council, verifyUrl: c.verifyUrl, ...npi }
        }
        if (country === 'GB') {
            // The GMC has no free public API — its LRMP is search-only and the
            // machine-readable feed is a licensed product. So we validate the
            // reference-number format and deep-link the reviewer to the register.
            // To fully automate: subscribe to the GMC data feed and query it here,
            // then return { checked: true, matched, registeredName, status }.
            const ref = String(registrationNumber || '').replace(/\D/g, '')
            const validFormat = ref.length === 7 // GMC reference numbers are 7 digits
            return {
                automatable: true,
                checked: false,
                council: c.council,
                verifyUrl: c.verifyUrl,
                validFormat,
                manualUrl: 'https://www.gmc-uk.org/doctors/register/find-a-doctor',
                reason: validFormat
                    ? 'Valid GMC reference format — confirm on the register (no free GMC API).'
                    : 'GMC reference should be 7 digits.',
            }
        }
        // Add more countries here: AU (AHPRA), CA (provincial colleges), etc.
    } catch (err) {
        return { automatable: !!c.api, checked: false, error: 'Register lookup failed', council: c.council, verifyUrl: c.verifyUrl }
    }
    return { automatable: !!c.api, checked: false, council: c.council, verifyUrl: c.verifyUrl }
}

module.exports = { checkRegistration }
