// Stamp.js
import MatrixStamp from './MatrixStamp';
import GoldStamp from './GoldStamp';
import BlitzStamp from './BlitzStamp';

export { MatrixStamp, GoldStamp, BlitzStamp };

// Stamp IDs for the backend/cosmetic system
export const STAMP_IDS = {
  MATRIX: 'beta_tester',
  GOLD: 'cash_king',
  BLITZ: 'blitz'
};

// Helper to get the right stamp component by ID
export const getStampComponent = (stampId) => {
  switch (stampId) {
    case 'beta_tester':
    case 'matrix':
      return MatrixStamp;
    case 'cash_king':
    case 'gold':
      return GoldStamp;
    case 'blitz':
    case 'bidblitz':
      return BlitzStamp;
    default:
      return null;
  }
};