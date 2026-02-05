// BlitzStamp.jsx
// BidBlitz signature stamp - Orange with white triangles pattern

import React, { useMemo } from 'react';
import './BlitzStamp.css';

const BlitzStamp = ({ player, pickNumber, showDrafted = true }) => {
  // Generate random triangles once per mount (useMemo with empty deps)
  const triangles = useMemo(() => {
    const width = 120;
    const height = 100;
    const result = [];
    const size = 4;
    const placedPositions = [];
    const minDistance = size * 2.5;
    
    const isOverlapping = (x, y) => {
      for (const pos of placedPositions) {
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (dist < minDistance) return true;
      }
      return false;
    };
    
    // Generate ~40 triangles with random placement
    for (let i = 0; i < 300; i++) {
      if (result.length >= 40) break;
      
      const x = Math.random() * width;
      const y = Math.random() * height;
      
      if (isOverlapping(x, y)) continue;
      
      if (Math.random() < 0.5) {
        const rotation = Math.random() * 360;
        placedPositions.push({ x, y });
        
        result.push({
          id: i,
          x,
          y,
          rotation,
          size: size + Math.random() * 2
        });
      }
    }
    
    return result;
  }, []);

  return (
    <div className="blitz-stamp-frame">
      {/* Triangle pattern background */}
      <svg 
        className="blitz-triangles"
        viewBox="0 0 120 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {triangles.map(({ id, x, y, rotation, size }) => (
          <polygon
            key={id}
            points={`${x},${y - size} ${x + size * 0.866},${y + size * 0.5} ${x - size * 0.866},${y + size * 0.5}`}
            fill="rgba(255, 255, 255, 0.85)"
            stroke="rgba(0, 0, 0, 0.15)"
            strokeWidth="0.5"
            strokeLinejoin="round"
            transform={`rotate(${rotation} ${x} ${y})`}
          />
        ))}
      </svg>

      {pickNumber != null && (
        <div className="blitz-pick-badge">{pickNumber}</div>
      )}

      {player && (
        <>
          <div className="blitz-player-name">{player.name}</div>
          <div className="blitz-player-info">
            <span>{player.team} - ${player.price}</span>
            <span className="blitz-player-position">{player.position}</span>
          </div>
        </>
      )}

      {showDrafted && (
        <div className="blitz-drafted-text">DRAFTED</div>
      )}
    </div>
  );
};

export default BlitzStamp;
