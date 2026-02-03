import React from 'react';
import './GoldStamp.css';

const GoldStamp = ({ player, pickNumber, showDrafted }) => {
  return (
    <div className="gold-stamp">
      <div className="gold-shimmer"></div>
      <div className="gold-particles">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="gold-particle" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
      </div>
      <div className="crown-icon">👑</div>
      {showDrafted && <div className="gold-drafted-label">DRAFTED</div>}
    </div>
  );
};

export default GoldStamp;