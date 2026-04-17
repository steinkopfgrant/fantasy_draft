// backend/src/middleware/geoRestriction.js
// Blocks users from states where paid DFS is banned or requires licensing

// BANNED: DFS prohibited outright
// LICENSE REQUIRED: Block until you register as an operator
// TAX/NOTIFICATION: Block until you file the paperwork
// Confirm with DFS lawyer before changing this list

const BLOCKED_STATES = [
  // Outright banned
  'HI', // Hawaii
  'ID', // Idaho
  'MT', // Montana
  'NV', // Nevada
  'WA', // Washington
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
  AL: 'Alabama', AZ: 'Arizona', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  IN: 'Indiana', IA: 'Iowa', LA: 'Louisiana', ME: 'Maine', MI: 'Michigan',
  MS: 'Mississippi', MO: 'Missouri', NH: 'New Hampshire', NJ: 'New Jersey',
  NY: 'New York', OH: 'Ohio', PA: 'Pennsylvania', TN: 'Tennessee', VT: 'Vermont',
  VA: 'Virginia', AR: 'Arkansas', MD: 'Maryland', MA: 'Massachusetts'
};

const geoRestriction = async (req, res, next) => {
  try {
    const db = require('../models');
    const user = await db.User.findByPk(req.user.id, {
      attributes: ['id', 'state']
    });

    if (!user || !user.state) {
      return res.status(403).json({
        success: false,
        error: 'Please update your profile with your state of residence before entering paid contests.'
      });
    }

    if (BLOCKED_STATES.includes(user.state.toUpperCase())) {
      return res.status(403).json({
        success: false,
        error: `Paid fantasy sports contests are not currently available in ${STATE_NAMES[user.state.toUpperCase()] || user.state}.`
      });
    }

    next();
  } catch (error) {
    console.error('Geo restriction check failed:', error);
    next();
  }
};

module.exports = { geoRestriction, BLOCKED_STATES };
