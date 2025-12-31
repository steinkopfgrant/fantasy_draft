// frontend/src/components/DraftReplay/DraftReplay.js
import React, { useState, useEffect } from 'react';
import './DraftReplay.css';

const DraftReplay = ({ entryId, onClose }) => {
  const [draftData, setDraftData] = useState(null);
  const [currentPick, setCurrentPick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms between picks
  const [board, setBoard] = useState([]);
  const [rosters, setRosters] = useState({});

  useEffect(() => {
    fetchDraftData();
  }, [entryId]);

  const fetchDraftData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/drafts/${entryId}/replay`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDraftData(data);
        setBoard(data.initialBoard);
        initializeRosters(data.users);
      }
    } catch (error) {
      console.error('Error fetching draft data:', error);
    }
  };

  const initializeRosters = (users) => {
    const initialRosters = {};
    users.forEach(user => {
      initialRosters[user.userId] = {
        username: user.username,
        position: user.position,
        teamColor: user.teamColor,
        roster: {},
        budget: 15,
        picks: []
      };
    });
    setRosters(initialRosters);
  };

  useEffect(() => {
    if (isPlaying && draftData && currentPick < draftData.picks.length) {
      const timer = setTimeout(() => {
        applyPick(draftData.picks[currentPick]);
        setCurrentPick(currentPick + 1);
      }, playbackSpeed);

      return () => clearTimeout(timer);
    } else if (currentPick >= draftData.picks.length) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentPick, draftData, playbackSpeed]);

  const applyPick = (pick) => {
    // Update board
    const newBoard = [...board];
    newBoard[pick.row][pick.col] = {
      ...newBoard[pick.row][pick.col],
      drafted: true,
      draftedBy: pick.draftPosition
    };
    setBoard(newBoard);

    // Update roster
    const newRosters = { ...rosters };
    const userRoster = newRosters[pick.userId];
    userRoster.roster[pick.rosterSlot] = pick.player;
    userRoster.budget -= pick.player.price;
    userRoster.picks.push(pick);
    setRosters(newRosters);
  };

  const handlePlay = () => setIsPlaying(!isPlaying);
  const handleReset = () => {
    setCurrentPick(0);
    setIsPlaying(false);
    setBoard(draftData.initialBoard);
    initializeRosters(draftData.users);
  };

  const handleStepForward = () => {
    if (currentPick < draftData.picks.length) {
      applyPick(draftData.picks[currentPick]);
      setCurrentPick(currentPick + 1);
    }
  };

  const handleStepBackward = () => {
    if (currentPick > 0) {
      // Reset and replay up to previous pick
      setBoard(draftData.initialBoard);
      initializeRosters(draftData.users);
      const targetPick = currentPick - 1;
      setCurrentPick(0);
      
      for (let i = 0; i < targetPick; i++) {
        applyPick(draftData.picks[i]);
      }
      setCurrentPick(targetPick);
    }
  };

  if (!draftData) {
    return <div className="draft-replay-loading">Loading draft replay...</div>;
  }

  return (
    <div className="draft-replay-modal">
      <div className="draft-replay-container">
        <div className="replay-header">
          <h2>Draft Replay - {draftData.contestName}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="replay-controls">
          <button onClick={handleStepBackward} disabled={currentPick === 0}>
            ⏮ Previous
          </button>
          <button onClick={handlePlay}>
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button onClick={handleStepForward} disabled={currentPick >= draftData.picks.length}>
            Next ⏭
          </button>
          <button onClick={handleReset}>↺ Reset</button>
          
          <div className="speed-control">
            <label>Speed:</label>
            <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}>
              <option value={2000}>0.5x</option>
              <option value={1000}>1x</option>
              <option value={500}>2x</option>
              <option value={250}>4x</option>
            </select>
          </div>
          
          <div className="pick-counter">
            Pick {currentPick} of {draftData.picks.length}
          </div>
        </div>

        <div className="replay-content">
          <div className="replay-board">
            {board.map((row, rowIndex) => (
              <div key={rowIndex} className="board-row">
                {row.map((player, colIndex) => (
                  <div 
                    key={`${rowIndex}-${colIndex}`}
                    className={`player-cell ${player.drafted ? 'drafted' : ''} ${
                      player.drafted ? `team-${player.draftedBy}` : ''
                    }`}
                  >
                    <div className="player-name">{player.name}</div>
                    <div className="player-info">
                      {player.team} - {player.position} - ${player.price}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="replay-rosters">
            <h3>Rosters</h3>
            {Object.entries(rosters).map(([userId, userData]) => (
              <div key={userId} className={`roster-card team-${userData.position}`}>
                <h4>{userData.username}</h4>
                <div className="roster-budget">Budget: ${userData.budget}</div>
                <div className="roster-picks">
                  {Object.entries(userData.roster).map(([slot, player]) => (
                    <div key={slot} className="roster-slot">
                      <span className="slot-name">{slot}:</span>
                      <span className="player-name">{player.name} (${player.price})</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {currentPick > 0 && currentPick <= draftData.picks.length && (
          <div className="current-pick-info">
            Last Pick: {draftData.picks[currentPick - 1].username} selected {
              draftData.picks[currentPick - 1].player.name
            } for ${draftData.picks[currentPick - 1].player.price}
          </div>
        )}
      </div>
    </div>
  );
};

export default DraftReplay;