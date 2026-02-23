// frontend/src/components/Landing/LandingPage.js
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  // Demo board data matching real draft board layout
  const demoBoard = {
    '$5': [
      { name: 'Tyrese Maxey', pos: 'PG', team: 'PHI', price: 5, matchup: 'vs IND' },
      { name: 'Shai Gilgeous-Alexander', pos: 'SG', team: 'OKC', price: 5, matchup: 'vs TOR' },
      { name: 'LeBron James', pos: 'SF', team: 'LAL', price: 5, matchup: '@ ORL' },
      { name: 'Evan Mobley', pos: 'PF', team: 'CLE', price: 5, matchup: '@ NY' },
      { name: 'Jarrett Allen', pos: 'C', team: 'CLE', price: 5, matchup: '@ NY' },
    ],
    '$4': [
      { name: 'Jalen Brunson', pos: 'PG', team: 'NY', price: 4, matchup: 'vs CLE' },
      { name: 'Norman Powell', pos: 'SG', team: 'MIA', price: 4, matchup: 'vs MIL' },
      { name: 'Michael Porter Jr.', pos: 'SF', team: 'BKN', price: 4, matchup: '@ DAL' },
      { name: 'Julius Randle', pos: 'PF', team: 'MIN', price: 4, matchup: 'vs POR' },
      { name: 'Rudy Gobert', pos: 'C', team: 'MIN', price: 4, matchup: 'vs POR' },
    ],
    '$3': [
      { name: "D'Angelo Russell", pos: 'PG', team: 'LAL', price: 3, matchup: '@ ORL' },
      { name: 'Dyson Daniels', pos: 'SG', team: 'ATL', price: 3, matchup: '@ WAS' },
      { name: 'Brandon Miller', pos: 'SF', team: 'CHA', price: 3, matchup: 'vs CHI', highlighted: true },
      { name: 'Miles Bridges', pos: 'PF', team: 'CHA', price: 3, matchup: 'vs CHI' },
      { name: 'Nicolas Claxton', pos: 'C', team: 'BKN', price: 3, matchup: '@ DAL' },
    ],
    '$2': [
      { name: 'Tre Jones', pos: 'PG', team: 'CHI', price: 2, matchup: '@ CHA' },
      { name: 'Quentin Grimes', pos: 'SG', team: 'PHI', price: 2, matchup: 'vs IND' },
      { name: 'Kelly Oubre Jr.', pos: 'SF', team: 'PHI', price: 2, matchup: 'vs IND' },
      { name: 'Sandro Mamukelashvili', pos: 'PF', team: 'TOR', price: 2, matchup: '@ OKC' },
      { name: 'Jonas Valanciunas', pos: 'C', team: 'NOP', price: 2, matchup: '@ GS' },
    ],
    '$1': [
      { name: 'Rob Dillingham', pos: 'PG', team: 'MIN', price: 1, matchup: 'vs POR' },
      { name: 'Luke Kennard', pos: 'SG', team: 'LAL', price: 1, matchup: '@ ORL' },
      { name: 'Haywood Highsmith', pos: 'SF', team: 'MIA', price: 1, matchup: 'vs MIL' },
      { name: 'Jarred Vanderbilt', pos: 'PF', team: 'LAL', price: 1, matchup: '@ ORL' },
      { name: 'Mitchell Robinson', pos: 'C', team: 'NY', price: 1, matchup: 'vs CLE' },
    ],
    'Wildcards': [
      { name: 'Tre Jones', pos: 'PG', team: 'CHI', price: 2, matchup: '@ CHA' },
      { name: 'Lu Dort', pos: 'SG', team: 'OKC', price: 2, matchup: 'vs TOR' },
      { name: 'Kelly Oubre Jr.', pos: 'SF', team: 'PHI', price: 2, matchup: 'vs IND' },
      { name: 'Chet Holmgren', pos: 'PF', team: 'OKC', price: 5, matchup: 'vs TOR' },
      { name: 'Jock Landale', pos: 'C', team: 'ATL', price: 2, matchup: '@ WAS' },
    ]
  };

  const posColors = {
    PG: '#a855f7',
    SG: '#22c55e',
    SF: '#3b82f6',
    PF: '#f97316',
    C: '#64748b',
  };

  const posBgColors = {
    PG: 'rgba(168, 85, 247, 0.15)',
    SG: 'rgba(34, 197, 94, 0.15)',
    SF: 'rgba(59, 130, 246, 0.15)',
    PF: 'rgba(249, 115, 22, 0.15)',
    C: 'rgba(100, 116, 139, 0.15)',
  };

  // Generate non-overlapping triangles for logo
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
    const isInTextZone = (x, y) => x > textLeft && x < textRight && y > textTop && y < textBottom;

    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      if (isOverlapping(x, y)) continue;
      let probability = 0.7;
      if (isInTextZone(x, y)) probability = 0.15;
      if (Math.random() < probability) {
        const rotation = Math.random() * 360;
        placedPositions.push({ x, y });
        triangles.push(
          <polygon key={i}
            points={`${x},${y - size} ${x + size * 0.866},${y + size * 0.5} ${x - size * 0.866},${y + size * 0.5}`}
            fill="white" stroke="#000000" strokeWidth="1" strokeLinejoin="round"
            transform={`rotate(${rotation} ${x} ${y})`}
          />
        );
      }
    }
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', top: 0, left: 0, borderRadius: '16px' }}>
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
    const isInTextZone = (x, y) => x > textLeft && x < textRight && y > textTop && y < textBottom;

    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      if (isOverlapping(x, y)) continue;
      let probability = 0.7;
      if (isInTextZone(x, y)) probability = 0.15;
      if (Math.random() < probability) {
        const rotation = Math.random() * 360;
        placedPositions.push({ x, y });
        triangles.push(
          <polygon key={i}
            points={`${x},${y - size} ${x + size * 0.866},${y + size * 0.5} ${x - size * 0.866},${y + size * 0.5}`}
            fill="white" stroke="#000000" strokeWidth="0.8" strokeLinejoin="round"
            transform={`rotate(${rotation} ${x} ${y})`}
          />
        );
      }
    }
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', top: 0, left: 0, borderRadius: '10px' }}>
        {triangles}
      </svg>
    );
  }, []);

  const tiers = ['$5', '$4', '$3', '$2', '$1', 'Wildcards'];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e1b 0%, #1a1f2e 100%)',
      color: '#ffffff'
    }}>
      <style>
        {`
          @media (max-width: 768px) {
            .landing-hero { padding: 2rem 1rem !important; }
            .landing-logo { padding: 1rem 1.5rem !important; min-width: unset !important; width: 90% !important; }
            .landing-logo h1 { font-size: 2.2rem !important; letter-spacing: 2px !important; }
            .landing-tagline { font-size: 1rem !important; letter-spacing: 1px !important; }
            .landing-cta-btn { padding: 0.8rem 1.5rem !important; font-size: 1rem !important; }
            .board-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          }
        `}
      </style>

      {/* Hero Section */}
      <div className="landing-hero" style={{
        textAlign: 'center',
        padding: '3rem 2rem 2rem',
        background: 'linear-gradient(180deg, rgba(0, 191, 255, 0.08) 0%, transparent 100%)'
      }}>
        <div className="landing-logo" style={{
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

        <p className="landing-tagline" style={{
          fontSize: '1.3rem',
          color: '#94a3b8',
          marginBottom: '2rem',
          letterSpacing: '3px',
          textTransform: 'uppercase'
        }}>
          Auction Draft Fantasy
        </p>

        <div style={{
          display: 'flex',
          gap: '1.5rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '2.5rem'
        }}>
          <Link to="/rules" style={{ textDecoration: 'none' }}>
            <button className="landing-cta-btn" style={{
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
              Rules & Scoring
            </button>
          </Link>
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <button className="landing-cta-btn" style={{
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

      {/* Full Draft Board */}
      <div style={{
        padding: '0 1rem 3rem',
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        <div className="board-scroll">
          <div style={{ minWidth: '900px' }}>
            {tiers.map((tier) => (
              <div key={tier} style={{
                display: 'grid',
                gridTemplateColumns: '80px repeat(5, 1fr)',
                gap: '8px',
                marginBottom: '8px',
                alignItems: 'stretch'
              }}>
                {/* Tier label */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '800',
                  fontSize: tier === 'Wildcards' ? '0.85rem' : '1.4rem',
                  color: tier === 'Wildcards' ? '#f97316' : '#00bfff',
                  letterSpacing: tier === 'Wildcards' ? '0' : '1px'
                }}>
                  {tier}
                </div>

                {/* Player cards */}
                {demoBoard[tier].map((player, idx) => (
                  <div key={idx} style={{
                    background: player.highlighted
                      ? 'linear-gradient(135deg, rgba(0, 191, 255, 0.12), rgba(0, 150, 200, 0.08))'
                      : 'rgba(30, 41, 59, 0.8)',
                    border: player.highlighted
                      ? '2px solid #00bfff'
                      : '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '10px',
                    padding: '0.75rem 0.8rem',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    minHeight: '85px'
                  }}>
                    {/* Position badge - top right */}
                    <div style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: posBgColors[player.pos],
                      color: posColors[player.pos],
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      letterSpacing: '0.5px'
                    }}>
                      {player.pos}
                    </div>

                    {/* Player name */}
                    <div style={{
                      fontWeight: '600',
                      fontSize: '0.95rem',
                      color: '#ffffff',
                      marginBottom: '0.35rem',
                      paddingRight: '2rem',
                      lineHeight: '1.2'
                    }}>
                      {player.name}
                    </div>

                    {/* Team - Price row */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                        {player.team} - ${player.price}
                      </span>
                      <span style={{
                        background: posBgColors[player.pos],
                        color: posColors[player.pos],
                        fontSize: '0.6rem',
                        fontWeight: '700',
                        padding: '2px 5px',
                        borderRadius: '3px'
                      }}>
                        {player.pos}
                      </span>
                    </div>

                    {/* Matchup */}
                    <div style={{
                      color: '#475569',
                      fontSize: '0.7rem',
                      marginTop: '0.15rem'
                    }}>
                      {player.matchup}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{
        textAlign: 'center',
        padding: '3rem 2rem',
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(74, 222, 128, 0.05) 100%)'
      }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.75rem', color: '#ffffff' }}>
          Ready to Draft?
        </h2>
        <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '2rem' }}>
          Create an account and jump into your first auction draft.
        </p>
        <Link to="/register" style={{ textDecoration: 'none' }}>
          <button className="landing-cta-btn" style={{
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
            Create Account
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
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Auction Draft Fantasy</p>
      </footer>
    </div>
  );
};

export default LandingPage;