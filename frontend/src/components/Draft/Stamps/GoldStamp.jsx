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
      <div className="gold-info-overlay">
        {player?.name && <div className="gold-player-name">{player.name}</div>}
        {showDrafted && <div className="gold-drafted-label">DRAFTED</div>}
        <div className="gold-player-details">
          {player?.team && <span>{player.team} - ${player.price}</span>}
          {player?.position && <span className="gold-position-badge">{player.position}</span>}
        </div>
      </div>
    </div>
  );
};

export default GoldStamp;
