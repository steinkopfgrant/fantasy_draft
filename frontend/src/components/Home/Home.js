// frontend/src/components/Home/Home.js - MarketMover Integration
import React, { useState, useEffect } from 'react';
import './Home.css';
import VoteModal from '../MarketMover/VoteModal';
import OwnershipModal from '../MarketMover/OwnershipModal';

const Home = ({ user, onNavigate, updateUserTickets }) => {
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showOwnershipModal, setShowOwnershipModal] = useState(false);
  const [marketMoverData, setMarketMoverData] = useState({
    votingActive: false,
    leaderboard: [],
    currentBidUpPlayer: null,
    nextVoteTime: null
  });
  const [achievements, setAchievements] = useState({
    total: 0,
    completed: 0,
    points: 0,
    recentUnlocks: []
  });
  const [loading, setLoading] = useState(true);
  const [userTickets, setUserTickets] = useState(user?.tickets || 0);

  useEffect(() => {
    if (user) {
      fetchMarketMoverStatus();
      fetchAchievementsSummary();
      setUserTickets(user.tickets || 0);
    }
    setLoading(false);
  }, [user]);

  // Update user tickets when they change
  useEffect(() => {
    setUserTickets(user?.tickets || 0);
  }, [user?.tickets]);

  const fetchMarketMoverStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/market-mover/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMarketMoverData({
          votingActive: data.votingActive || false,
          leaderboard: data.leaderboard || [],
          currentBidUpPlayer: data.currentBidUpPlayer,
          nextVoteTime: data.nextVoteTime
        });
      } else {
        console.error('Failed to fetch MarketMover status');
      }
    } catch (error) {
      console.error('Error fetching market mover status:', error);
    }
  };

  const fetchAchievementsSummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/achievements/progress', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAchievements({
          total: data.total || 0,
          completed: data.completed || 0,
          points: data.points || 0,
          recentUnlocks: data.recentUnlocks || []
        });
      }
    } catch (error) {
      console.error('Error fetching achievements:', error);
    }
  };

  const handleVote = async (player, newTicketCount) => {
    try {
      // Update local ticket count
      if (newTicketCount !== undefined) {
        setUserTickets(newTicketCount);
        if (updateUserTickets) {
          updateUserTickets(newTicketCount);
        }
      }
      
      // Refresh MarketMover status to show updated leaderboard
      await fetchMarketMoverStatus();
      
      // Show success message
      console.log(`Successfully voted for ${player.name}`);
    } catch (error) {
      console.error('Error processing vote:', error);
    }
  };

  const handleOwnershipQuery = async (newTicketCount) => {
    try {
      // Update local ticket count
      if (newTicketCount !== undefined) {
        setUserTickets(newTicketCount);
        if (updateUserTickets) {
          updateUserTickets(newTicketCount);
        }
      }
    } catch (error) {
      console.error('Error processing ownership query:', error);
    }
  };

  const formatTimeRemaining = (endTime) => {
    if (!endTime) return 'Unknown';
    
    const now = new Date();
    const end = new Date(endTime);
    const diff = end - now;
    
    if (diff <= 0) return 'Ended';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getVotingStatusDisplay = () => {
    if (marketMoverData.votingActive) {
      return {
        text: 'VOTING ACTIVE',
        className: 'status-active',
        icon: '🗳️'
      };
    } else {
      return {
        text: 'VOTING CLOSED',
        className: 'status-inactive',
        icon: '🔒'
      };
    }
  };

  const votingStatus = getVotingStatusDisplay();

  if (loading) {
    return (
      <div className="home">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home">
      {/* Achievements Badge */}
      {user && (
        <div className="achievements-badge" onClick={() => onNavigate('achievements')}>
          <div className="badge-icon">🏆</div>
          <div className="badge-info">
            <span className="badge-label">Achievements</span>
            <span className="badge-value">{achievements.completed}/{achievements.total}</span>
          </div>
          <div className="badge-points">{achievements.points} pts</div>
        </div>
      )}

      <div className="hero-section">
        <h1 className="hero-title">Fantasy Draft</h1>
        <p className="hero-subtitle">Draft. Compete. Win.</p>
        
        {!user ? (
          <div className="cta-buttons">
            <button className="btn btn-primary" onClick={() => onNavigate('login')}>
              Start Playing
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('login')}>
              Learn More
            </button>
          </div>
        ) : (
          <div className="cta-buttons">
            <button className="btn btn-primary" onClick={() => onNavigate('lobby')}>
              Enter Lobby
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('my-contests')}>
              My Contests
            </button>
          </div>
        )}
      </div>

      {/* Market Mover Section */}
      {user && (
        <div className="market-mover-section">
          <h2>Market Mover Hub</h2>
          
          <div className="voting-status">
            <div className={`status-indicator ${votingStatus.className}`}>
              <span className="status-icon">{votingStatus.icon}</span>
              <span className="status-text">{votingStatus.text}</span>
              {marketMoverData.votingActive && (
                <span className="pulse"></span>
              )}
            </div>
            {marketMoverData.nextVoteTime && (
              <p className="next-vote-time">
                {marketMoverData.votingActive 
                  ? `Voting ends in: ${formatTimeRemaining(marketMoverData.nextVoteTime)}`
                  : `Next voting period: ${new Date(marketMoverData.nextVoteTime).toLocaleString()}`
                }
              </p>
            )}
          </div>

          {marketMoverData.currentBidUpPlayer && (
            <div className="current-bid-up">
              <h3>🔥 Current BID UP Player</h3>
              <div className="bid-up-player">
                <span className="player-name">{marketMoverData.currentBidUpPlayer.name}</span>
                <span className="boost-indicator">
                  +{marketMoverData.currentBidUpPlayer.boostPercentage}% appearance rate
                </span>
              </div>
              {marketMoverData.currentBidUpPlayer.endsAt && (
                <p className="bid-up-duration">
                  Ends in: {formatTimeRemaining(marketMoverData.currentBidUpPlayer.endsAt)}
                </p>
              )}
            </div>
          )}

          <div className="market-mover-actions">
            <div 
              className={`action-card ${!marketMoverData.votingActive || userTickets < 1 ? 'disabled' : ''}`}
              onClick={() => marketMoverData.votingActive && userTickets >= 1 && setShowVoteModal(true)}
            >
              <div className="action-icon">🗳️</div>
              <h3>Vote for BID UP</h3>
              <p>Use 1 ticket to vote for the next boosted player</p>
              <span className="ticket-cost">
                {marketMoverData.votingActive 
                  ? (userTickets >= 1 ? 'Cost: 1 🎟️' : 'Need 1 🎟️')
                  : 'Voting Closed'
                }
              </span>
            </div>

            <div 
              className={`action-card ${userTickets < 1 ? 'disabled' : ''}`}
              onClick={() => userTickets >= 1 && setShowOwnershipModal(true)}
            >
              <div className="action-icon">📊</div>
              <h3>Check Ownership</h3>
              <p>See what % of lineups contain a specific player</p>
              <span className="ticket-cost">
                {userTickets >= 1 ? 'Cost: 1 🎟️' : 'Need 1 🎟️'}
              </span>
            </div>

            <div className="action-card" onClick={() => onNavigate('ticket-shop')}>
              <div className="action-icon">🎟️</div>
              <h3>Buy Tickets</h3>
              <p>Get tickets for Market Mover features</p>
              <span className="current-tickets">You have: {userTickets} 🎟️</span>
            </div>
          </div>

          {marketMoverData.leaderboard && marketMoverData.leaderboard.length > 0 && (
            <div className="vote-leaderboard">
              <h3>🏆 Current Vote Leaders</h3>
              <div className="leaders-list">
                {marketMoverData.leaderboard.slice(0, 5).map((leader, index) => (
                  <div key={index} className="leader-item">
                    <span className="rank">#{index + 1}</span>
                    <span className="player-name">{leader.name}</span>
                    <span className="vote-count">{leader.votes} votes</span>
                  </div>
                ))}
              </div>
              {marketMoverData.leaderboard.length === 0 && marketMoverData.votingActive && (
                <p className="no-votes">No votes cast yet. Be the first to vote!</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="features-section">
        <h2>Game Modes</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">💰</div>
            <h3>Cash Games</h3>
            <p>5-player winner-take-all contests with $5 entry fee</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">🎉</div>
            <h3>Daily Bash</h3>
            <p>Free entry tournament with guaranteed prizes</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">📈</div>
            <h3>Market Mover</h3>
            <p>Vote on players and compete for ownership percentage</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">🔥</div>
            <h3>Trading Floor Firesale</h3>
            <p>Fast-paced free contest with unique scoring</p>
          </div>
        </div>
      </div>

      <div className="how-it-works">
        <h2>How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Choose a Contest</h3>
            <p>Pick from various game modes and entry fees</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <h3>Draft Your Team</h3>
            <p>Select 5 players within your $15 budget</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <h3>Compete & Win</h3>
            <p>Score points based on real player performance</p>
          </div>
        </div>
      </div>

      {/* Recent Achievements */}
      {user && achievements.recentUnlocks.length > 0 && (
        <div className="recent-achievements">
          <h3>Recent Achievements</h3>
          <div className="achievements-list">
            {achievements.recentUnlocks.map((achievement, index) => (
              <div key={index} className="achievement-item">
                <span className="achievement-icon">{achievement.icon || '🏅'}</span>
                <span className="achievement-name">{achievement.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {user && (
        <>
          <VoteModal
            isOpen={showVoteModal}
            onClose={() => setShowVoteModal(false)}
            onVote={handleVote}
            tickets={userTickets}
            currentLeaders={marketMoverData.leaderboard}
          />
          <OwnershipModal
            isOpen={showOwnershipModal}
            onClose={() => setShowOwnershipModal(false)}
            onQuery={handleOwnershipQuery}
            tickets={userTickets}
          />
        </>
      )}
    </div>
  );
};

export default Home;