// frontend/src/components/Dashboard/Dashboard.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuthUser } from '../../store/slices/authSlice';

const Dashboard = ({ showToast }) => {
  const user = useSelector(selectAuthUser);
  const navigate = useNavigate();
  const [marketMoverData, setMarketMoverData] = useState({
    votingActive: false,
    currentBidUpPlayer: null,
    leaderboard: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchMarketMoverSummary();
    }
  }, [user]);

  const fetchMarketMoverSummary = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/market-mover/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMarketMoverData({
          votingActive: data.votingActive || false,
          currentBidUpPlayer: data.currentBidUpPlayer,
          leaderboard: data.leaderboard || []
        });
      }
    } catch (error) {
      console.error('Error fetching MarketMover summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarketMoverClick = () => {
    navigate('/market-mover');
  };

  // Admin panel navigation function
  const handleAdminClick = () => {
    console.log('Navigating to admin panel with user:', user?.username);
    navigate('/admin');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: '#00d4ff', marginBottom: '2rem' }}>
        Dashboard
      </h1>
      <p style={{ fontSize: '1.2rem', marginBottom: '3rem', color: '#8892b0' }}>
        Welcome back, {user?.username || 'Player'}!
      </p>
      
      <div style={{ 
        display: 'grid', 
        gap: '2rem', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        marginBottom: '3rem'
      }}>
        {/* User Stats Card */}
        <div style={{ 
          padding: '2rem', 
          background: '#1a1f2e',
          border: '2px solid #2a2f3e', 
          borderRadius: '16px' 
        }}>
          <h3 style={{ color: '#00d4ff', marginBottom: '1.5rem' }}>Your Stats</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8892b0' }}>Balance:</span>
              <span style={{ color: '#44ff44', fontWeight: 'bold', fontSize: '1.2rem' }}>
                ${user?.balance || 0}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8892b0' }}>Tickets:</span>
              <span style={{ color: '#ffaa44', fontWeight: 'bold', fontSize: '1.2rem' }}>
                {user?.tickets || 0} 🎟️
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8892b0' }}>Total Contests:</span>
              <span style={{ color: '#ffffff' }}>{user?.total_contests_entered || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8892b0' }}>Wins:</span>
              <span style={{ color: '#ffffff' }}>{user?.total_contests_won || 0}</span>
            </div>
          </div>
        </div>
        
        {/* MarketMover Summary Card */}
        <div style={{ 
          padding: '2rem', 
          background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(102, 126, 234, 0.1) 100%)',
          border: '2px solid #00d4ff', 
          borderRadius: '16px',
          cursor: 'pointer',
          transition: 'all 0.3s'
        }}
        onClick={handleMarketMoverClick}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-5px)';
          e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 212, 255, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        >
          <h3 style={{ color: '#00d4ff', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📈 Market Mover
          </h3>
          
          {loading ? (
            <p style={{ color: '#8892b0' }}>Loading...</p>
          ) : (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  marginBottom: '0.5rem' 
                }}>
                  <span style={{ 
                    fontSize: '0.8rem',
                    color: marketMoverData.votingActive ? '#44ff44' : '#666666',
                    fontWeight: 'bold'
                  }}>
                    {marketMoverData.votingActive ? '🗳️ VOTING ACTIVE' : '🔒 VOTING CLOSED'}
                  </span>
                </div>
                
                {marketMoverData.currentBidUpPlayer && (
                  <div style={{ 
                    background: 'rgba(255, 170, 68, 0.2)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#ffaa44', marginBottom: '0.25rem' }}>
                      🔥 Current BID UP:
                    </div>
                    <div style={{ color: '#ffffff', fontWeight: 'bold' }}>
                      {marketMoverData.currentBidUpPlayer.name}
                    </div>
                  </div>
                )}
                
                {marketMoverData.leaderboard.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#8892b0', marginBottom: '0.5rem' }}>
                      Vote Leaders:
                    </div>
                    {marketMoverData.leaderboard.slice(0, 3).map((leader, index) => (
                      <div key={index} style={{ 
                        fontSize: '0.8rem', 
                        color: '#ffffff',
                        marginBottom: '0.25rem' 
                      }}>
                        {index + 1}. {leader.name} ({leader.votes})
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div style={{ 
                background: '#00d4ff',
                color: '#0a0e1b',
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}>
                Click to Enter Market Mover Hub
              </div>
            </>
          )}
        </div>
        
        {/* Quick Actions Card */}
        <div style={{ 
          padding: '2rem', 
          background: '#1a1f2e',
          border: '2px solid #2a2f3e', 
          borderRadius: '16px' 
        }}>
          <h3 style={{ color: '#00d4ff', marginBottom: '1.5rem' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Link to="/lobby" style={{ textDecoration: 'none' }}>
              <button style={{ 
                width: '100%',
                padding: '1rem',
                background: '#44ff44',
                color: '#0a0e1b',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}>
                🎯 View Contests
              </button>
            </Link>
            
            <button 
              onClick={() => navigate('/rules')}
              style={{ 
                width: '100%',
                padding: '1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            >
              📋 Rules & Scoring
            </button>
            
            {/* ADMIN PANEL BUTTON - Only shows for specific user */}
            {user?.username === 'aaaaaa' && (
              <button 
                onClick={handleAdminClick}
                style={{ 
                  width: '100%',
                  padding: '1rem',
                  background: 'linear-gradient(45deg, #ff6b6b, #ff8e53)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  boxShadow: '0 2px 10px rgba(255, 107, 107, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.boxShadow = '0 4px 20px rgba(255, 107, 107, 0.5)';
                  e.target.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.boxShadow = '0 2px 10px rgba(255, 107, 107, 0.3)';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                🛠️ Admin Panel
              </button>
            )}
            
            <Link to="/profile" style={{ textDecoration: 'none' }}>
              <button style={{ 
                width: '100%',
                padding: '1rem',
                background: '#2a2f3e',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}>
                ⚙️ Edit Profile
              </button>
            </Link>
          </div>
        </div>
      </div>
      
      {/* Recent Activity Section */}
      <div style={{ 
        padding: '2rem', 
        background: '#1a1f2e',
        border: '2px solid #2a2f3e', 
        borderRadius: '16px' 
      }}>
        <h3 style={{ color: '#00d4ff', marginBottom: '1.5rem' }}>Recent Activity</h3>
        <p style={{ color: '#8892b0' }}>
          No recent activity. Join a contest to get started!
        </p>
        
        {/* Placeholder for recent contests, votes, etc. */}
        <div style={{ marginTop: '1rem' }}>
          <Link 
            to="/lobby" 
            style={{ 
              color: '#00d4ff', 
              textDecoration: 'none',
              fontSize: '1rem',
              fontWeight: '500'
            }}
          >
            → Browse Available Contests
          </Link>
        </div>
      </div>

      {/* Floating Admin Button (Alternative placement) - Only for specific user */}
      {user?.username === 'aaaaaa' && (
        <button 
          onClick={handleAdminClick}
          style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            padding: '15px 25px',
            background: 'linear-gradient(45deg, #ff6b6b, #ff8e53)',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(255, 107, 107, 0.4)',
            transition: 'all 0.3s',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 30px rgba(255, 107, 107, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 107, 107, 0.4)';
          }}
        >
          🛠️ Admin Panel
        </button>
      )}
    </div>
  );
};

export default Dashboard;