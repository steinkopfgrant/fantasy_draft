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
      {player?.name && <div className="matrix-player-name">{player.name}</div>}
      {showDrafted && <div className="matrix-drafted-label">DRAFTED</div>}
      {player?.team && <div className="matrix-team-price">{player.team} - ${player.price}</div>}
      {player?.matchup && <div className="matrix-matchup">{player.matchup}</div>}
      {player?.position && <div className="matrix-position">{player.position}</div>}
    </div>
  );
};

export default MatrixStamp;
