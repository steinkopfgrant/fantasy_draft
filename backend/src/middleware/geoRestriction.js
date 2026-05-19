// backend/src/middleware/geoRestriction.js
// Blocks users from states where paid DFS is banned or requires licensing
// Uses Cloudflare regional headers for IP-based geolocation
//
// BANNED: DFS prohibited outright
// LICENSE REQUIRED: Block until registered as an operator
// TAX/NOTIFICATION: Block until paperwork filed
// GRAY AREA: AG opinions or contested legal status
// Confirm with DFS lawyer before changing this list

const BLOCKED_STATES = [
  // Outright banned
  'HI', // Hawaii
  'ID', // Idaho
  'MT', // Montana
  'NV', // Nevada
  'WA', // Washington
  // Gray area (AG opinions / contested)
  'CA', // California - July 2025 AG advisory opinion suggests DFS may violate gambling law
  // License/registration required
  'AL', // Alabama
  'AZ', // Arizona
  'CO', // Colorado
  'CT', // Connecticut
  'DE', // Delaware
  'IN', // Indiana
  'IA', // Iowa
  'LA', // Louisiana
  'ME', // Maine
  'MI', // Michigan
  'MS', // Mississippi
  'MO', // Missouri
  'NH', // New Hampshire
  'NJ', // New Jersey
  'NY', // New York
  'OH', // Ohio
  'PA', // Pennsylvania
  'TN', // Tennessee
  'VT', // Vermont
  'VA', // Virginia
  // Tax/notification required
  'AR', // Arkansas
  'MD', // Maryland
  'MA', // Massachusetts
];

const STATE_NAMES = {
  HI: 'Hawaii', ID: 'Idaho', MT: 'Montana', NV: 'Nevada', WA: 'Washington',
  CA: 'California',
  AL: 'Alabama', AZ: 'Arizona', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  IN: 'Indiana', IA: 'Iowa', LA: 'Louisiana', ME: 'Maine', MI: 'Michigan',
  MS: 'Mississippi', MO: 'Missouri', NH: 'New Hampshire', NJ: 'New Jersey',
  NY: 'New York', OH: 'Ohio', PA: 'Pennsylvania', TN: 'Tennessee', VT: 'Vermont',
  VA: 'Virginia', AR: 'Arkansas', MD: 'Maryland', MA: 'Massachusetts'
};

// In strict mode (production), missing headers = block. In dev = allow.
const STRICT_GEO = process.env.STRICT_GEO === 'true' || process.env.NODE_ENV === 'production';

// Pure function — reads CF headers and returns geo decision
// Returns { allowed: bool, reason: string, state: string|null, country: string|null }
function checkIpGeo(req) {
  // DEBUG: log all cf-* headers so we can see what's actually arriving
  const cfHeaders = Object.entries(req.headers)
    .filter(([k]) => k.toLowerCase().startsWith('cf-'))
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
  console.log('🔍 CF headers received:', JSON.stringify(cfHeaders));
  
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
  
  // Block prohibited US states
  if (BLOCKED_STATES.includes(region)) {
    console.log(`🚫 Blocked entry from prohibited state: ${region}`);
    return { allowed: false, reason: 'blocked_state', state: region, country };
  }
  
  console.log(`✅ Geo check passed: ${region}`);
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
      if (ipCheck.reason === 'blocked_state') {
        return res.status(403).json({
          success: false,
          error: `BidBlitz is not currently available in ${STATE_NAMES[ipCheck.state] || ipCheck.state}. We're working on expanding to more states.`,
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
    // (e.g., signup route can auto-fill the user's state field)
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
  BLOCKED_STATES,
  STATE_NAMES,
  checkIpGeo
};