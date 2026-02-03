// GoldStamp.jsx
// Cash King stamp - Gold shimmer with floating particles

import React from 'react';
import './GoldStamp.css';

const GoldStamp = ({ player, pickNumber, showDrafted = true }) => {
  // 8 particles for the floating effect
  const particles = Array(8).fill(null);

  // Split name for stacked mobile display
  const firstName = player?.name?.split(' ')[0] || '';
  const lastName = player?.name?.split(' ').slice(1).join(' ') || firstName;

  return (
    <div className="gold-stamp-frame">
      <div className="gold-crown">👑</div>
      
      <div className="gold-particles">
        {particles.map((_, i) => (
          <div key={i} className="gold-particle" />
        ))}
      </div>

      {pickNumber != null && (
        <div className="gold-pick-badge">{pickNumber}</div>
      )}

      {player && (
        <>
          <div className="gold-player-name">
            <span className="stamp-first-name">{firstName}</span>
            <span className="stamp-last-name">{lastName}</span>
          </div>
          <div className="gold-player-info">
            <span>{player.team} - ${player.price}</span>
            <span className="gold-player-position">{player.position}</span>
          </div>
        </>
      )}

      {showDrafted && (
        <div className="gold-drafted-text">DRAFTED</div>
      )}
    </div>
  );
};

export default GoldStamp;
