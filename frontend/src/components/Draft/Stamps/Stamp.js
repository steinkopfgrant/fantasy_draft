// index.js
// Export all stamp components

export { default as MatrixStamp } from './MatrixStamp';
export { default as GoldStamp } from './GoldStamp';

// Stamp IDs for the backend/cosmetic system
export const STAMP_IDS = {
  MATRIX: 'beta_tester',
  GOLD: 'cash_king'
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
    default:
      return null; // No stamp / default card
  }
};