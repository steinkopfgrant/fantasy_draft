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
      {player?.name && <div className="gold-player-name">{player.name}</div>}
      {showDrafted && <div className="gold-drafted-label">DRAFTED</div>}
      {player?.team && <div className="gold-team-price">{player.team} - ${player.price}</div>}
      {player?.matchup && <div className="gold-matchup">{player.matchup}</div>}
      {player?.position && <div className="gold-position">{player.position}</div>}
    </div>
  );
};

export default GoldStamp;
