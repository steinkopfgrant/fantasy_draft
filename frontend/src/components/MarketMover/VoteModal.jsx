// frontend/src/components/MarketMover/VoteModal.jsx
import React, { useState, useEffect } from 'react';
import './MarketMover.css';

const VoteModal = ({ isOpen, onClose, onVote, tickets, currentLeaders }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isVoting, setIsVoting] = useState(false);
  const [allPlayers, setAllPlayers] = useState([]);
  const [votingEligibility, setVotingEligibility] = useState({ canVote: false, reason: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAvailablePlayers();
      checkVotingEligibility();
    }
  }, [isOpen]);

  const fetchAvailablePlayers = async () => {
    try {
      setLoading(true);
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
        // Fallback to hardcoded players if API fails
        setAllPlayers(getHardcodedPlayers());
      }
    } catch (error) {
      console.error('Error fetching players:', error);
      setAllPlayers(getHardcodedPlayers());
    } finally {
      setLoading(false);
    }
  };

  const checkVotingEligibility = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/market-mover/voting-eligibility', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setVotingEligibility({
          canVote: data.canVote,
          reason: data.reason || ''
        });
      }
    } catch (error) {
      console.error('Error checking voting eligibility:', error);
      setVotingEligibility({
        canVote: tickets >= 1,
        reason: tickets < 1 ? 'Insufficient tickets' : ''
      });
    }
  };

  // Fallback player data if API is not available
  const getHardcodedPlayers = () => {
    const hardcodedPlayers = [
      { name: 'Josh Allen', team: 'BUF', position: 'QB', price: 5 },
      { name: 'Christian McCaffrey', team: 'SF', position: 'RB', price: 5 },
      { name: 'Cooper Kupp', team: 'LAR', position: 'WR', price: 5 },
      { name: 'Travis Kelce', team: 'KC', position: 'TE', price: 5 },
      { name: 'Lamar Jackson', team: 'BAL', position: 'QB', price: 4 },
      { name: 'Derrick Henry', team: 'TEN', position: 'RB', price: 4 },
      { name: 'Davante Adams', team: 'LV', position: 'WR', price: 4 },
      // Add more players as needed
    ];

    return hardcodedPlayers.map(player => ({
      ...player,
      id: `${player.name}-${player.team}`,
      displayName: `${player.name} ${player.team}`
    })).sort((a, b) => a.name.localeCompare(b.name));
  };

  const filteredPlayers = allPlayers.filter(player =>
    player.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleVote = async () => {
    if (!selectedPlayer || !votingEligibility.canVote) return;
    
    setIsVoting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/market-mover/vote', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          playerName: selectedPlayer.name,
          playerId: selectedPlayer.id
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Call the parent's onVote function to update the UI
        if (onVote) {
          onVote(selectedPlayer, data.newTickets);
        }
        
        // Show success message
        alert(`Successfully voted for ${selectedPlayer.name}!`);
        onClose();
      } else {
        throw new Error(data.error || 'Vote failed');
      }
    } catch (error) {
      console.error('Vote error:', error);
      alert(error.message || 'Failed to cast vote. Please try again.');
    } finally {
      setIsVoting(false);
    }
  };

  const handleClose = () => {
    setSelectedPlayer(null);
    setSearchTerm('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content vote-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Vote for Next BID UP Player</h2>
          <button className="close-button" onClick={handleClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="vote-info">
            <p>Cost: <span className="ticket-cost">1 ticket</span> (You have {tickets})</p>
            <p className="vote-description">
              The player with the most votes will get a 35% appearance boost in all Market Mover contests!
            </p>
          </div>

          {!votingEligibility.canVote && (
            <div className="voting-ineligible">
              <p className="error-message">
                {votingEligibility.reason || 'You cannot vote at this time'}
              </p>
            </div>
          )}
          
          {currentLeaders && currentLeaders.length > 0 && (
            <div className="current-leaders-preview">
              <h4>Current Leaders:</h4>
              <div className="leaders-preview-list">
                {currentLeaders.slice(0, 3).map((leader, index) => (
                  <span key={index} className="leader-preview">
                    {index + 1}. {leader.name} ({leader.votes} votes)
                  </span>
                ))}
              </div>
            </div>
          )}
          
          <div className="search-section">
            <input
              type="text"
              placeholder="Search players by name or team..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="player-search"
              autoFocus
            />
          </div>
          
          <div className="players-list">
            {loading ? (
              <p className="loading-message">Loading players...</p>
            ) : filteredPlayers.length === 0 ? (
              <p className="no-results">
                {searchTerm ? `No players found matching "${searchTerm}"` : 'No players available'}
              </p>
            ) : (
              filteredPlayers.slice(0, 20).map(player => (
                <div
                  key={player.id}
                  className={`player-option ${selectedPlayer?.id === player.id ? 'selected' : ''}`}
                  onClick={() => votingEligibility.canVote && setSelectedPlayer(player)}
                >
                  <div className="player-info">
                    <span className="player-name">{player.displayName || player.name}</span>
                    <span className={`player-position ${player.position}`}>{player.position}</span>
                  </div>
                  <span className="player-price">${player.price}</span>
                </div>
              ))
            )}
          </div>
          
          {filteredPlayers.length > 20 && (
            <p className="more-results">
              Showing 20 of {filteredPlayers.length} results. Type more to narrow search.
            </p>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="cancel-btn" onClick={handleClose}>Cancel</button>
          <button 
            className="vote-btn"
            onClick={handleVote}
            disabled={!selectedPlayer || !votingEligibility.canVote || isVoting}
            title={!votingEligibility.canVote ? votingEligibility.reason : ''}
          >
            {isVoting ? 'Voting...' : 
             !votingEligibility.canVote ? 'Cannot Vote' :
             `Vote for ${selectedPlayer?.name || 'Select Player'}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoteModal;