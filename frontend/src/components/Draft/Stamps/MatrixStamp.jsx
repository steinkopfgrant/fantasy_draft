import React from 'react';
import './MatrixStamp.css';

const MatrixStamp = ({ player, pickNumber, showDrafted }) => {
  return (
    <div className="matrix-stamp">
      <div className="matrix-rain">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="matrix-column" style={{ animationDelay: `${i * 0.15}s` }}>
            {[...Array(12)].map((_, j) => (
              <span key={j} className="matrix-char">
                {String.fromCharCode(0x30A0 + Math.random() * 96)}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="matrix-info-overlay">
        {player?.name && <div className="matrix-player-name">{player.name}</div>}
        {showDrafted && <div className="matrix-drafted-label">DRAFTED</div>}
        <div className="matrix-player-details">
          {player?.team && <span>{player.team} - ${player.price}</span>}
          {player?.position && <span className="matrix-position-badge">{player.position}</span>}
        </div>
      </div>
    </div>
  );
};

export default MatrixStamp;
