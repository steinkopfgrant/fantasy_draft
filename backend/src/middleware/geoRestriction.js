// backend/src/middleware/geoRestriction.js
// Blocks users from states where paid DFS is prohibited

const BLOCKED_STATES = [
  'MT', // Montana
  'ID', // Idaho
  'LA', // Louisiana
  'NV', // Nevada
  'WA', // Washington
];

// Confirm with your DFS lawyer — this list may need updating
const STATE_NAMES = {
  MT: 'Montana', ID: 'Idaho', LA: 'Louisiana',
  NV: 'Nevada', WA: 'Washington'
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

    const userState = user.state.toUpperCase();

    if (BLOCKED_STATES.includes(userState)) {
      return res.status(403).json({
        success: false,
        error: `Paid fantasy sports contests are not available in ${STATE_NAMES[userState] || userState}. This is required by state law.`
      });
    }

    next();
  } catch (error) {
    console.error('Geo restriction check failed:', error);
    next(); // Fail open — don't block users due to a server error
  }
};

module.exports = { geoRestriction, BLOCKED_STATES };