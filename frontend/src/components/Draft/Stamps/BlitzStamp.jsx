// BlitzStamp.jsx
// BidBlitz signature stamp - Orange with white triangle outlines

import React, { useMemo } from 'react';
import './BlitzStamp.css';

const BlitzStamp = ({ player, pickNumber }) => {
  // Generate equidistant triangle grid, then remove those touching text
  const triangles = useMemo(() => {
    const width = 120;
    const height = 100;
    const size = 4.5;
    const spacing = 9; // Distance between triangle centers
    
    // Text zones to remove triangles from (with padding)
    const avoidZones = [
      { x: 20, y: 0, w: 80, h: 100 },   // Center column - all text lives here
    ];
    
    const isInAvoidZone = (x, y) => {
      for (const zone of avoidZones) {
        if (x >= zone.x && x <= zone.x + zone.w && 
            y >= zone.y && y <= zone.y + zone.h) {
          return true;
        }
      }
      return false;
    };
    
    const result = [];
    
    // Create uniform hexagonal grid pattern (equidistant)
    const rowHeight = spacing * 0.866; // sqrt(3)/2 for hex packing
    const rows = Math.ceil(height / rowHeight) + 1;
    const cols = Math.ceil(width / spacing) + 1;
    
    for (let row = 0; row < rows; row++) {
      const y = row * rowHeight;
      const xOffset = (row % 2) * (spacing / 2); // Offset every other row
      
      for (let col = 0; col < cols; col++) {
        const x = col * spacing + xOffset;
        
        // Skip if in avoid zone
        if (isInAvoidZone(x, y)) continue;
        
        // Alternate pointing up/down in a pattern
        const pointsUp = (row + col) % 2 === 0;
        
        result.push({
          id: `${row}-${col}`,
          x,
          y,
          pointsUp,
          size
        });
      }
    }
    
    return result;
  }, []);

  return (
    <div className="blitz-stamp-frame">
      {/* Radial gradient overlay */}
      <div className="blitz-gradient-overlay" />
      
      {/* Triangle pattern background */}
      <svg 
        className="blitz-triangles"
        viewBox="0 0 120 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {triangles.map(({ id, x, y, pointsUp, size }) => {
          // Create triangle pointing up or down
          const h = size * 0.866; // height of equilateral triangle
          const points = pointsUp
            ? `${x},${y - h * 0.67} ${x + size / 2},${y + h * 0.33} ${x - size / 2},${y + h * 0.33}`
            : `${x},${y + h * 0.67} ${x + size / 2},${y - h * 0.33} ${x - size / 2},${y - h * 0.33}`;
          
          return (
            <polygon
              key={id}
              points={points}
              fill="white"
              stroke="black"
              strokeWidth="0.8"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>

      {pickNumber != null && (
        <div className="blitz-pick-badge">{pickNumber}</div>
      )}

      {player && (
        <>
          <div className="blitz-player-name">{player.name}</div>
          <div className="blitz-player-info">
            <span className="blitz-team-price">{player.team} - ${player.price}</span>
            <span className="blitz-player-position">{player.position}</span>
          </div>
        </>
      )}

      <div className="blitz-drafted-text">DRAFTED</div>
    </div>
  );
};

export default BlitzStamp;
