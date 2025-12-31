// frontend/src/components/Draft/LiveDraftFeed.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import './LiveDraftFeed.css';

const LiveDraftFeed = ({ 
  teams = [], 
  currentTurn = 0, 
  picks = [],
  currentUserId,
  getUserId 
}) => {
  const feedRef = useRef(null);
  const [hoveredPick, setHoveredPick] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  const totalTeams = teams.length || 5;
  const totalRounds = 5;
  const totalPicks = totalTeams * totalRounds;

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
      
      // Find the pick data for this slot
      const pickData = picks?.find(p => p.pickNumber === pickNum) || null;
      
      // Determine if this pick has been made
      const isPicked = pickNum <= currentTurn;
      
      // Get player info from team roster if available
      let playerInfo = null;
      if (isPicked && team?.roster) {
        const rosterSize = Object.values(team.roster).filter(p => p?.name).length;
        // Calculate which roster slot this pick filled
        const teamPicks = [];
        for (let p = 1; p <= pickNum; p++) {
          if (getTeamForPick(p) === teamIndex) {
            teamPicks.push(p);
          }
        }
        const pickIndex = teamPicks.length;
        
        // Get the player at this pick index from roster
        const rosterEntries = Object.entries(team.roster).filter(([_, p]) => p?.name);
        if (rosterEntries[pickIndex - 1]) {
          const [slot, player] = rosterEntries[pickIndex - 1];
          playerInfo = { ...player, slot };
        }
      }
      
      board.push({
        pickNumber: pickNum,
        round,
        teamIndex,
        team,
        isPicked,
        isCurrent: pickNum === currentTurn + 1,
        isMyPick: team && getUserId && getUserId(team) === currentUserId,
        pickData,
        playerInfo
      });
    }
    
    return board;
  }, [teams, currentTurn, picks, totalTeams, totalPicks, currentUserId, getUserId]);

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
    const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
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
          {slots.map(slot => {
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
              
              {pick.isPicked && pick.playerInfo ? (
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