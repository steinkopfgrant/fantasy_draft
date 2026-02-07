// frontend/src/components/Draft/LiveDraftFeed.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import './LiveDraftFeed.css';

// Sport-specific configuration
const SPORT_CONFIG = {
  nfl: {
    positions: ['QB', 'RB', 'WR', 'TE', 'FLEX']
  },
  nba: {
    positions: ['PG', 'SG', 'SF', 'PF', 'C']
  }
};

const LiveDraftFeed = ({ 
  teams = [], 
  currentTurn = 0, 
  picks = [],
  currentUserId,
  getUserId,
  sport = 'nfl'  // NEW: sport prop
}) => {
  const feedRef = useRef(null);
  const [hoveredPick, setHoveredPick] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  const totalTeams = teams.length || 5;
  const totalRounds = 5;
  const totalPicks = totalTeams * totalRounds;
  
  // Get positions for current sport
  const positions = SPORT_CONFIG[sport]?.positions || SPORT_CONFIG.nfl.positions;

  // Calculate which team picks at which slot (snake draft)
  const getTeamForPick = (pickNumber) => {
    if (pickNumber < 1) return 0;
    const round = Math.ceil(pickNumber / totalTeams);
    const positionInRound = ((pickNumber - 1) % totalTeams) + 1;
    
    if (round % 2 === 1) {
      return positionInRound - 1; // Odd rounds: forward
    } else {
      return totalTeams - positionInRound; // Even rounds: reverse
    }
  };

  // Build the complete draft board with all picks
  const draftBoard = useMemo(() => {
    const board = [];
    
    for (let pickNum = 1; pickNum <= totalPicks; pickNum++) {
      const teamIndex = getTeamForPick(pickNum);
      const team = teams[teamIndex];
      const round = Math.ceil(pickNum / totalTeams);
      
      // Determine if this pick has been made (pickNum is 1-indexed, currentTurn is 0-indexed)
      const turnHasPassed = pickNum <= currentTurn;
      
      let playerInfo = null;
      let wasSkipped = false;
      
      if (turnHasPassed) {
        // STRICT matching: Only match by exact pickNumber
        const pickData = picks?.find(p => p.pickNumber === pickNum);
        
        if (pickData) {
          // Check if this was a skipped turn
          if (pickData.skipped || pickData.isSkipped) {
            wasSkipped = true;
          } else if (pickData.player) {
            playerInfo = {
              name: pickData.player.name,
              position: pickData.player.originalPosition || pickData.player.position,
              slot: pickData.rosterSlot || pickData.slot || pickData.player.position,
              price: pickData.player.price || pickData.player.value,
              team: pickData.player.team
            };
          }
        }
        
        // Fallback: If no picks array data, try to reconstruct from roster
        if (!playerInfo && !wasSkipped && team?.roster) {
          // Count how many picks this team has made up to this point
          let teamPickCount = 0;
          for (let p = 1; p <= pickNum; p++) {
            if (getTeamForPick(p) === teamIndex) {
              teamPickCount++;
            }
          }
          
          // Get all picks for this team from the picks array to find the Nth pick
          const teamPicks = picks?.filter(p => {
            if (p.skipped || p.isSkipped) return false;
            const pickTeamIndex = getTeamForPick(p.pickNumber);
            return pickTeamIndex === teamIndex;
          }).sort((a, b) => (a.pickNumber || 0) - (b.pickNumber || 0));
          
          if (teamPicks && teamPicks[teamPickCount - 1]) {
            const thisPick = teamPicks[teamPickCount - 1];
            if (thisPick.player) {
              playerInfo = {
                name: thisPick.player.name,
                position: thisPick.player.originalPosition || thisPick.player.position,
                slot: thisPick.rosterSlot || thisPick.slot || thisPick.player.position,
                price: thisPick.player.price || thisPick.player.value,
                team: thisPick.player.team
              };
            }
          }
          
          // Last resort fallback: Use roster data (may be wrong order on reconnect)
          if (!playerInfo && (!picks || picks.length === 0)) {
            let filledCount = 0;
            for (const slot of positions) {
              const player = team.roster[slot] || team.roster[slot.toLowerCase()];
              if (player?.name) {
                filledCount++;
                if (filledCount === teamPickCount) {
                  playerInfo = {
                    name: player.name,
                    position: player.originalPosition || player.position,
                    slot: slot,
                    price: player.price || player.value,
                    team: player.team
                  };
                  break;
                }
              }
            }
          }
        }
      }
      
      board.push({
        pickNumber: pickNum,
        round,
        teamIndex,
        team,
        isPicked: turnHasPassed && (playerInfo !== null || wasSkipped),
        wasSkipped,
        isCurrent: pickNum === currentTurn + 1,
        isMyPick: team && getUserId && getUserId(team) === currentUserId,
        playerInfo
      });
    }
    
    return board;
  }, [teams, currentTurn, picks, totalTeams, totalPicks, currentUserId, getUserId, positions]);

  // Auto-scroll to keep current pick visible
  useEffect(() => {
    if (feedRef.current) {
      const currentPickElement = feedRef.current.querySelector('.pick-slot.current');
      if (currentPickElement) {
        currentPickElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [currentTurn]);

  // Handle hover for roster tooltip
  const handleMouseEnter = (e, pick) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 10
    });
    setHoveredPick(pick);
  };

  const handleMouseLeave = () => {
    setHoveredPick(null);
  };

  // Get team color class
  const getTeamColorClass = (teamIndex) => {
    const colors = ['green', 'red', 'blue', 'yellow', 'purple'];
    return colors[teamIndex % colors.length];
  };

  // Render roster tooltip
  const RosterTooltip = ({ pick }) => {
    if (!pick?.team) return null;
    
    const team = pick.team;
    const roster = team.roster || {};
    const isMyTeam = getUserId && getUserId(team) === currentUserId;
    
    return (
      <div 
        className={`roster-tooltip ${getTeamColorClass(pick.teamIndex)}`}
        style={{
          left: tooltipPosition.x,
          top: tooltipPosition.y
        }}
      >
        <div className="tooltip-header">
          <span className={`team-name ${getTeamColorClass(pick.teamIndex)}`}>
            {team.name || `Team ${pick.teamIndex + 1}`}
          </span>
          {isMyTeam && <span className="you-badge">YOU</span>}
        </div>
        
        <div className="tooltip-budget">
          <span>Budget: ${team.budget ?? 15}</span>
          {(team.bonus || 0) > 0 && <span className="bonus">+${team.bonus}</span>}
        </div>
        
        <div className="tooltip-roster">
          {positions.map(slot => {
            const player = roster[slot] || roster[slot.toLowerCase()];
            return (
              <div key={slot} className={`roster-row ${player ? 'filled' : 'empty'}`}>
                <span className="slot-name">{slot}</span>
                {player ? (
                  <>
                    <span className="player-name">{player.name}</span>
                    <span className="player-price">${player.price || player.value || 0}</span>
                  </>
                ) : (
                  <span className="empty-text">—</span>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="tooltip-footer">
          <span>{Object.values(roster).filter(p => p?.name).length}/5 picks</span>
        </div>
        
        <div className="tooltip-arrow"></div>
      </div>
    );
  };

  return (
    <div className="live-draft-feed-container">
      <div className="feed-header">
        <div className="feed-title">
          <span className="live-indicator"></span>
          LIVE DRAFT
        </div>
        <div className="pick-counter">
          Pick {currentTurn + 1} of {totalPicks}
        </div>
      </div>
      
      <div className="feed-scroll-wrapper" ref={feedRef}>
        <div className="draft-feed">
          {draftBoard.map((pick) => (
            <div
              key={pick.pickNumber}
              className={`pick-slot 
                ${pick.isPicked ? 'picked' : ''} 
                ${pick.wasSkipped ? 'skipped' : ''}
                ${pick.isCurrent ? 'current' : ''}
                ${pick.isMyPick ? 'my-pick' : ''}
                ${getTeamColorClass(pick.teamIndex)}
              `}
              onMouseEnter={(e) => handleMouseEnter(e, pick)}
              onMouseLeave={handleMouseLeave}
            >
              <div className="pick-number">{pick.pickNumber}</div>
              
              <div className={`team-indicator ${getTeamColorClass(pick.teamIndex)}`}>
                {pick.team?.name?.substring(0, 3).toUpperCase() || `T${pick.teamIndex + 1}`}
              </div>
              
              {pick.wasSkipped ? (
                <div className="skipped-pick">
                  <span className="skip-icon">⏭️</span>
                  <span>SKIPPED</span>
                </div>
              ) : pick.isPicked && pick.playerInfo ? (
                <div className="picked-player">
                  <span className="player-position">{pick.playerInfo.slot || pick.playerInfo.position}</span>
                  <span className="player-name">{pick.playerInfo.name}</span>
                </div>
              ) : pick.isCurrent ? (
                <div className="on-clock">
                  <span className="clock-icon">⏱️</span>
                  <span>ON CLOCK</span>
                </div>
              ) : (
                <div className="upcoming">
                  <span className="round-label">R{pick.round}</span>
                </div>
              )}
              
              {pick.isMyPick && !pick.isPicked && (
                <div className="my-pick-indicator">YOUR PICK</div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Team Legend */}
      <div className="feed-legend">
        {teams.map((team, index) => {
          const isMe = getUserId && getUserId(team) === currentUserId;
          return (
            <div 
              key={index} 
              className={`legend-team ${getTeamColorClass(index)} ${isMe ? 'is-me' : ''}`}
            >
              <div className={`legend-dot ${getTeamColorClass(index)}`}></div>
              <span>{team.name || `Team ${index + 1}`}</span>
              {isMe && <span className="me-tag">(You)</span>}
            </div>
          );
        })}
      </div>
      
      {/* Roster Tooltip */}
      {hoveredPick && <RosterTooltip pick={hoveredPick} />}
    </div>
  );
};

export default LiveDraftFeed;