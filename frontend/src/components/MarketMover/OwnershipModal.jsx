// frontend/src/components/MarketMover/OwnershipModal.jsx
import React, { useState, useEffect } from 'react';
import './MarketMover.css';

const OwnershipModal = ({ isOpen, onClose, tickets }) => {
  const [contestId, setContestId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [result, setResult] = useState(null);
  const [activeContests, setActiveContests] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchActiveContests();
      fetchAvailablePlayers();
      setResult(null);
      setError('');
    }
  }, [isOpen]);

  const fetchAvailablePlayers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/market-mover/available-players', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAllPlayers(data.players || []);
      } else {
        console.error('Failed to fetch available players');
        setAllPlayers(getHardcodedPlayers());
      }
    } catch (error) {
      console.error('Error fetching players:', error);
      setAllPlayers(getHardcodedPlayers());
    }
  };

  const fetchActiveContests = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/market-mover/active-contests', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setActiveContests(data.contests || []);
        if (data.contests && data.contests.length > 0) {
          setContestId(data.contests[0].id);
        }
      } else {
        // Fallback: try to get all contests and filter for Market Mover
        const allContestsResponse = await fetch('/api/contests', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (allContestsResponse.ok) {
          const allContests = await allContestsResponse.json();
          const mmContests = allContests.filter(c => 
            c.type === 'market' && 
            (c.status === 'open' || c.status === 'drafting')
          );
          
          setActiveContests(mmContests);
          if (mmContests.length > 0) {
            setContestId(mmContests[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching active contests:', error);
      setError('Unable to load contests. Please try again.');
    }
  };

  // Fallback player data
  const getHardcodedPlayers = () => {
    const hardcodedPlayers = [
      { name: 'Josh Allen', team: 'BUF', position: 'QB', price: 5 },
      { name: 'Christian McCaffrey', team: 'SF', position: 'RB', price: 5 },
      { name: 'Cooper Kupp', team: 'LAR', position: 'WR', price: 5 },
      { name: 'Travis Kelce', team: 'KC', position: 'TE', price: 5 },
      // Add more players as needed
    ];

    return hardcodedPlayers.map(player => ({
      ...player,
      id: `${player.name}-${player.team}`,
      displayName: `${player.name} ${player.team}`
    })).sort((a, b) => a.name.localeCompare(b.name));
  };

  const handlePlayerNameChange = (e) => {
    const value = e.target.value;
    setPlayerName(value);
    
    if (value.length > 0) {
      const filtered = allPlayers.filter(player => 
        player.name.toLowerCase().includes(value.toLowerCase()) ||
        player.team.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered.slice(0, 8));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (player) => {
    setPlayerName(player.name);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleQuery = async () => {
    if (!contestId || !playerName.trim() || tickets < 1) return;
    
    setIsQuerying(true);
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/market-mover/ownership', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contestId: contestId,
          playerName: playerName.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        const contestName = activeContests.find(c => c.id === contestId)?.name || 'Market Mover Contest';
        
        setResult({
          playerName: data.playerName,
          ownership: parseFloat(data.ownership).toFixed(2),
          contestName: contestName,
          newTickets: data.newTickets
        });
        
        // Update parent component with new ticket count if callback provided
        if (data.newTickets !== undefined && window.updateUserTickets) {
          window.updateUserTickets(data.newTickets);
        }
      } else {
        throw new Error(data.error || 'Failed to check ownership');
      }
    } catch (error) {
      console.error('Ownership query error:', error);
      setError(error.message || 'Failed to check ownership. Please try again.');
    } finally {
      setIsQuerying(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setPlayerName('');
    setSuggestions([]);
    setShowSuggestions(false);
    setError('');
    onClose();
  };

  const handleCheckAnother = () => {
    setResult(null);
    setPlayerName('');
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content ownership-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Check Player Ownership</h2>
          <button className="close-button" onClick={handleClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          {!result ? (
            <>
              <div className="ownership-info">
                <p>Cost: <span className="ticket-cost">1 ticket</span> (You have {tickets})</p>
                <p className="ownership-description">
                  Find out what percentage of Market Mover lineups contain a specific player.
                </p>
              </div>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
              
              <div className="query-form">
                <div className="form-group">
                  <label>Select Contest:</label>
                  <select 
                    value={contestId} 
                    onChange={(e) => setContestId(e.target.value)}
                    className="contest-select"
                  >
                    {activeContests.length === 0 ? (
                      <option value="">No Market Mover contests available</option>
                    ) : (
                      activeContests.map(contest => (
                        <option key={contest.id} value={contest.id}>
                          {contest.name} ({contest.currentEntries || 0} entries)
                        </option>
                      ))
                    )}
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Player Name:</label>
                  <div className="autocomplete-wrapper">
                    <input
                      type="text"
                      placeholder="Start typing player name..."
                      value={playerName}
                      onChange={handlePlayerNameChange}
                      onFocus={() => playerName.length > 0 && suggestions.length > 0 && setShowSuggestions(true)}
                      className="player-input"
                      autoFocus
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="suggestions-dropdown">
                        {suggestions.map((player, index) => (
                          <div 
                            key={index}
                            className="suggestion-item"
                            onClick={() => selectSuggestion(player)}
                          >
                            <span className="suggestion-name">{player.name}</span>
                            <span className="suggestion-details">
                              {player.team} - {player.position}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <small className="input-hint">
                    Select from suggestions or enter exact name
                  </small>
                </div>
              </div>
            </>
          ) : (
            <div className="ownership-result">
              <div className="result-icon">📊</div>
              <h3>{result.playerName}</h3>
              <div className="ownership-percentage">
                {result.ownership}%
              </div>
              <p className="result-context">
                of lineups in {result.contestName}
              </p>
              <button 
                className="check-another-btn"
                onClick={handleCheckAnother}
              >
                Check Another Player
              </button>
            </div>
          )}
        </div>
        
        {!result && (
          <div className="modal-footer">
            <button className="cancel-btn" onClick={handleClose}>Cancel</button>
            <button 
              className="query-btn"
              onClick={handleQuery}
              disabled={
                !contestId || 
                !playerName.trim() || 
                tickets < 1 || 
                isQuerying || 
                activeContests.length === 0
              }
            >
              {isQuerying ? 'Checking...' : 'Check Ownership (1 🎟️)'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnershipModal;