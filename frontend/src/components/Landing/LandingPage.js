// frontend/src/components/Landing/LandingPage.js
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  const [marketMoverData, setMarketMoverData] = useState({
    fireSaleList: [],
    coolDownList: [],
    leaderboard: [],
    votingActive: false,
    loading: true
  });

  useEffect(() => {
    fetchMarketMoverStatus();
    const interval = setInterval(fetchMarketMoverStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMarketMoverStatus = async () => {
    // Try multiple API endpoints
    const endpoints = [
      '/api/market-mover/status',
      `${process.env.REACT_APP_API_URL}/api/market-mover/status`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        const contentType = response.headers.get('content-type');
        
        // Make sure we got JSON, not HTML
        if (response.ok && contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log('📊 Market Mover data loaded from:', endpoint, data);
          
          setMarketMoverData({
            fireSaleList: data.fireSaleList || [],
            coolDownList: data.coolDownList || [],
            leaderboard: data.leaderboard || [],
            votingActive: data.votingActive ?? data.isActive ?? false,
            loading: false
          });
          return; // Success, exit
        }
      } catch (error) {
        console.log(`API endpoint ${endpoint} failed:`, error.message);
      }
    }
    
    // All endpoints failed - use demo data for display
    console.log('⚠️ Using demo data - API unavailable');
    setMarketMoverData({
      fireSaleList: [],
      coolDownList: [],
      leaderboard: [],
      votingActive: false,
      loading: false
    });
  };

  // Generate non-overlapping triangles
  const RadialTriangles = useMemo(() => {
    const width = 800;
    const height = 120;
    const centerX = width / 2;
    const centerY = height / 2;
    
    const triangles = [];
    const size = 4.5;
    const placedPositions = [];
    const minDistance = size * 3;
    
    const textLeft = centerX - 120;
    const textRight = centerX + 120;
    const textTop = centerY - 30;
    const textBottom = centerY + 30;
    
    const isOverlapping = (x, y) => {
      for (const pos of placedPositions) {
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (dist < minDistance) return true;
      }
      return false;
    };
    
    const isInTextZone = (x, y) => {
      return x > textLeft && x < textRight && y > textTop && y < textBottom;
    };
    
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      
      if (isOverlapping(x, y)) continue;
      
      let probability = 0.7;
      if (isInTextZone(x, y)) {
        probability = 0.15;
      }
      
      if (Math.random() < probability) {
        const rotation = Math.random() * 360;
        placedPositions.push({ x, y });
        
        triangles.push(
          <polygon
            key={i}
            points={`${x},${y - size} ${x + size * 0.866},${y + size * 0.5} ${x - size * 0.866},${y + size * 0.5}`}
            fill="white"
            stroke="#000000"
            strokeWidth="1"
            strokeLinejoin="round"
            transform={`rotate(${rotation} ${x} ${y})`}
          />
        );
      }
    }
    
    return (
      <svg 
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', top: 0, left: 0, borderRadius: '16px' }}
      >
        {triangles}
      </svg>
    );
  }, []);

  const FooterTriangles = useMemo(() => {
    const width = 300;
    const height = 60;
    const centerX = width / 2;
    const centerY = height / 2;
    
    const triangles = [];
    const size = 3.5;
    const placedPositions = [];
    const minDistance = size * 3;
    
    const textLeft = centerX - 50;
    const textRight = centerX + 50;
    const textTop = centerY - 15;
    const textBottom = centerY + 15;
    
    const isOverlapping = (x, y) => {
      for (const pos of placedPositions) {
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (dist < minDistance) return true;
      }
      return false;
    };
    
    const isInTextZone = (x, y) => {
      return x > textLeft && x < textRight && y > textTop && y < textBottom;
    };
    
    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      
      if (isOverlapping(x, y)) continue;
      
      let probability = 0.7;
      if (isInTextZone(x, y)) {
        probability = 0.15;
      }
      
      if (Math.random() < probability) {
        const rotation = Math.random() * 360;
        placedPositions.push({ x, y });
        
        triangles.push(
          <polygon
            key={i}
            points={`${x},${y - size} ${x + size * 0.866},${y + size * 0.5} ${x - size * 0.866},${y + size * 0.5}`}
            fill="white"
            stroke="#000000"
            strokeWidth="0.8"
            strokeLinejoin="round"
            transform={`rotate(${rotation} ${x} ${y})`}
          />
        );
      }
    }
    
    return (
      <svg 
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', top: 0, left: 0, borderRadius: '10px' }}
      >
        {triangles}
      </svg>
    );
  }, []);

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e1b 0%, #1a1f2e 100%)',
      color: '#ffffff'
    }}>
      <style>
        {`
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(68, 255, 68, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(68, 255, 68, 0); }
            100% { box-shadow: 0 0 0 0 rgba(68, 255, 68, 0); }
          }
        `}
      </style>
      
      {/* Hero Section */}
      <div style={{ 
        textAlign: 'center', 
        padding: '4rem 2rem',
        background: 'linear-gradient(180deg, rgba(0, 191, 255, 0.1) 0%, transparent 100%)'
      }}>
        {/* BidBlitz Logo */}
        <div style={{
          display: 'inline-block',
          position: 'relative',
          padding: '1.5rem 8rem',
          marginBottom: '1.5rem',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)',
          boxShadow: '0 8px 32px rgba(255, 165, 0, 0.4)',
          overflow: 'hidden',
          minWidth: '60vw',
          maxWidth: '900px'
        }}>
          {RadialTriangles}
          
          <h1 style={{ 
            position: 'relative',
            fontSize: '4rem', 
            fontWeight: '900',
            margin: 0,
            color: '#ffffff',
            letterSpacing: '4px',
            textShadow: `-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000,
                         -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000`
          }}>
            BidBlitz
          </h1>
        </div>

        <p style={{ 
          fontSize: '1.4rem', 
          color: '#94a3b8', 
          marginBottom: '2.5rem',
          letterSpacing: '3px',
          textTransform: 'uppercase'
        }}>
          Draft. Vote. Influence. Win.
        </p>
        
        <div style={{ 
          display: 'flex', 
          gap: '1.5rem', 
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <Link to="/register" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '1rem 2.5rem',
              fontSize: '1.1rem',
              fontWeight: '600',
              border: 'none',
              borderRadius: '8px',
              background: 'linear-gradient(45deg, #00bfff, #0099cc)',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.3s',
              boxShadow: '0 4px 15px rgba(0, 191, 255, 0.3)'
            }}>
              Start Playing Free
            </button>
          </Link>
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '1rem 2.5rem',
              fontSize: '1.1rem',
              fontWeight: '600',
              background: 'transparent',
              color: '#00bfff',
              border: '2px solid #00bfff',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}>
              Login
            </button>
          </Link>
        </div>
      </div>

      {/* MarketMover Preview Section */}
      <div style={{ 
        padding: '4rem 2rem',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <h2 style={{ 
          textAlign: 'center',
          fontSize: '2.5rem',
          marginBottom: '1rem',
          color: '#00d4ff'
        }}>
          🔥 Introducing Market Mover
        </h2>
        <p style={{
          textAlign: 'center',
          fontSize: '1.2rem',
          color: '#8892b0',
          marginBottom: '3rem',
          maxWidth: '600px',
          margin: '0 auto 3rem'
        }}>
          The first fantasy platform where YOU control the player pool. 
          Vote for players to boost their appearance rates and gain competitive intelligence.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          marginBottom: '3rem'
        }}>
          {/* FIRE SALE Players Card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 170, 68, 0.15), rgba(255, 140, 0, 0.1))',
            border: '2px solid #ffd700',
            borderRadius: '16px',
            padding: '2rem',
            textAlign: 'center',
            minHeight: '200px'
          }}>
            <h3 style={{ color: '#ffd700', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <span>🔥</span> FIRE SALE
            </h3>
            <p style={{ color: '#8892b0', fontSize: '0.85rem', marginBottom: '1rem' }}>
              100% guaranteed appearance
            </p>
            
            {marketMoverData.loading ? (
              <div style={{ color: '#8892b0' }}>Loading...</div>
            ) : marketMoverData.fireSaleList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {marketMoverData.fireSaleList.slice(0, 3).map((player, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0',
                    borderBottom: index < Math.min(marketMoverData.fireSaleList.length, 3) - 1 ? '1px solid rgba(255,215,0,0.2)' : 'none'
                  }}>
                    <span style={{ color: '#ffd700', fontWeight: 'bold' }}>#{index + 1}</span>
                    <span style={{ color: '#fff', fontWeight: '500', flex: 1, marginLeft: '0.5rem', textAlign: 'left' }}>
                      {player.name}
                    </span>
                    <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '0.9rem' }}>
                      {player.votes || 0} votes
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#8892b0', fontStyle: 'italic' }}>
                No players currently on FIRE
                <br />
                <span style={{ fontSize: '0.9rem' }}>Vote to boost your favorites!</span>
              </div>
            )}
          </div>

          {/* Vote Leaders Card */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '2px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            padding: '2rem',
            minHeight: '200px'
          }}>
            <h3 style={{ 
              color: '#ffd700', 
              marginBottom: '0.5rem',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}>
              <span>🏆</span> Vote Leaders
            </h3>
            <p style={{ color: '#8892b0', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
              Current voting period
            </p>
            
            {marketMoverData.loading ? (
              <div style={{ color: '#8892b0', textAlign: 'center' }}>Loading...</div>
            ) : marketMoverData.leaderboard.length > 0 ? (
              <div>
                {marketMoverData.leaderboard.slice(0, 3).map((leader, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0',
                    borderBottom: index < 2 ? '1px solid rgba(255,255,255,0.1)' : 'none'
                  }}>
                    <span style={{ color: '#ffd700', fontWeight: 'bold' }}>#{index + 1}</span>
                    <span style={{ color: '#ffffff', fontWeight: '500', flex: 1, marginLeft: '0.5rem', textAlign: 'left' }}>
                      {leader.name}
                    </span>
                    <span style={{ color: '#4ade80', fontWeight: 'bold' }}>
                      {leader.votes} votes
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#8892b0', textAlign: 'center', fontStyle: 'italic' }}>
                No votes cast yet
                <br />
                <span style={{ fontSize: '0.9rem' }}>Be the first to vote!</span>
              </div>
            )}
          </div>

          {/* Voting Status Card */}
          <div style={{
            background: marketMoverData.votingActive ? 'rgba(68, 255, 68, 0.1)' : 'rgba(255, 68, 68, 0.1)',
            border: `2px solid ${marketMoverData.votingActive ? '#44ff44' : '#ff4444'}`,
            borderRadius: '16px',
            padding: '2rem',
            textAlign: 'center',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginBottom: '1rem'
            }}>
              <span style={{ fontSize: '2rem' }}>🗳️</span>
              <h3 style={{ 
                color: marketMoverData.votingActive ? '#44ff44' : '#ff4444', 
                margin: 0,
                fontSize: '1.3rem'
              }}>
                {marketMoverData.loading ? 'CHECKING...' : (marketMoverData.votingActive ? 'VOTING ACTIVE' : 'VOTING CLOSED')}
              </h3>
              {marketMoverData.votingActive && !marketMoverData.loading && (
                <div style={{
                  width: '10px',
                  height: '10px',
                  background: '#44ff44',
                  borderRadius: '50%',
                  animation: 'pulse 2s infinite'
                }} />
              )}
            </div>
            <p style={{ color: '#8892b0', margin: 0, lineHeight: '1.6' }}>
              {marketMoverData.votingActive 
                ? 'Cast your vote every 6 hours to influence which players appear more often!'
                : 'Voting is currently closed. Check back soon!'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div style={{ padding: '4rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: '2.5rem', marginBottom: '3rem', color: '#ffffff' }}>
          Game Modes
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
          {[
            { icon: '💰', title: 'Cash Games', desc: '5-player winner-take-all contests with $5 entry fee. Fast-paced action with immediate payouts.' },
            { icon: '📈', title: 'Market Mover', desc: 'Vote for players and check ownership data. Influence the market and gain competitive intelligence.' },
            { icon: '🔥', title: 'Fire Sale', desc: 'Free entry tournament with bonus scoring for strategic stacks and picks.' }
          ].map((feature, i) => (
            <div key={i} style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '2rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{feature.icon}</div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#00bfff' }}>{feature.title}</h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.6' }}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div style={{ padding: '4rem 2rem', background: 'rgba(0, 0, 0, 0.2)' }}>
        <h2 style={{ textAlign: 'center', fontSize: '2.5rem', marginBottom: '3rem', color: '#ffffff' }}>
          How It Works
        </h2>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', maxWidth: '1000px', margin: '0 auto', flexWrap: 'wrap' }}>
          {[
            { num: 1, title: 'Join a Contest', desc: 'Pick from cash games, tournaments, or Market Mover contests' },
            { num: 2, title: 'Draft Your Team', desc: 'Select 5 players within your $15 budget' },
            { num: 3, title: 'Influence the Market', desc: 'Vote for players to boost their appearance' },
            { num: 4, title: 'Compete & Win', desc: 'Score points based on real player performance' }
          ].map((step) => (
            <div key={step.num} style={{ flex: '1', minWidth: '200px', textAlign: 'center', padding: '2rem' }}>
              <div style={{
                width: '60px',
                height: '60px',
                background: 'linear-gradient(45deg, #00bfff, #4ade80)',
                color: '#1a1a2e',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                boxShadow: '0 4px 15px rgba(0, 191, 255, 0.3)'
              }}>
                {step.num}
              </div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '1rem', color: '#ffffff' }}>{step.title}</h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.6' }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(102, 126, 234, 0.1) 100%)' }}>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#00d4ff' }}>
          Ready to Start Playing?
        </h2>
        <p style={{ fontSize: '1.2rem', color: '#8892b0', marginBottom: '2rem' }}>
          Join BidBlitz - the most innovative fantasy platform ever created.
        </p>
        
        <Link to="/register" style={{ textDecoration: 'none' }}>
          <button style={{
            padding: '1.2rem 3rem',
            fontSize: '1.2rem',
            fontWeight: '700',
            border: 'none',
            borderRadius: '8px',
            background: 'linear-gradient(45deg, #00bfff, #0099cc)',
            color: 'white',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0, 191, 255, 0.4)'
          }}>
            Get Started - It's Free!
          </button>
        </Link>
      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', color: '#8892b0' }}>
        <div style={{
          display: 'inline-block',
          position: 'relative',
          padding: '0.6rem 2.5rem',
          marginBottom: '0.5rem',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)',
          overflow: 'hidden'
        }}>
          {FooterTriangles}
          <span style={{ 
            position: 'relative',
            fontWeight: '800',
            fontSize: '1.2rem',
            color: '#ffffff',
            textShadow: `-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000`
          }}>
            BidBlitz
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Draft. Vote. Influence. Win.</p>
      </footer>
    </div>
  );
};

export default LandingPage;