// frontend/src/components/DraftBoard/DraftBoard.js
import React, { useState, useEffect, useMemo } from 'react';
import './DraftBoard.css';

const DraftBoard = ({ 
  playerBoard, 
  onPlayerSelect, 
  currentTeam, 
  isMyTurn, 
  draftedPlayers,
  highlightedPosition,
  budget = 15
}) => {
  const [selectedCell, setSelectedCell] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [autoPickCell, setAutoPickCell] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPosition, setFilterPosition] = useState('ALL');
  const [filterTeam, setFilterTeam] = useState('ALL');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 5 });

  // Get available positions for the current roster
  const getAvailablePositions = (player) => {
    const positions = [];
    const roster = currentTeam?.roster || {};
    
    // Check primary position
    if (!roster[player.position]) {
      positions.push(player.position);
    }
    
    // Check FLEX eligibility
    if (!roster.FLEX && ['RB', 'WR', 'TE'].includes(player.position)) {
      positions.push('FLEX');
    }
    
    return positions;
  };

  // Calculate auto-pick suggestion
  const calculateAutoPick = () => {
    if (!isMyTurn || !playerBoard) return null;

    let bestPick = null;
    let bestValue = -1;

    playerBoard.forEach((row, rowIndex) => {
      row.forEach((player, colIndex) => {
        // Skip if already drafted or too expensive
        if (player.drafted || player.price > budget) return;

        const availablePositions = getAvailablePositions(player);
        if (availablePositions.length === 0) return;

        // Calculate value score
        // Prioritize filling required positions first
        const roster = currentTeam?.roster || {};
        const requiredPositions = ['QB', 'RB', 'WR', 'TE'];
        const filledRequired = requiredPositions.filter(pos => roster[pos]).length;
        const isRequired = requiredPositions.includes(player.position) && !roster[player.position];
        
        // Value formula: price * position need * scarcity
        let value = player.price;
        if (isRequired) value *= 2; // Double value for needed positions
        if (filledRequired < 4) value *= 1.5; // Boost if still filling required spots
        
        // Add small random factor to break ties
        value += Math.random() * 0.1;

        if (value > bestValue) {
          bestValue = value;
          bestPick = { row: rowIndex, col: colIndex, player, position: availablePositions[0] };
        }
      });
    });

    return bestPick;
  };

  // Update auto-pick preview when turn changes or roster updates
  useEffect(() => {
    if (isMyTurn) {
      const autoPick = calculateAutoPick();
      if (autoPick) {
        setAutoPickCell(`${autoPick.row}-${autoPick.col}`);
      } else {
        setAutoPickCell(null);
      }
    } else {
      setAutoPickCell(null);
    }
  }, [isMyTurn, currentTeam, playerBoard, budget]);

  // Filter players based on search criteria
  const isPlayerVisible = (player) => {
    if (!player) return false;
    
    // Search term filter
    if (searchTerm && !player.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    // Position filter
    if (filterPosition !== 'ALL' && player.position !== filterPosition) {
      return false;
    }
    
    // Team filter
    if (filterTeam !== 'ALL' && player.team !== filterTeam) {
      return false;
    }
    
    // Price filter
    if (player.price < priceRange.min || player.price > priceRange.max) {
      return false;
    }
    
    return true;
  };

  // Get unique teams for filter
  const uniqueTeams = useMemo(() => {
    const teams = new Set();
    playerBoard?.forEach(row => {
      row.forEach(player => {
        if (player?.team) teams.add(player.team);
      });
    });
    return Array.from(teams).sort();
  }, [playerBoard]);

  const handleCellClick = (row, col, player) => {
    if (!isMyTurn || player.drafted || player.price > budget) return;
    
    const availablePositions = getAvailablePositions(player);
    if (availablePositions.length === 0) return;

    const cellKey = `${row}-${col}`;
    
    // If clicking the auto-pick suggestion, confirm it
    if (cellKey === autoPickCell) {
      onPlayerSelect(row, col, player, availablePositions[0]);
      setSelectedCell(null);
      setAutoPickCell(null);
    } else {
      // Otherwise, select this cell
      setSelectedCell(cellKey === selectedCell ? null : cellKey);
    }
  };

  const handlePositionSelect = (row, col, player, position) => {
    onPlayerSelect(row, col, player, position);
    setSelectedCell(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (!isMyTurn || !selectedCell) return;
      
      const [row, col] = selectedCell.split('-').map(Number);
      const player = playerBoard[row][col];
      const availablePositions = getAvailablePositions(player);
      
      // Number keys for position selection
      if (e.key >= '1' && e.key <= '5') {
        const positions = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
        const position = positions[parseInt(e.key) - 1];
        if (availablePositions.includes(position)) {
          handlePositionSelect(row, col, player, position);
        }
      }
      
      // Enter to confirm first available position
      if (e.key === 'Enter' && availablePositions.length > 0) {
        handlePositionSelect(row, col, player, availablePositions[0]);
      }
      
      // Escape to cancel selection
      if (e.key === 'Escape') {
        setSelectedCell(null);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isMyTurn, selectedCell, playerBoard]);

  if (!playerBoard || playerBoard.length === 0) {
    return <div className="draft-board-loading">Loading player board...</div>;
  }

  return (
    <div className="draft-board-container">
      <div className="draft-board-filters">
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-group">
          <select 
            value={filterPosition} 
            onChange={(e) => setFilterPosition(e.target.value)}
            className="filter-select"
          >
            <option value="ALL">All Positions</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
          </select>
        </div>

        <div className="filter-group">
          <select 
            value={filterTeam} 
            onChange={(e) => setFilterTeam(e.target.value)}
            className="filter-select"
          >
            <option value="ALL">All Teams</option>
            {uniqueTeams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        </div>

        <div className="filter-group price-filter">
          <label>Price: ${priceRange.min} - ${priceRange.max}</label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.5"
            value={priceRange.max}
            onChange={(e) => setPriceRange({ ...priceRange, max: parseFloat(e.target.value) })}
            className="price-slider"
          />
        </div>

        {isMyTurn && autoPickCell && (
          <div className="autopick-indicator">
            <span className="autopick-icon">🤖</span>
            Auto-pick suggestion highlighted
          </div>
        )}
      </div>

      <div className="draft-board">
        {playerBoard.map((row, rowIndex) => (
          <div key={rowIndex} className="board-row">
            {row.map((player, colIndex) => {
              const cellKey = `${rowIndex}-${colIndex}`;
              const isSelected = selectedCell === cellKey;
              const isHovered = hoveredCell === cellKey;
              const isAutoPick = autoPickCell === cellKey;
              const availablePositions = getAvailablePositions(player);
              const canDraft = isMyTurn && !player.drafted && player.price <= budget && availablePositions.length > 0;
              const isVisible = isPlayerVisible(player);
              
              return (
                <div
                  key={cellKey}
                  className={`player-cell ${player.drafted ? 'drafted' : ''} 
                    ${canDraft ? 'can-draft' : ''} 
                    ${isSelected ? 'selected' : ''} 
                    ${isHovered ? 'hovered' : ''}
                    ${isAutoPick ? 'auto-pick' : ''}
                    ${!isVisible ? 'filtered-out' : ''}
                    ${player.price > budget ? 'too-expensive' : ''}
                    team-${player.draftedBy || 'none'}`}
                  onClick={() => handleCellClick(rowIndex, colIndex, player)}
                  onMouseEnter={() => setHoveredCell(cellKey)}
                  onMouseLeave={() => setHoveredCell(null)}
                  data-position={player.position}
                >
                  {isAutoPick && (
                    <div className="auto-pick-badge">
                      <span className="badge-icon">🤖</span>
                      <span className="badge-text">AUTO</span>
                    </div>
                  )}
                  
                  <div className="player-name">{player.name}</div>
                  <div className="player-info">
                    <span className="player-team">{player.team}</span>
                    <span className="player-position">{player.position}</span>
                  </div>
                  {player.matchup && (
                    <div className="player-matchup">{player.matchup}</div>
                  )}
                  <div className="player-price">${player.price}</div>
                  
                  {player.drafted && (
                    <div className="drafted-overlay">
                      <span className="drafted-text">DRAFTED</span>
                    </div>
                  )}
                  
                  {isSelected && canDraft && (
                    <div className="position-selector">
                      <div className="selector-header">Select Position:</div>
                      {availablePositions.map(pos => (
                        <button
                          key={pos}
                          className="position-option"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePositionSelect(rowIndex, colIndex, player, pos);
                          }}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {isHovered && !player.drafted && (
                    <div className="player-tooltip">
                      <div className="tooltip-name">{player.name}</div>
                      <div className="tooltip-details">
                        {player.team} - {player.position}
                      </div>
                      {player.matchup && (
                        <div className="tooltip-matchup">{player.matchup}</div>
                      )}
                      <div className="tooltip-price">${player.price}</div>
                      {canDraft && (
                        <div className="tooltip-hint">
                          Click to draft for: {availablePositions.join(' or ')}
                        </div>
                      )}
                      {player.price > budget && (
                        <div className="tooltip-warning">Over budget!</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="draft-board-legend">
        <div className="legend-item">
          <span className="legend-color auto-pick"></span>
          <span>Auto-pick suggestion</span>
        </div>
        <div className="legend-item">
          <span className="legend-color can-draft"></span>
          <span>Available to draft</span>
        </div>
        <div className="legend-item">
          <span className="legend-color drafted"></span>
          <span>Already drafted</span>
        </div>
        <div className="legend-item">
          <span className="legend-color too-expensive"></span>
          <span>Over budget</span>
        </div>
      </div>

      {isMyTurn && (
        <div className="keyboard-shortcuts">
          <h4>Keyboard Shortcuts:</h4>
          <div className="shortcut">1-5: Select position (QB, RB, WR, TE, FLEX)</div>
          <div className="shortcut">Enter: Confirm selection</div>
          <div className="shortcut">Esc: Cancel selection</div>
        </div>
      )}
    </div>
  );
};

export default DraftBoard;