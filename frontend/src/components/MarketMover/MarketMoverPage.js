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
  const [allNFLPlayers, setAllNFLPlayers] = useState([]);
  const [allPlayersForOwnership, setAllPlayersForOwnership] = useState([]);
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

  useEffect(() => {
    if (user?.tickets !== undefined) {
      setUserTickets(user.tickets);
    }
  }, [user?.tickets]);

  useEffect(() => {
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
      
      if (data.userTickets !== undefined) {
        setUserTickets(data.userTickets);
      }
      
      if (data.availablePlayers && data.availablePlayers.length > 0) {
        setAllNFLPlayers(data.availablePlayers);
        
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

  const filteredPlayers = searchQuery.trim() === '' 
    ? [] 
    : allNFLPlayers.filter(player => 
        player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        player.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
        player.position.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const filteredOwnershipPlayers = ownershipSearchQuery.trim() === ''
    ? []
    : allPlayersForOwnership.filter(player =>
        player.name.toLowerCase().includes(ownershipSearchQuery.toLowerCase()) ||
        player.team?.toLowerCase().includes(ownershipSearchQuery.toLowerCase()) ||
        player.position?.toLowerCase().includes(ownershipSearchQuery.toLowerCase())
      ).slice(0, 10);

  const handleSelectOwnershipPlayer = (player) => {
    setOwnershipQuery({ ...ownershipQuery, playerName: player.name });
    setOwnershipSearchQuery(player.name);
    setShowOwnershipDropdown(false);
  };

  // Jersey Card Component for Fire Sale / Cool Down
  const JerseyCard = ({ player, rank, type }) => {
    const isFireSale = type === 'fire';
    return (
      <div className={`jersey-card ${type}`}>
        <div className="jersey-rank-badge">#{rank}</div>
        <div className="jersey-visual">
          <svg viewBox="0 0 100 100" className="jersey-svg">
            <path 
              d="M20,25 L35,20 L50,25 L65,20 L80,25 L85,40 L75,45 L75,85 L25,85 L25,45 L15,40 Z" 
              className={`jersey-path ${type}`}
            />
            <text x="50" y="60" textAnchor="middle" className="jersey-number-text">
              {rank}
            </text>
          </svg>
          <div className={`jersey-effect ${type}`}>
            {isFireSale ? '🔥' : '❄️'}
          </div>
        </div>
        <div className="jersey-details">
          <span className="jersey-player-name">{player.name}</span>
          <span className="jersey-player-meta">{player.position} • {player.team}</span>
          <div className="jersey-votes-badge">
            <span>{player.votes} votes</span>
          </div>
        </div>
      </div>
    );
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
      {/* Compact Header with Status */}
      <div className="mm-header">
        <div className="mm-header-left">
          <h1>🗳️ Market Mover</h1>
          <div className={`mm-status-badge ${marketMoverData.votingActive ? 'active' : 'inactive'}`}>
            {marketMoverData.votingActive ? (
              <>
                <span className="status-dot"></span>
                VOTING OPEN • {formatTimeRemaining(marketMoverData.timeRemaining)}
              </>
            ) : (
              'VOTING CLOSED'
            )}
          </div>
        </div>
        <div className="mm-header-right">
          <div className="ticket-badge">
            <span className="ticket-icon">🎟️</span>
            <span className="ticket-count">{userTickets}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={fetchMarketMoverStatus} className="retry-btn">Try Again</button>
        </div>
      )}

      {/* Main Content Grid - Fire Sale & Cool Down */}
      <div className="mm-main-grid">
        {/* FIRE SALE Section */}
        <div className="modifier-section fire-section">
          <div className="section-header fire-header">
            <div className="header-icon-row">
              <span className="header-icon">🔥</span>
              <span className="header-icon">🔥</span>
              <span className="header-icon">🔥</span>
            </div>
            <h2>FIRE SALE</h2>
            <p className="section-tagline">Hot players guaranteed on boards</p>
          </div>
          <div className="section-rules fire-rules">
            <div className="rule-item">
              <span className="rule-badge gold">✓</span>
              <span>At least 1 Fire Sale player per board</span>
            </div>
            <div className="rule-item">
              <span className="rule-badge silver">~1.5</span>
              <span>Average Fire Sale players per board</span>
            </div>
          </div>
          <div className="jersey-list">
            {marketMoverData.fireSaleList.length > 0 ? (
              marketMoverData.fireSaleList.map((player, idx) => (
                <JerseyCard key={idx} player={player} rank={idx + 1} type="fire" />
              ))
            ) : (
              <div className="empty-roster fire">
                <div className="empty-icon">👕</div>
                <p>No Fire Sale players yet</p>
                <span>Vote to add players!</span>
              </div>
            )}
          </div>
        </div>

        {/* COOL DOWN Section */}
        <div className="modifier-section ice-section">
          <div className="section-header ice-header">
            <div className="header-icon-row">
              <span className="header-icon">❄️</span>
              <span className="header-icon">🧊</span>
              <span className="header-icon">❄️</span>
            </div>
            <h2>COOL DOWN</h2>
            <p className="section-tagline">After 6 hours on sale, players need to cool down</p>
          </div>
          <div className="section-rules ice-rules">
            <div className="rule-item">
              <span className="rule-badge ice">1/10</span>
              <span>Probability modifier applied</span>
            </div>
            <div className="rule-item">
              <span className="rule-badge ice">~10x</span>
              <span>Less likely to appear</span>
            </div>
          </div>
          <div className="jersey-list">
            {marketMoverData.coolDownList.length > 0 ? (
              marketMoverData.coolDownList.map((player, idx) => (
                <JerseyCard key={idx} player={player} rank={idx + 1} type="ice" />
              ))
            ) : (
              <div className="empty-roster ice">
                <div className="empty-icon">🥶</div>
                <p>No Cool Down players yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vote Section */}
      {marketMoverData.votingActive && (
        <div className="vote-section">
          <svg className="vote-arrow" viewBox="0 0 60 160" width="70" height="185">
            <defs>
              <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#cc2020"/>
                <stop offset="100%" stopColor="#ff4040"/>
              </linearGradient>
            </defs>
            <path 
              d="M 8,5 L 52,5 L 52,110 L 36,110 L 36,140 L 8,125 L 24,110 L 8,110 Z"
              fill="url(#arrowGrad)"
              stroke="#880000"
              strokeWidth="2"
            />
            <circle className="bulb b1" cx="30" cy="12" r="4"/>
            <circle className="bulb b2" cx="48" cy="35" r="4"/>
            <circle className="bulb b3" cx="48" cy="65" r="4"/>
            <circle className="bulb b4" cx="48" cy="95" r="4"/>
            <circle className="bulb b5" cx="36" cy="125" r="4"/>
            <circle className="bulb b6" cx="18" cy="118" r="4"/>
            <circle className="bulb b7" cx="12" cy="95" r="4"/>
            <circle className="bulb b8" cx="12" cy="65" r="4"/>
            <circle className="bulb b9" cx="12" cy="35" r="4"/>
            <text x="30" y="38" fill="#fffacd" fontSize="18" fontWeight="900" fontFamily="Arial Black, sans-serif" textAnchor="middle">V</text>
            <text x="30" y="58" fill="#fffacd" fontSize="18" fontWeight="900" fontFamily="Arial Black, sans-serif" textAnchor="middle">O</text>
            <text x="30" y="78" fill="#fffacd" fontSize="18" fontWeight="900" fontFamily="Arial Black, sans-serif" textAnchor="middle">T</text>
            <text x="30" y="98" fill="#fffacd" fontSize="18" fontWeight="900" fontFamily="Arial Black, sans-serif" textAnchor="middle">E</text>
          </svg>
          <h2>🗳️ Cast Your Vote</h2>
          <p className="vote-description">Search for any NFL player to vote them onto Fire Sale or Cool Down</p>
          
          <div className="vote-search-container">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="vote-search-input"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={userTickets < 1}
              />
              {searchQuery && (
                <button 
                  className="clear-search-btn"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedPlayer(null);
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {searchQuery && (
              <div className="search-results-dropdown">
                {filteredPlayers.length > 0 ? (
                  filteredPlayers.slice(0, 8).map(player => (
                    <div 
                      key={player.id}
                      className={`search-result-item ${selectedPlayer?.id === player.id ? 'selected' : ''}`}
                      onClick={() => setSelectedPlayer(player)}
                    >
                      <div className="result-info">
                        <span className="result-name">{player.name}</span>
                        <span className="result-meta">{player.position} • {player.team}</span>
                      </div>
                      {selectedPlayer?.id === player.id && (
                        <button 
                          className="vote-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVote(player);
                          }}
                          disabled={voting || userTickets < 1}
                        >
                          {voting ? '...' : 'Vote 🎟️'}
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="no-results">No players found</div>
                )}
              </div>
            )}
          </div>

          {userTickets < 1 && (
            <div className="no-tickets-warning">
              ⚠️ You need tickets to vote! Complete drafts to earn more.
            </div>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <div className="leaderboard-section">
        <h2>🏆 Current Vote Leaders</h2>
        <div className="leaderboard-grid">
          {marketMoverData.leaderboard.length > 0 ? (
            marketMoverData.leaderboard.slice(0, 10).map((leader, index) => (
              <div key={index} className={`leaderboard-row ${index < 3 ? 'top-three' : ''}`}>
                <span className={`lb-rank rank-${index + 1}`}>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </span>
                <span className="lb-name">{leader.name}</span>
                <span className="lb-pos">{leader.position}</span>
                {index < 3 ? (
                  <span className="lb-votes">{leader.votes}</span>
                ) : (
                  <span className="lb-votes hidden">???</span>
                )}
              </div>
            ))
          ) : (
            <div className="empty-leaderboard">
              <p>No votes yet. Be the first!</p>
            </div>
          )}
        </div>
      </div>

      {/* Ownership Check Card */}
      <div className="ownership-section">
        <div 
          className={`ownership-card ${userTickets < 1 ? 'disabled' : ''}`}
          onClick={() => userTickets >= 1 && setShowOwnershipModal(true)}
        >
          <div className="ownership-icon">📊</div>
          <div className="ownership-content">
            <h3>Check Ownership %</h3>
            <p>See how many lineups contain a specific player</p>
          </div>
          <div className="ownership-cost">
            {userTickets >= 1 ? '1 🎟️' : 'Need tickets'}
          </div>
        </div>
      </div>

      {/* Ownership Modal */}
      {showOwnershipModal && (
        <div className="modal-overlay" onClick={closeOwnershipModal}>
          <div className="modal-content ownership-modal" onClick={e => e.stopPropagation()}>
            {ownershipResult ? (
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
                  <button onClick={() => setOwnershipResult(null)} className="secondary-btn">
                    Check Another
                  </button>
                  <button onClick={closeOwnershipModal} className="primary-btn">
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Check Player Ownership</h2>
                <p className="modal-description">
                  Select a contest and player to see ownership percentage
                </p>
                
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
                            No players found
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
                    {checkingOwnership ? 'Checking...' : 'Check (1 🎟️)'}
                  </button>
                  <button onClick={closeOwnershipModal} className="secondary-btn">
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