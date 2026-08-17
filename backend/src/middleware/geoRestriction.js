// backend/src/middleware/geoRestriction.js
// Restricts paid contests to an explicit list of eligible jurisdictions.
// Uses Cloudflare regional headers for IP-based geolocation.
//
// ALLOWLIST, NOT A BLOCKLIST.
// Anything not named below is ineligible by default. This is deliberate: a
// blocklist fails OPEN — a jurisdiction nobody remembered to add, or one that
// starts regulating next session, is silently permitted. An allowlist fails
// CLOSED. For a real-money contest that is the only safe default.
//
// This list MUST stay in sync with ELIGIBLE_JURISDICTIONS in
// frontend/src/components/Rules/RulesPage.js. The rules page publishes this
// list to users; if the two disagree, the published rules are wrong.
//
// Confirm with DFS counsel before changing this list.

const ELIGIBLE_STATES = [
  'AL', // Alabama
  'AK', // Alaska
  'DC', // District of Columbia
  'FL', // Florida
  'GA', // Georgia
  'IL', // Illinois
  'KS', // Kansas (statutory exemption)
  'KY', // Kentucky
  'MN', // Minnesota
  'NE', // Nebraska
  'NM', // New Mexico
  'NC', // North Carolina
  'ND', // North Dakota
  'OK', // Oklahoma (see tribal-lands note below)
  'OR', // Oregon
  'RI', // Rhode Island
  'SC', // South Carolina (elevated caution)
  'SD', // South Dakota (elevated caution)
  'UT', // Utah (elevated caution — 2026 amendments)
  'WV', // West Virginia
  'WI', // Wisconsin
  'WY', // Wyoming (home state)
];

// NOTE — Oklahoma: counsel flagged a tribal-lands qualifier. Cloudflare region
// headers resolve to state level only and cannot distinguish tribal lands, so
// this middleware permits Oklahoma statewide. If sub-state handling is
// required, it needs a different geolocation source and must be resolved
// before launch.

const ELIGIBLE_SET = new Set(ELIGIBLE_STATES);

// Full US map so ineligible-state messaging can name any region Cloudflare
// reports, not just the ones that happen to be eligible.
const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  // Territories Cloudflare may report
  PR: 'Puerto Rico', VI: 'U.S. Virgin Islands', GU: 'Guam',
  AS: 'American Samoa', MP: 'Northern Mariana Islands',
};

// In strict mode (production), missing headers = block. In dev = allow.
const STRICT_GEO = process.env.STRICT_GEO === 'true' || process.env.NODE_ENV === 'production';

// Pure function — reads CF headers and returns geo decision
// Returns { allowed: bool, reason: string, state: string|null, country: string|null }
function checkIpGeo(req) {
  const country = req.headers['cf-ipcountry'];
  const region = (req.headers['cf-region-code'] || '').toUpperCase();

  // No headers — likely local dev or CF not configured
  if (!country || !region) {
    if (STRICT_GEO) {
      console.log(`🚫 Geo headers missing in strict mode. IP: ${req.headers['cf-connecting-ip'] || req.ip}`);
      return { allowed: false, reason: 'geo_unknown', state: null, country: null };
    }
    console.log('⚠️ Geo headers missing (allowing in non-strict/dev mode)');
    return { allowed: true, reason: 'dev_bypass', state: null, country: null };
  }

  // Block non-US
  if (country !== 'US') {
    console.log(`🌍 Blocked non-US entry from ${country}`);
    return { allowed: false, reason: 'non_us', state: null, country };
  }

  // ALLOWLIST: anything not explicitly eligible is blocked.
  if (!ELIGIBLE_SET.has(region)) {
    console.log(`🚫 Blocked entry from ineligible state: ${region}`);
    return { allowed: false, reason: 'ineligible_state', state: region, country };
  }

  return { allowed: true, reason: 'ok', state: region, country };
}

// Main middleware — works for both authenticated routes (contest entry)
// and public routes (signup). No user lookup required.
const geoRestriction = (req, res, next) => {
  try {
    const ipCheck = checkIpGeo(req);

    if (!ipCheck.allowed) {
      if (ipCheck.reason === 'non_us') {
        return res.status(403).json({
          success: false,
          error: 'BidBlitz is only available to users physically located in eligible US states.',
          code: 'GEO_NON_US'
        });
      }
      if (ipCheck.reason === 'ineligible_state') {
        return res.status(403).json({
          success: false,
          error: `BidBlitz is not currently available in ${STATE_NAMES[ipCheck.state] || ipCheck.state}. We're working on expanding to more states.`,
          // Code preserved for backward compatibility with existing clients.
          code: 'GEO_BLOCKED_STATE',
          state: ipCheck.state
        });
      }
      if (ipCheck.reason === 'geo_unknown') {
        return res.status(403).json({
          success: false,
          error: 'Unable to verify your location. Please disable any VPN or proxy and try again.',
          code: 'GEO_UNKNOWN'
        });
      }
    }

    // Attach detected state to request for downstream use
    if (ipCheck.state) {
      req.detectedState = ipCheck.state;
      req.userState = ipCheck.state;
    }

    next();
  } catch (error) {
    console.error('❌ Geo restriction check failed:', error);
    // FAIL CLOSED — don't let errors open the gate
    return res.status(503).json({
      success: false,
      error: 'Unable to verify your location at this time. Please try again.',
      code: 'GEO_ERROR'
    });
  }
};

module.exports = {
  geoRestriction,
  ELIGIBLE_STATES,
  ELIGIBLE_SET,
  STATE_NAMES,
  checkIpGeo
};