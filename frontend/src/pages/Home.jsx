// frontend/src/pages/Home.jsx
import React, { useState, useEffect } from 'react';
import './Home.css';
import VoteModal from '../components/MarketMover/VoteModal';
import OwnershipModal from '../components/MarketMover/OwnershipModal';

const Home = ({ user, balance, tickets, onNavigate, onUpdateTickets }) => {
  const [voteLeaders, setVoteLeaders] = useState([]);
  const [bidUpPlayer, setBidUpPlayer] = useState(null);
  const [circuitBreakerPlayers, setCircuitBreakerPlayers] = useState([]);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showOwnershipModal, setShowOwnershipModal] = useState(false);
  const [canClaimWeekly, setCanClaimWeekly] = useState(true);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [ticketHistory, setTicketHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchMarketMoverData();
    checkWeeklyBonusStatus();
  }, []);

  const fetchMarketMoverData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      
      // Try to fetch all market mover data from a single endpoint first
      try {
        const statusResponse = await fetch('http://localhost:5000/api/market-mover/status', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          
          // Safely set the data with defaults
          setVoteLeaders(Array.isArray(statusData.voteLeaders) ? statusData.voteLeaders : []);
          setBidUpPlayer(statusData.bidUpPlayer || null);
          setCircuitBreakerPlayers(Array.isArray(statusData.circuitBreakers) ? statusData.circuitBreakers : []);
          
          setIsLoading(false);
          return; // Exit if successful
        }
      } catch (error) {
        console.log('Status endpoint failed, trying individual endpoints...');
      }

      // Fallback to individual endpoints
      // Fetch current vote leaders
      try {
        const voteResponse = await fetch('http://localhost:5000/api/market-mover/vote-leaders', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (voteResponse.ok) {
          const voteData = await voteResponse.json();
          setVoteLeaders(Array.isArray(voteData.leaders) ? voteData.leaders : []);
        } else {
          setVoteLeaders([]);
        }
      } catch (error) {
        console.error('Error fetching vote leaders:', error);
        setVoteLeaders([]);
      }
      
      // Fetch current BID UP player
      try {
        const bidUpResponse = await fetch('http://localhost:5000/api/market-mover/bid-up', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (bidUpResponse.ok) {
          const bidUpData = await bidUpResponse.json();
          setBidUpPlayer(bidUpData.player || null);
        } else {
          setBidUpPlayer(null);
        }
      } catch (error) {
        console.error('Error fetching BID UP player:', error);
        setBidUpPlayer(null);
      }
      
      // Fetch circuit breaker list
      try {
        const circuitResponse = await fetch('http://localhost:5000/api/market-mover/circuit-breaker', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (circuitResponse.ok) {
          const circuitData = await circuitResponse.json();
          setCircuitBreakerPlayers(Array.isArray(circuitData.players) ? circuitData.players : []);
        } else {
          setCircuitBreakerPlayers([]);
        }
      } catch (error) {
        console.error('Error fetching circuit breakers:', error);
        setCircuitBreakerPlayers([]);
      }
      
    } catch (error) {
      console.error('Error in fetchMarketMoverData:', error);
      // Ensure arrays are set even on total failure
      setVoteLeaders([]);
      setBidUpPlayer(null);
      setCircuitBreakerPlayers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const checkWeeklyBonusStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/tickets/can-claim-weekly', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCanClaimWeekly(data.canClaim);
      }
    } catch (error) {
      console.error('Error checking weekly bonus status:', error);
    }
  };

  const handleClaimWeeklyBonus = async () => {
    if (!canClaimWeekly || claimingBonus) return;
    
    setClaimingBonus(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/tickets/claim-weekly', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        onUpdateTickets(data.newBalance);
        setCanClaimWeekly(false);
        alert('Weekly bonus claimed! +1 ticket added to your balance.');
      } else {
        alert(data.error || 'Failed to claim weekly bonus');
      }
    } catch (error) {
      console.error('Error claiming weekly bonus:', error);
      alert('Network error. Please try again.');
    } finally {
      setClaimingBonus(false);
    }
  };

  const fetchTicketHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/tickets/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTicketHistory(Array.isArray(data.transactions) ? data.transactions : []);
        setShowHistoryModal(true);
      }
    } catch (error) {
      console.error('Error fetching ticket history:', error);
      setTicketHistory([]);
    }
  };

  const handleVote = async (player) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/market-mover/vote', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ playerId: player.id })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        onUpdateTickets(tickets - 1);
        alert(`Vote successful! ${player.name} now has ${data.voteCount} votes.`);
        fetchMarketMoverData(); // Refresh vote leaders
      } else {
        alert(data.error || 'Failed to vote');
      }
    } catch (error) {
      console.error('Error voting:', error);
      alert('Network error. Please try again.');
    }
  };

  const handleOwnershipQuery = async (contestId, playerName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/market-mover/ownership', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contestId, playerName })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        onUpdateTickets(tickets - 1);
        return data.ownership;
      } else {
        throw new Error(data.error || 'Failed to check ownership');
      }
    } catch (error) {
      console.error('Error checking ownership:', error);
      throw error;
    }
  };

  const formatTimeRemaining = (endTime) => {
    if (!endTime) return 'Unknown';
    
    const endDate = new Date(endTime);
    const now = new Date();
    const diff = endDate - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="home-screen">
        <div className="loading">Loading Market Mover data...</div>
      </div>
    );
  }

  return (
    <div className="home-screen">
      <div className="welcome-section">
        <h2>Welcome back, {user?.username}!</h2>
        <p>Ready to dominate the Market Mover?</p>
      </div>

      <div className="mm-features-grid">
        {/* Current BID UP Player */}
        <div className="feature-card bid-up-card">
          <h3>🔥 Current BID UP Player</h3>
          {bidUpPlayer ? (
            <div className="bid-up-player">
              <div className="player-name">{bidUpPlayer.name} {bidUpPlayer.team}</div>
              <div className="boost-rate">35% Appearance Boost</div>
              <div className="time-remaining">
                Ends in: {formatTimeRemaining(bidUpPlayer.endsAt)}
              </div>
            </div>
          ) : (
            <div className="no-player">No active BID UP player</div>
          )}
        </div>

        {/* Vote Leaders */}
        <div className="feature-card vote-leaders-card">
          <h3>📊 Current Vote Leaders</h3>
          <div className="vote-leaders">
            {voteLeaders && voteLeaders.length > 0 ? (
              voteLeaders.map((player, index) => (
                <div key={player.id || `leader-${index}`} className="vote-leader">
                  <span className="rank">{index + 1}.</span>
                  <span className="player-name">{player.name} {player.team}</span>
                  <span className="vote-count">{player.votes || 0} votes</span>
                </div>
              ))
            ) : (
              <div className="no-leaders">No votes yet this period</div>
            )}
          </div>
          <div className="voting-ends">Voting ends in {formatTimeRemaining(new Date(Date.now() + 15 * 60000))}</div>
        </div>

        {/* Circuit Breaker List */}
        <div className="feature-card circuit-breaker-card">
          <h3>⚡ Circuit Breaker List</h3>
          <div className="circuit-breaker-list">
            {circuitBreakerPlayers && circuitBreakerPlayers.length > 0 ? (
              circuitBreakerPlayers.map((player, index) => (
                <div key={player.id || `breaker-${index}`} className="circuit-player">
                  <span className="player-name">{player.name} {player.team}</span>
                  <span className="cooldown">-50% odds for {formatTimeRemaining(player.endsAt)}</span>
                </div>
              ))
            ) : (
              <div className="no-breakers">No players on cooldown</div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="feature-card actions-card">
          <h3>🎟️ Use Your Tickets</h3>
          <div className="ticket-balance">
            You have <span className="ticket-count">{tickets || 0}</span> tickets
          </div>
          <div className="action-buttons">
            <button 
              className="action-btn weekly-bonus-btn"
              onClick={handleClaimWeeklyBonus}
              disabled={!canClaimWeekly || claimingBonus}
            >
              <span className="btn-icon">🎁</span>
              <span className="btn-text">
                {canClaimWeekly ? 'Claim Weekly Bonus' : 'Already Claimed'}
              </span>
              <span className="btn-cost">FREE</span>
            </button>
            
            <button 
              className="action-btn vote-btn"
              onClick={() => setShowVoteModal(true)}
              disabled={tickets === 0}
            >
              <span className="btn-icon">🗳️</span>
              <span className="btn-text">Vote for BID UP</span>
              <span className="btn-cost">1 ticket</span>
            </button>
            
            <button 
              className="action-btn search-btn"
              onClick={() => setShowOwnershipModal(true)}
              disabled={tickets === 0}
            >
              <span className="btn-icon">🔍</span>
              <span className="btn-text">Check Ownership %</span>
              <span className="btn-cost">1 ticket</span>
            </button>
            
            <button 
              className="action-btn history-btn"
              onClick={fetchTicketHistory}
            >
              <span className="btn-icon">📜</span>
              <span className="btn-text">Ticket History</span>
              <span className="btn-cost">FREE</span>
            </button>
          </div>
        </div>
      </div>

      <div className="quick-actions">
        <button className="quick-action-btn" onClick={() => onNavigate('lobby')}>
          Enter Contest
        </button>
        <button className="quick-action-btn" onClick={() => onNavigate('myContests')}>
          View My Contests
        </button>
      </div>

      {/* Vote Modal */}
      {showVoteModal && (
        <VoteModal
          isOpen={showVoteModal}
          onClose={() => setShowVoteModal(false)}
          onVote={handleVote}
          tickets={tickets}
          currentLeaders={voteLeaders}
        />
      )}

      {/* Ownership Modal */}
      {showOwnershipModal && (
        <OwnershipModal
          isOpen={showOwnershipModal}
          onClose={() => setShowOwnershipModal(false)}
          onQuery={handleOwnershipQuery}
          tickets={tickets}
        />
      )}

      {/* Ticket History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content history-modal" onClick={e => e.stopPropagation()}>
            <h3>Ticket Transaction History</h3>
            <div className="history-list">
              {ticketHistory.length === 0 ? (
                <p className="no-history">No ticket transactions yet</p>
              ) : (
                ticketHistory.map((transaction, index) => (
                  <div key={transaction.id || `history-${index}`} className="history-item">
                    <div className="history-info">
                      <span className="history-reason">{transaction.reason}</span>
                      <span className="history-date">
                        {new Date(transaction.timestamp || transaction.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className={`history-amount ${transaction.amount > 0 ? 'positive' : 'negative'}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </span>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setShowHistoryModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;