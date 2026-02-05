// BlitzStamp.jsx
// BidBlitz signature stamp - Orange with white triangles pattern

import React, { useMemo } from 'react';
import './BlitzStamp.css';

const BlitzStamp = ({ player, pickNumber }) => {
  // Generate random triangles with even distribution, avoiding text zones
  const triangles = useMemo(() => {
    const width = 120;
    const height = 100;
    const result = [];
    const size = 4.5;
    const placedPositions = [];
    const minDistance = size * 2.8;
    
    // Text zones to avoid (relative to viewBox 120x100)
    const avoidZones = [
      { x: 20, y: 0, w: 80, h: 22 },    // Top - player name
      { x: 25, y: 38, w: 70, h: 24 },   // Middle - DRAFTED text
      { x: 0, y: 78, w: 50, h: 22 },    // Bottom left - team/price
      { x: 85, y: 78, w: 35, h: 22 },   // Bottom right - position badge
      { x: 95, y: 0, w: 25, h: 25 },    // Top right - pick badge
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
    
    const isOverlapping = (x, y) => {
      for (const pos of placedPositions) {
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (dist < minDistance) return true;
      }
      return false;
    };
    
    // Grid-based seeding for even distribution
    const gridSize = 15;
    const cols = Math.floor(width / gridSize);
    const rows = Math.floor(height / gridSize);
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Add randomness within grid cell
        const baseX = col * gridSize + gridSize / 2;
        const baseY = row * gridSize + gridSize / 2;
        const x = baseX + (Math.random() - 0.5) * gridSize * 0.8;
        const y = baseY + (Math.random() - 0.5) * gridSize * 0.8;
        
        if (isInAvoidZone(x, y)) continue;
        if (isOverlapping(x, y)) continue;
        
        // 70% chance to place a triangle
        if (Math.random() < 0.7) {
          const rotation = Math.random() * 360;
          placedPositions.push({ x, y });
          
          result.push({
            id: `${row}-${col}`,
            x,
            y,
            rotation,
            size: size
          });
        }
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
            fill="white"
            stroke="black"
            strokeWidth="1"
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

      <div className="blitz-drafted-text">DRAFTED</div>
    </div>
  );
};

export default BlitzStamp;
