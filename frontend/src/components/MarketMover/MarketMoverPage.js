// frontend/src/components/MarketMover/MarketMoverPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectAuthUser } from '../../store/slices/authSlice';
import { showToast } from '../../store/slices/uiSlice';
import axios from 'axios';
import './MarketMover.css';

const MarketMoverPage = () => {
  const dispatch = useDispatch();
  const user = useSelector(selectAuthUser);
  
  const [marketMoverData, setMarketMoverData] = useState({
    votingActive: false,
    leaderboard: [],
    fireSaleList: [],
    coolDownList: [],
    availablePlayers: [],
    currentBidUpPlayer: null,
    nextVoteTime: null,
    timeRemaining: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userTickets, setUserTickets] = useState(0);
  const [voting, setVoting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [allNFLPlayers, setAllNFLPlayers] = useState([]);  // For voting (excludes FIRE SALE/COOL DOWN)
  const [allPlayersForOwnership, setAllPlayersForOwnership] = useState([]);  // For ownership (ALL players)
  const [showOwnershipModal, setShowOwnershipModal] = useState(false);
  const [ownershipQuery, setOwnershipQuery] = useState({ contestId: '', playerName: '' });
  const [ownershipSearchQuery, setOwnershipSearchQuery] = useState('');
  const [showOwnershipDropdown, setShowOwnershipDropdown] = useState(false);
  const [ownershipResult, setOwnershipResult] = useState(null);
  const [checkingOwnership, setCheckingOwnership] = useState(false);
  const [activeContests, setActiveContests] = useState([]);
  const [countdownInterval, setCountdownInterval] = useState(null);

  useEffect(() => {
    fetchMarketMoverStatus();
    fetchActiveContests();
    fetchUserTickets();
    const interval = setInterval(fetchMarketMoverStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Update tickets from user state when it changes
  useEffect(() => {
    if (user?.tickets !== undefined) {
      setUserTickets(user.tickets);
    }
  }, [user?.tickets]);

  useEffect(() => {
    // Update countdown timer
    if (marketMoverData.votingActive && marketMoverData.timeRemaining > 0) {
      if (countdownInterval) clearInterval(countdownInterval);
      
      const interval = setInterval(() => {
        setMarketMoverData(prev => ({
          ...prev,
          timeRemaining: Math.max(0, prev.timeRemaining - 1000)
        }));
      }, 1000);
      
      setCountdownInterval(interval);
      
      return () => clearInterval(interval);
    }
  }, [marketMoverData.votingActive, marketMoverData.endTime]);

  // Fetch user tickets directly from profile endpoint
  const fetchUserTickets = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await axios.get('/api/users/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.data.user?.tickets !== undefined) {
        setUserTickets(response.data.user.tickets);
      }
    } catch (err) {
      console.error('Error fetching user tickets:', err);
    }
  };

  const fetchMarketMoverStatus = async () => {
    try {
      setError('');
      
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/market-mover/status', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      const data = response.data;
      setMarketMoverData({
        votingActive: data.votingActive || data.isActive || false,
        leaderboard: data.leaderboard || [],
        fireSaleList: data.fireSaleList || [],
        coolDownList: data.coolDownList || [],
        availablePlayers: data.availablePlayers || [],
        currentBidUpPlayer: data.currentBidUpPlayer,
        nextVoteTime: data.endTime,
        timeRemaining: data.timeRemaining || 0,
        userCanVote: data.userCanVote,
        userVoteReason: data.userVoteReason
      });
      
      // Update tickets if returned from status endpoint
      if (data.userTickets !== undefined) {
        setUserTickets(data.userTickets);
      }
      
      // Set available players from backend (real player pools)
      if (data.availablePlayers && data.availablePlayers.length > 0) {
        setAllNFLPlayers(data.availablePlayers);
        
        // For ownership checks, include ALL players (including FIRE SALE and COOL DOWN)
        const fireSalePlayers = (data.fireSaleList || []).map(p => ({
          id: p.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          name: p.name,
          team: p.team,
          position: p.position,
          price: p.price
        }));
        const coolDownPlayers = (data.coolDownList || []).map(p => ({
          id: p.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          name: p.name,
          team: p.team,
          position: p.position,
          price: p.price
        }));
        setAllPlayersForOwnership([...data.availablePlayers, ...fireSalePlayers, ...coolDownPlayers]);
      }
      
    } catch (err) {
      console.error('Error fetching market mover status:', err);
      setError('Unable to load MarketMover data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveContests = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await axios.get('/api/market-mover/active-contests', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setActiveContests(response.data.contests || []);
      }
    } catch (err) {
      console.error('Error fetching active contests:', err);
    }
  };

  const handleVote = async (player) => {
    if (!user || userTickets < 1) {
      dispatch(showToast({ 
        message: 'You need tickets to vote!', 
        type: 'error' 
      }));
      return;
    }

    setVoting(true);
    try {
      const response = await axios.post(
        '/api/market-mover/vote',
        {
          playerId: player.id,
          playerName: player.name
        },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (response.data.success) {
        dispatch(showToast({ 
          message: response.data.message || `Successfully voted for ${player.name}!`, 
          type: 'success' 
        }));
        setUserTickets(response.data.newTickets);
        setSelectedPlayer(null);
        setSearchQuery('');
        fetchMarketMoverStatus();
      }
    } catch (err) {
      dispatch(showToast({ 
        message: err.response?.data?.error || 'Failed to cast vote', 
        type: 'error' 
      }));
    } finally {
      setVoting(false);
    }
  };

  const handleOwnershipCheck = async () => {
    if (!ownershipQuery.contestId || !ownershipQuery.playerName) {
      dispatch(showToast({ 
        message: 'Please select a contest and a player', 
        type: 'error' 
      }));
      return;
    }

    setCheckingOwnership(true);
    try {
      const response = await axios.post(
        '/api/market-mover/ownership',
        ownershipQuery,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (response.data.success) {
        // Show result in modal instead of toast
        setOwnershipResult({
          playerName: response.data.playerName,
          ownership: response.data.ownership
        });
        setUserTickets(response.data.newTickets);
      }
    } catch (err) {
      dispatch(showToast({ 
        message: err.response?.data?.error || 'Failed to check ownership', 
        type: 'error' 
      }));
    } finally {
      setCheckingOwnership(false);
    }
  };

  const closeOwnershipModal = () => {
    setShowOwnershipModal(false);
    setOwnershipSearchQuery('');
    setOwnershipQuery({ contestId: '', playerName: '' });
    setShowOwnershipDropdown(false);
    setOwnershipResult(null);
  };

  const formatTimeRemaining = (ms) => {
    if (!ms || ms <= 0) return 'Ended';
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  // Filter players based on search query
  const filteredPlayers = searchQuery.trim() === '' 
    ? [] 
    : allNFLPlayers.filter(player => 
        player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        player.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
        player.position.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Filter players for ownership modal dropdown (searches ALL players including FIRE SALE/COOL DOWN)
  const filteredOwnershipPlayers = ownershipSearchQuery.trim() === ''
    ? []
    : allPlayersForOwnership.filter(player =>
        player.name.toLowerCase().includes(ownershipSearchQuery.toLowerCase()) ||
        player.team?.toLowerCase().includes(ownershipSearchQuery.toLowerCase()) ||
        player.position?.toLowerCase().includes(ownershipSearchQuery.toLowerCase())
      ).slice(0, 10); // Limit to 10 results for performance

  // Handle selecting a player from ownership dropdown
  const handleSelectOwnershipPlayer = (player) => {
    setOwnershipQuery({ ...ownershipQuery, playerName: player.name });
    setOwnershipSearchQuery(player.name);
    setShowOwnershipDropdown(false);
  };

  if (loading) {
    return (
      <div className="market-mover-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading MarketMover...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="market-mover-page">
      <div className="page-header">
        <h1>📊 Market Mover Hub</h1>
        <p className="page-subtitle">
          Vote for players to get FIRE SALE or COOL DOWN status!
        </p>
        <div className="user-ticket-display">
          <span className="ticket-balance">Your Tickets: {userTickets} 🎟️</span>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={fetchMarketMoverStatus} className="retry-btn">
            Try Again
          </button>
        </div>
      )}

      {/* Voting Status */}
      <div className="voting-status-section">
        <div className={`status-card ${marketMoverData.votingActive ? 'status-active' : 'status-inactive'}`}>
          <div className="status-header">
            <span className="status-icon">{marketMoverData.votingActive ? '🗳️' : '🔒'}</span>
            <h2>{marketMoverData.votingActive ? 'VOTING ACTIVE' : 'VOTING CLOSED'}</h2>
            {marketMoverData.votingActive && <span className="pulse-dot"></span>}
          </div>
          {marketMoverData.nextVoteTime && (
            <p className="status-time">
              {marketMoverData.votingActive 
                ? `Voting ends in: ${formatTimeRemaining(marketMoverData.timeRemaining)}`
                : 'Voting period ended'
              }
            </p>
          )}
        </div>
      </div>

      {/* FIRE SALE & COOL DOWN Lists */}
      <div className="modifier-lists">
        <div className="fire-sale-section">
          <h3>🔥 FIRE SALE</h3>
          <p className="modifier-description">
            100% guaranteed one appears • 50% chance each additional
          </p>
          <div className="player-list">
            {marketMoverData.fireSaleList.length > 0 ? (
              marketMoverData.fireSaleList.map((player, idx) => (
                <div key={idx} className="list-item fire-sale">
                  <span className="rank">#{idx + 1}</span>
                  <span className="name">{player.name}</span>
                  <span className="votes">{player.votes} votes</span>
                </div>
              ))
            ) : (
              <div className="empty-list">No FIRE SALE players yet</div>
            )}
          </div>
        </div>

        <div className="cool-down-section">
          <h3>❄️ COOL DOWN</h3>
          <p className="modifier-description">
            1/10 probability modifier (appears ~10x less often)
          </p>
          <div className="player-list">
            {marketMoverData.coolDownList.length > 0 ? (
              marketMoverData.coolDownList.map((player, idx) => (
                <div key={idx} className="list-item cool-down">
                  <span className="rank">#{idx + 1}</span>
                  <span className="name">{player.name}</span>
                  <span className="votes">{player.votes} votes</span>
                </div>
              ))
            ) : (
              <div className="empty-list">No COOL DOWN players yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Voting Section with Search */}
      {marketMoverData.votingActive && (
        <div className="voting-section">
          <h2>🗳️ Vote for Players</h2>
          
          {/* Search Bar */}
          <div className="search-container">
            <input
              type="text"
              className="player-search"
              placeholder="🔍 Search for any NFL player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={userTickets < 1}
            />
            {searchQuery && (
              <button 
                className="clear-search"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedPlayer(null);
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Results */}
          {searchQuery && (
            <div className="search-results">
              {filteredPlayers.length > 0 ? (
                <div className="player-list-scroll">
                  {filteredPlayers.map(player => {
                    const isSelected = selectedPlayer?.id === player.id;
                    
                    return (
                      <div 
                        key={player.id}
                        className={`player-search-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedPlayer(player)}
                      >
                        <div className="player-info">
                          <span className="player-name">{player.name}</span>
                          <span className="player-details">{player.position} - {player.team}</span>
                        </div>
                        <div className="player-vote-info">
                          {isSelected && (
                            <button 
                              className="vote-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVote(player);
                              }}
                              disabled={voting || userTickets < 1}
                            >
                              {voting ? '...' : 'Vote (1 🎟️)'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="no-results">
                  No players found matching "{searchQuery}"
                </div>
              )}
            </div>
          )}

          {userTickets < 1 && (
            <div className="no-tickets-message">
              You need tickets to vote! Complete drafts to earn tickets.
            </div>
          )}
        </div>
      )}

      {/* Leaderboard - Only shows top 10, only top 3 show vote counts */}
      <div className="leaderboard-section">
        <h2>🏆 Current Vote Leaders</h2>
        <div className="leaderboard-card">
          <div className="leaderboard-list">
            {marketMoverData.leaderboard.length > 0 ? (
              marketMoverData.leaderboard.slice(0, 10).map((leader, index) => (
                <div key={index} className={`leader-row ${index < 3 ? 'top-three' : ''}`}>
                  <span className={`rank rank-${index + 1}`}>#{index + 1}</span>
                  <span className="player-name">{leader.name}</span>
                  <span className="player-pos">{leader.position} - {leader.team}</span>
                  {index < 3 ? (
                    <span className="vote-count">{leader.votes} votes</span>
                  ) : (
                    <span className="vote-count vote-hidden">??? votes</span>
                  )}
                </div>
              ))
            ) : (
              <div className="no-votes">
                <p>No votes cast yet. Be the first to vote!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Cards */}
      <div className="actions-section">
        <h2>Available Actions</h2>
        <div className="action-cards">
          <div 
            className={`action-card ownership-card ${userTickets < 1 ? 'disabled' : ''}`}
            onClick={() => userTickets >= 1 && setShowOwnershipModal(true)}
          >
            <div className="card-icon">📊</div>
            <h3>Check Ownership</h3>
            <p>See what percentage of lineups contain a specific player</p>
            <div className="card-cost">
              {userTickets >= 1 ? 'Cost: 1 🎟️' : 'Need 1 🎟️'}
            </div>
          </div>

          <div 
            className="action-card shop-card"
            onClick={() => window.location.href = '/lobby'}
          >
            <div className="card-icon">🎮</div>
            <h3>Join MarketMaker</h3>
            <p>Enter MarketMaker contests to see FIRE SALE players in action</p>
          </div>
        </div>
      </div>

      {/* Ownership Modal */}
      {showOwnershipModal && (
        <div className="modal-overlay" onClick={closeOwnershipModal}>
          <div className="modal-content ownership-modal" onClick={e => e.stopPropagation()}>
            {ownershipResult ? (
              // Show Result View
              <>
                <h2>📊 Ownership Result</h2>
                <div className="ownership-result">
                  <div className="result-player-name">{ownershipResult.playerName}</div>
                  <div className="result-percentage">
                    <span className="percentage-value">{ownershipResult.ownership}%</span>
                    <span className="percentage-label">ownership</span>
                  </div>
                  <p className="result-description">
                    {ownershipResult.ownership > 50 
                      ? '🔥 Highly owned! Consider fading for differentiation.'
                      : ownershipResult.ownership > 25
                      ? '📈 Moderately owned. Solid tournament play.'
                      : ownershipResult.ownership > 10
                      ? '💎 Low owned. Good leverage opportunity!'
                      : '🦄 Rare pick! High upside if they hit.'
                    }
                  </p>
                </div>
                <div className="modal-actions">
                  <button 
                    onClick={() => setOwnershipResult(null)}
                    className="secondary-btn"
                  >
                    Check Another Player
                  </button>
                  <button 
                    onClick={closeOwnershipModal}
                    className="primary-btn"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              // Show Search View
              <>
                <h2>Check Player Ownership</h2>
                <p className="modal-description">
                  Select a contest and player to see ownership percentage
                </p>
                
                {/* Contest Select */}
                <div className="form-group">
                  <label>Contest</label>
                  <select 
                    value={ownershipQuery.contestId}
                    onChange={(e) => setOwnershipQuery({...ownershipQuery, contestId: e.target.value})}
                    className="ownership-select"
                  >
                    <option value="">Select Contest</option>
                    {activeContests.map(contest => (
                      <option key={contest.id} value={contest.id}>
                        {contest.name} ({contest.currentEntries}/{contest.maxEntries})
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Player Autocomplete */}
                <div className="form-group">
                  <label>Player</label>
                  <div className="autocomplete-container">
                    <input
                      type="text"
                      placeholder="Search for a player..."
                      value={ownershipSearchQuery}
                      onChange={(e) => {
                        setOwnershipSearchQuery(e.target.value);
                        setShowOwnershipDropdown(true);
                        // Clear the selected player if user is typing something different
                        if (e.target.value !== ownershipQuery.playerName) {
                          setOwnershipQuery({ ...ownershipQuery, playerName: '' });
                        }
                      }}
                      onFocus={() => setShowOwnershipDropdown(true)}
                      className="ownership-input"
                    />
                    {ownershipQuery.playerName && (
                      <span className="selected-checkmark">✓</span>
                    )}
                    
                    {/* Dropdown Results */}
                    {showOwnershipDropdown && ownershipSearchQuery && (
                      <div className="autocomplete-dropdown">
                        {filteredOwnershipPlayers.length > 0 ? (
                          filteredOwnershipPlayers.map(player => (
                            <div
                              key={player.id}
                              className={`autocomplete-item ${ownershipQuery.playerName === player.name ? 'selected' : ''}`}
                              onClick={() => handleSelectOwnershipPlayer(player)}
                            >
                              <span className="player-name">{player.name}</span>
                              <span className="player-meta">{player.position} - {player.team}</span>
                            </div>
                          ))
                        ) : (
                          <div className="autocomplete-empty">
                            No players found matching "{ownershipSearchQuery}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {ownershipQuery.playerName && (
                    <div className="selected-player-badge">
                      Selected: <strong>{ownershipQuery.playerName}</strong>
                    </div>
                  )}
                </div>
                
                <div className="modal-actions">
                  <button 
                    onClick={handleOwnershipCheck} 
                    disabled={!ownershipQuery.contestId || !ownershipQuery.playerName || checkingOwnership}
                    className="primary-btn"
                  >
                    {checkingOwnership ? 'Checking...' : 'Check Ownership (1 🎟️)'}
                  </button>
                  <button 
                    onClick={closeOwnershipModal}
                    className="secondary-btn"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketMoverPage;