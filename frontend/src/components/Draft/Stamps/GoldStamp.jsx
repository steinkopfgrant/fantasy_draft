import React from 'react';
import './GoldStamp.css';

const GoldStamp = ({ player, pickNumber, showDrafted }) => {
  return (
    <div className="gold-stamp">
      <div className="gold-shimmer"></div>
      <div className="crown-icon">👑</div>
      <div className="stamp-content">
        <div className="pick-number">{pickNumber}</div>
        {showDrafted && <div className="drafted-label">DRAFTED</div>}
      </div>
    </div>
  );
};

export default GoldStamp;