// frontend/src/components/Landing/LandingPage.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  // Demo draft board state
  const [currentPick, setCurrentPick] = useState(0);
  const [demoTimer, setDemoTimer] = useState(15);
  const [demoBudget, setDemoBudget] = useState(15.00);
  const [demoRoster, setDemoRoster] = useState([]);
  const [bidAmount, setBidAmount] = useState(null);
  const [showBidAnimation, setShowBidAnimation] = useState(false);

  const demoPlayers = useMemo(() => [
    { name: 'Josh Allen', pos: 'QB', team: 'BUF', price: 4.25 },
    { name: 'Saquon Barkley', pos: 'RB', team: 'PHI', price: 3.75 },
    { name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', price: 3.50 },
    { name: 'Sam LaPorta', pos: 'TE', team: 'DET', price: 2.00 },
    { name: 'Lamar Jackson', pos: 'QB', team: 'BAL', price: 4.00 },
    { name: 'Derrick Henry', pos: 'RB', team: 'BAL', price: 3.25 },
    { name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', price: 3.75 },
    { name: 'Travis Kelce', pos: 'TE', team: 'KC', price: 2.75 },
  ], []);

  // Auto-cycle demo draft
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setDemoTimer(prev => {
        if (prev <= 1) {
          // "Win" the pick
          setCurrentPick(p => {
            const nextPick = (p + 1) % demoPlayers.length;
            const player = demoPlayers[p];
            const cost = player.price + (Math.random() * 0.5 - 0.25);
            const roundedCost = Math.round(cost * 100) / 100;

            setBidAmount(roundedCost);
            setShowBidAnimation(true);
            setTimeout(() => setShowBidAnimation(false), 1200);

            setDemoRoster(prev => {
              const newRoster = [...prev, { ...player, cost: roundedCost }];
              if (newRoster.length > 5) return newRoster.slice(-5);
              return newRoster;
            });

            setDemoBudget(b => {
              const newBudget = b - roundedCost;
              if (newBudget < 2) return 15.00;
              return Math.round(newBudget * 100) / 100;
            });

            return nextPick;
          });
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [demoPlayers]);

  // Reset demo periodically
  useEffect(() => {
    const resetInterval = setInterval(() => {
      setDemoRoster([]);
      setDemoBudget(15.00);
      setCurrentPick(0);
    }, 90000);
    return () => clearInterval(resetInterval);
  }, []);

  const posColors = {
    QB: '#ff6b6b',
    RB: '#51cf66',
    WR: '#339af0',
    TE: '#ffd43b',
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

  const currentPlayer = demoPlayers[currentPick];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e1b 0%, #1a1f2e 100%)',
      color: '#ffffff'
    }}>
      <style>
        {`
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(0, 191, 255, 0.6); }
            70% { box-shadow: 0 0 0 12px rgba(0, 191, 255, 0); }
            100% { box-shadow: 0 0 0 0 rgba(0, 191, 255, 0); }
          }
          @keyframes bidPop {
            0% { transform: scale(1); }
            50% { transform: scale(1.15); }
            100% { transform: scale(1); }
          }
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes timerPulse {
            0% { color: #ff6b6b; }
            50% { color: #ffffff; }
            100% { color: #ff6b6b; }
          }
          @keyframes cardGlow {
            0% { border-color: rgba(0, 191, 255, 0.3); }
            50% { border-color: rgba(0, 191, 255, 0.7); }
            100% { border-color: rgba(0, 191, 255, 0.3); }
          }
          @media (max-width: 768px) {
            .landing-hero { padding: 2rem 1rem !important; }
            .landing-logo { padding: 1rem 1.5rem !important; min-width: unset !important; width: 90% !important; }
            .landing-logo h1 { font-size: 2.2rem !important; letter-spacing: 2px !important; }
            .landing-tagline { font-size: 1rem !important; letter-spacing: 1px !important; }
            .landing-section { padding: 2rem 1rem !important; }
            .landing-section-title { font-size: 1.6rem !important; }
            .landing-cta-btn { padding: 0.8rem 1.5rem !important; font-size: 1rem !important; }
            .draft-board-grid { grid-template-columns: 1fr !important; }
            .draft-board-container { padding: 1rem !important; }
            .draft-sidebar { order: -1; }
          }
        `}
      </style>

      {/* Hero Section */}
      <div className="landing-hero" style={{
        textAlign: 'center',
        padding: '3rem 2rem 2rem',
        background: 'linear-gradient(180deg, rgba(0, 191, 255, 0.08) 0%, transparent 100%)'
      }}>
        {/* BidBlitz Logo */}
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
          Auction Draft Fantasy. Outsmart. Outbid. Outplay.
        </p>

        <div style={{
          display: 'flex',
          gap: '1.5rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
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

      {/* Live Draft Board Preview */}
      <div className="landing-section" style={{
        padding: '3rem 2rem',
        maxWidth: '1100px',
        margin: '0 auto'
      }}>
        <h2 className="landing-section-title" style={{
          textAlign: 'center',
          fontSize: '2rem',
          marginBottom: '0.5rem',
          color: '#ffffff'
        }}>
          Live Draft Preview
        </h2>
        <p style={{
          textAlign: 'center',
          color: '#64748b',
          fontSize: '0.95rem',
          marginBottom: '2rem'
        }}>
          5 players &bull; $15 budget &bull; Auction-style bidding &bull; Winner takes all
        </p>

        <div className="draft-board-container" style={{
          background: 'linear-gradient(135deg, #111827, #1e293b)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
        }}>
          {/* Draft Header Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '10px',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>PICK</span>
              <span style={{
                background: 'linear-gradient(45deg, #00bfff, #0099cc)',
                color: '#fff',
                padding: '0.25rem 0.75rem',
                borderRadius: '6px',
                fontWeight: '700',
                fontSize: '0.95rem'
              }}>
                {demoRoster.length + 1} / 5
              </span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              ...(demoTimer <= 5 ? { animation: 'timerPulse 0.5s ease infinite' } : {})
            }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>TIME</span>
              <span style={{
                fontWeight: '700',
                fontSize: '1.4rem',
                fontFamily: 'monospace',
                color: demoTimer <= 5 ? '#ff6b6b' : '#ffffff',
                minWidth: '35px',
                textAlign: 'center'
              }}>
                {demoTimer}s
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>BUDGET</span>
              <span style={{
                fontWeight: '700',
                fontSize: '1.1rem',
                color: '#4ade80'
              }}>
                ${demoBudget.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="draft-board-grid" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 300px',
            gap: '1.5rem'
          }}>
            {/* Player on the Block */}
            <div>
              {/* Current Player Card */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '2px solid rgba(0, 191, 255, 0.4)',
                borderRadius: '12px',
                padding: '1.5rem',
                marginBottom: '1.25rem',
                animation: 'cardGlow 2s ease infinite',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  background: 'linear-gradient(45deg, transparent, rgba(0, 191, 255, 0.05))',
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none'
                }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Player avatar placeholder */}
                    <div style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${posColors[currentPlayer.pos]}44, ${posColors[currentPlayer.pos]}22)`,
                      border: `2px solid ${posColors[currentPlayer.pos]}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '800',
                      fontSize: '0.8rem',
                      color: posColors[currentPlayer.pos],
                      flexShrink: 0
                    }}>
                      {currentPlayer.pos}
                    </div>
                    <div>
                      <div style={{
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        color: '#ffffff',
                        marginBottom: '0.2rem'
                      }}>
                        {currentPlayer.name}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{
                          color: posColors[currentPlayer.pos],
                          fontWeight: '600',
                          fontSize: '0.85rem'
                        }}>
                          {currentPlayer.pos}
                        </span>
                        <span style={{ color: '#475569' }}>&bull;</span>
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                          {currentPlayer.team}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    textAlign: 'right',
                    animation: showBidAnimation ? 'bidPop 0.4s ease' : 'none'
                  }}>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                      CURRENT BID
                    </div>
                    <div style={{
                      fontSize: '1.8rem',
                      fontWeight: '800',
                      color: '#4ade80'
                    }}>
                      ${currentPlayer.price.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Bid buttons (visual only) */}
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '1.25rem',
                  flexWrap: 'wrap'
                }}>
                  {[0.25, 0.50, 1.00].map(increment => (
                    <div key={increment} style={{
                      flex: 1,
                      padding: '0.6rem',
                      textAlign: 'center',
                      background: 'rgba(0, 191, 255, 0.1)',
                      border: '1px solid rgba(0, 191, 255, 0.3)',
                      borderRadius: '8px',
                      color: '#00bfff',
                      fontWeight: '600',
                      fontSize: '0.9rem',
                      cursor: 'default'
                    }}>
                      +${increment.toFixed(2)}
                    </div>
                  ))}
                  <div style={{
                    flex: 1,
                    padding: '0.6rem',
                    textAlign: 'center',
                    background: 'rgba(255, 107, 107, 0.1)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    borderRadius: '8px',
                    color: '#ff6b6b',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    cursor: 'default'
                  }}>
                    Pass
                  </div>
                </div>
              </div>

              {/* Upcoming players */}
              <div style={{ color: '#475569', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', letterSpacing: '1px' }}>
                UP NEXT
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[1, 2, 3].map(offset => {
                  const idx = (currentPick + offset) % demoPlayers.length;
                  const player = demoPlayers[idx];
                  return (
                    <div key={offset} style={{
                      flex: 1,
                      minWidth: '120px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      padding: '0.6rem 0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <span style={{
                        color: posColors[player.pos],
                        fontWeight: '700',
                        fontSize: '0.75rem',
                        background: `${posColors[player.pos]}15`,
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px'
                      }}>
                        {player.pos}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: '500' }}>
                        {player.name.split(' ')[1]}
                      </span>
                      <span style={{ color: '#4ade80', fontSize: '0.8rem', fontWeight: '600', marginLeft: 'auto' }}>
                        ${player.price.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Roster Sidebar */}
            <div className="draft-sidebar" style={{
              background: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '12px',
              padding: '1rem'
            }}>
              <div style={{
                color: '#64748b',
                fontSize: '0.8rem',
                fontWeight: '600',
                letterSpacing: '1px',
                marginBottom: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span>YOUR ROSTER</span>
                <span>{demoRoster.length}/5</span>
              </div>

              {/* Roster slots */}
              {[0, 1, 2, 3, 4].map(slot => {
                const player = demoRoster[slot];
                return (
                  <div key={slot} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.5rem',
                    borderBottom: slot < 4 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                    animation: player && slot === demoRoster.length - 1 ? 'slideIn 0.4s ease' : 'none'
                  }}>
                    {player ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            color: posColors[player.pos],
                            fontWeight: '700',
                            fontSize: '0.75rem',
                            width: '28px'
                          }}>
                            {player.pos}
                          </span>
                          <span style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: '500' }}>
                            {player.name}
                          </span>
                        </div>
                        <span style={{
                          color: '#4ade80',
                          fontWeight: '600',
                          fontSize: '0.85rem'
                        }}>
                          ${player.cost.toFixed(2)}
                        </span>
                      </>
                    ) : (
                      <div style={{
                        color: '#334155',
                        fontSize: '0.85rem',
                        fontStyle: 'italic',
                        width: '100%',
                        textAlign: 'center'
                      }}>
                        — empty —
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Budget summary */}
              <div style={{
                marginTop: '0.75rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Remaining</span>
                <span style={{
                  color: '#4ade80',
                  fontWeight: '700',
                  fontSize: '1.1rem'
                }}>
                  ${demoBudget.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Demo label */}
          <div style={{
            textAlign: 'center',
            marginTop: '1rem',
            color: '#475569',
            fontSize: '0.8rem'
          }}>
            <span style={{
              background: 'rgba(0, 191, 255, 0.1)',
              border: '1px solid rgba(0, 191, 255, 0.2)',
              padding: '0.25rem 0.75rem',
              borderRadius: '20px',
              color: '#00bfff',
              fontWeight: '500'
            }}>
              LIVE DEMO — This is what a real draft looks like
            </span>
          </div>
        </div>
      </div>

      {/* How It Works - Simplified */}
      <div className="landing-section" style={{
        padding: '3rem 2rem',
        background: 'rgba(0, 0, 0, 0.15)'
      }}>
        <h2 className="landing-section-title" style={{
          textAlign: 'center',
          fontSize: '2rem',
          marginBottom: '2.5rem',
          color: '#ffffff'
        }}>
          How It Works
        </h2>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '2rem',
          maxWidth: '900px',
          margin: '0 auto',
          flexWrap: 'wrap'
        }}>
          {[
            { num: 1, title: 'Join a Contest', desc: '$5 entry, 5 players compete' },
            { num: 2, title: 'Auction Draft', desc: 'Bid on players within a $15 budget' },
            { num: 3, title: 'Build Your Roster', desc: 'Fill 5 roster spots strategically' },
            { num: 4, title: 'Win It All', desc: 'Highest score takes the pot' }
          ].map((step) => (
            <div key={step.num} style={{ flex: '1', minWidth: '180px', textAlign: 'center', padding: '1rem' }}>
              <div style={{
                width: '52px',
                height: '52px',
                background: 'linear-gradient(45deg, #00bfff, #4ade80)',
                color: '#0a0e1b',
                fontSize: '1.3rem',
                fontWeight: 'bold',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
                boxShadow: '0 4px 15px rgba(0, 191, 255, 0.3)'
              }}>
                {step.num}
              </div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#ffffff' }}>{step.title}</h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.5', fontSize: '0.95rem' }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="landing-section" style={{
        textAlign: 'center',
        padding: '3.5rem 2rem',
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(74, 222, 128, 0.05) 100%)'
      }}>
        <h2 className="landing-section-title" style={{
          fontSize: '2.2rem',
          marginBottom: '0.75rem',
          color: '#ffffff'
        }}>
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