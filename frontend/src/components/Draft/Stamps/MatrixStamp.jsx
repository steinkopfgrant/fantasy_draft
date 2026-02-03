// MatrixStamp.jsx
// Beta Tester stamp - falling binary matrix rain effect

import React from 'react';
import './MatrixStamp.css';

const MatrixStamp = ({ player, pickNumber, showDrafted = true }) => {
  // Generate random binary strings for variety
  const matrixColumns = [
    '10110100101',
    '01001011010',
    '11010010110',
    '00101101001',
    '10010110100',
    '01101001011',
    '10100101101',
    '01011010010',
    '10110100101',
    '01001011010'
  ];

  // Split name for stacked mobile display
  const firstName = player?.name?.split(' ')[0] || '';
  const lastName = player?.name?.split(' ').slice(1).join(' ') || firstName;

  return (
    <div className="matrix-stamp-frame">
      <div className="matrix-rain">
        {matrixColumns.map((col, i) => (
          <div key={i} className="matrix-column">{col}</div>
        ))}
      </div>

      {pickNumber != null && (
        <div className="matrix-pick-badge">{pickNumber}</div>
      )}

      {player && (
        <>
          <div className="matrix-player-name">
            <span className="stamp-first-name">{firstName}</span>
            <span className="stamp-last-name">{lastName}</span>
          </div>
          <div className="matrix-player-info">
            <span>{player.team} - ${player.price}</span>
            <span className="matrix-player-position">{player.position}</span>
          </div>
        </>
      )}

      {showDrafted && (
        <div className="matrix-drafted-text">DRAFTED</div>
      )}
    </div>
  );
};

export default MatrixStamp;
