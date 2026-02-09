// frontend/src/components/Pools/PoolsPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const PoolsPage = () => {
  const navigate = useNavigate();
  const [pools, setPools] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sport, setSport] = useState('NFL');
  const [filters, setFilters] = useState({
    5: 'ALL',
    4: 'ALL',
    3: 'ALL',
    2: 'ALL',
    1: 'ALL'
  });

  const prices = [5, 4, 3, 2, 1];
  const nflPositions = ['ALL', 'QB', 'RB', 'WR', 'TE'];
  const nbaPositions = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];
  const positions = sport === 'NFL' ? nflPositions : nbaPositions;

  useEffect(() => {
    fetchPools();
  }, [sport]);

  // Reset filters when sport changes
  useEffect(() => {
    setFilters({
      5: 'ALL',
      4: 'ALL',
      3: 'ALL',
      2: 'ALL',
      1: 'ALL'
    });
  }, [sport]);

  const fetchPools = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/pools?sport=${sport}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setPools(response.data.pools);
    } catch (err) {
      console.error('Error fetching pools:', err);
      setError('Failed to load player pools');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (price, position) => {
    setFilters(prev => ({ ...prev, [price]: position }));
  };

  const getFilteredPlayers = (price) => {
    const players = pools[price] || [];
    if (filters[price] === 'ALL') return players;
    return players.filter(p => p.position === filters[price]);
  };

  const getPositionColor = (position) => {
    // NFL positions
    if (position === 'QB') return '#ef4444';
    if (position === 'RB') return '#22c55e';
    if (position === 'WR') return '#3b82f6';
    if (position === 'TE') return '#f59e0b';
    // NBA positions
    if (position === 'PG') return '#ef4444';
    if (position === 'SG') return '#f59e0b';
    if (position === 'SF') return '#22c55e';
    if (position === 'PF') return '#3b82f6';
    if (position === 'C') return '#8b5cf6';
    return '#8892b0';
  };

  const getPriceGradient = (price) => {
    switch (price) {
      case 5: return 'linear-gradient(135deg, #ffd700 0%, #ffaa00 100%)';
      case 4: return 'linear-gradient(135deg, #c0c0c0 0%, #a0a0a0 100%)';
      case 3: return 'linear-gradient(135deg, #cd7f32 0%, #b87333 100%)';
      case 2: return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      case 1: return 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)';
      default: return '#2a2f3e';
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '50vh',
        color: '#8892b0'
      }}>
        <div className="spinner" style={{
          width: '40px',
          height: '40px',
          border: '3px solid #2a2f3e',
          borderTop: '3px solid #00d4ff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '1.5rem', 
      maxWidth: '100%', 
      margin: '0 auto',
      minHeight: '100vh',
      background: '#0a0e1b'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: '#8892b0',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          ← Back
        </button>
        
        <h1 style={{ 
          color: '#00d4ff', 
          margin: 0,
          fontSize: '1.8rem',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {sport === 'NFL' ? '🏈' : '🏀'} Player Pools
        </h1>
        
        <div style={{ width: '80px' }}></div>
      </div>

      {/* Sport Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          display: 'flex',
          gap: '0.25rem',
          padding: '0.25rem',
          background: '#1a1f2e',
          borderRadius: '8px',
          border: '1px solid #2a2f3e'
        }}>
          <button
            onClick={() => setSport('NFL')}
            style={{
              padding: '0.6rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: sport === 'NFL' 
                ? 'linear-gradient(135deg, #00d4ff 0%, #667eea 100%)' 
                : 'transparent',
              color: sport === 'NFL' ? '#ffffff' : '#8892b0',
              boxShadow: sport === 'NFL' ? '0 4px 15px rgba(0, 212, 255, 0.3)' : 'none'
            }}
          >
            🏈 NFL
          </button>
          <button
            onClick={() => setSport('NBA')}
            style={{
              padding: '0.6rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: sport === 'NBA' 
                ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' 
                : 'transparent',
              color: sport === 'NBA' ? '#ffffff' : '#8892b0',
              boxShadow: sport === 'NBA' ? '0 4px 15px rgba(245, 158, 11, 0.3)' : 'none'
            }}
          >
            🏀 NBA
          </button>
        </div>
      </div>

      {/* Price Rows */}
      {prices.map(price => {
        const filteredPlayers = getFilteredPlayers(price);
        
        return (
          <div key={price} style={{ marginBottom: '1.5rem' }}>
            {/* Row Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
              padding: '0 0.5rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <span style={{
                  background: getPriceGradient(price),
                  color: price >= 3 ? '#0a0e1b' : '#ffffff',
                  padding: '0.4rem 1rem',
                  borderRadius: '20px',
                  fontWeight: 'bold',
                  fontSize: '1.1rem',
                  minWidth: '50px',
                  textAlign: 'center'
                }}>
                  ${price}
                </span>
                <span style={{ color: '#8892b0', fontSize: '0.85rem' }}>
                  {filteredPlayers.length} players
                </span>
              </div>
              
              {/* Position Filter */}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {positions.map(pos => (
                  <button
                    key={pos}
                    onClick={() => handleFilterChange(price, pos)}
                    style={{
                      background: filters[price] === pos 
                        ? (pos === 'ALL' ? '#00d4ff' : getPositionColor(pos))
                        : 'rgba(255,255,255,0.05)',
                      color: filters[price] === pos ? '#0a0e1b' : '#8892b0',
                      border: 'none',
                      padding: '0.35rem 0.7rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: filters[price] === pos ? 'bold' : 'normal',
                      transition: 'all 0.2s'
                    }}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Player Row */}
            <div style={{
              overflowX: 'auto',
              overflowY: 'hidden',
              paddingBottom: '0.5rem',
              WebkitOverflowScrolling: 'touch'
            }}>
              <div style={{
                display: 'flex',
                gap: '0.75rem',
                paddingLeft: '0.5rem',
                paddingRight: '1rem'
              }}>
                {filteredPlayers.length > 0 ? (
                  filteredPlayers.map((player, idx) => (
                    <div
                      key={`${player.name}-${idx}`}
                      style={{
                        background: '#1a1f2e',
                        border: '1px solid #2a2f3e',
                        borderRadius: '12px',
                        padding: '1rem',
                        minWidth: '160px',
                        maxWidth: '160px',
                        flexShrink: 0,
                        transition: 'all 0.2s',
                        cursor: 'default'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = getPositionColor(player.position);
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#2a2f3e';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* Position Badge */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.5rem'
                      }}>
                        <span style={{
                          background: getPositionColor(player.position),
                          color: '#ffffff',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 'bold'
                        }}>
                          {player.position}
                        </span>
                        <span style={{
                          color: '#8892b0',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                          {player.team}
                        </span>
                      </div>
                      
                      {/* Player Name */}
                      <div style={{
                        color: '#ffffff',
                        fontWeight: '600',
                        fontSize: '0.9rem',
                        marginBottom: '0.5rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {player.name}
                      </div>
                      
                      {/* Matchup */}
                      <div style={{
                        color: player.matchup === 'BYE' ? '#ef4444' : '#8892b0',
                        fontSize: '0.75rem'
                      }}>
                        {player.matchup}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{
                    color: '#8892b0',
                    padding: '1rem',
                    fontSize: '0.9rem'
                  }}>
                    No {sport} players at this price point
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Footer Note */}
      <div style={{
        textAlign: 'center',
        color: '#8892b0',
        fontSize: '0.8rem',
        marginTop: '2rem',
        padding: '1rem',
        borderTop: '1px solid #2a2f3e'
      }}>
        Prices may vary during Fire Sale events
      </div>

      {/* Custom scrollbar styles */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        div::-webkit-scrollbar {
          height: 6px;
        }
        
        div::-webkit-scrollbar-track {
          background: #1a1f2e;
          border-radius: 3px;
        }
        
        div::-webkit-scrollbar-thumb {
          background: #2a2f3e;
          border-radius: 3px;
        }
        
        div::-webkit-scrollbar-thumb:hover {
          background: #3a3f4e;
        }
      `}</style>
    </div>
  );
};

export default PoolsPage;