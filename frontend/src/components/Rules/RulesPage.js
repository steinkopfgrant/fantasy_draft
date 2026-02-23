// frontend/src/components/Rules/RulesPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './RulesPage.css';

const RulesPage = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const [expandedItems, setExpandedItems] = useState({});
  const [scoringSport, setScoringSport] = useState('nfl'); // 'nfl' or 'nba'

  const toggleExpand = (key) => {
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const CollapsibleSection = ({ title, id, children }) => (
    <div className="collapsible-section">
      <button 
        className={`collapsible-header ${expandedItems[id] ? 'expanded' : ''}`}
        onClick={() => toggleExpand(id)}
      >
        <span>{title}</span>
        <span className="expand-icon">{expandedItems[id] ? '−' : '+'}</span>
      </button>
      {expandedItems[id] && (
        <div className="collapsible-content">
          {children}
        </div>
      )}
    </div>
  );

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'scoring', label: 'Scoring' },
    { id: 'cash-games', label: 'Cash Games' },
    { id: 'market-mover', label: 'Market Mover' },
    { id: 'draft-rules', label: 'Draft Rules' },
    { id: 'lineup', label: 'Lineup Requirements' },
    { id: 'prizes', label: 'Prizes & Payouts' },
    { id: 'ineligible-states', label: 'Ineligible States' },
    { id: 'terms', label: 'Terms of Service' },
    { id: 'privacy', label: 'Privacy Policy' },
  ];

  return (
    <div className="rules-page">
      <div className="rules-container">
        {/* Sidebar Navigation */}
        <nav className="rules-sidebar">
          <h2>Rules</h2>
          <ul>
            {sections.map(section => (
              <li key={section.id}>
                <button
                  className={activeSection === section.id ? 'active' : ''}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
          <button className="back-button" onClick={() => navigate('/lobby')}>
            ← Back to Lobby
          </button>
        </nav>

        {/* Main Content */}
        <main className="rules-content">
          {/* OVERVIEW */}
          {activeSection === 'overview' && (
            <section>
              <h1>Overview</h1>
              <p className="intro-text">
                Welcome to BidBlitz! We offer snake draft fantasy contests where you compete 
                against other players by drafting the best NFL or NBA roster within a $15 budget.
              </p>

              <CollapsibleSection title="How It Works" id="how-it-works">
                <ol>
                  <li><strong>Join a Contest</strong> - Enter a Cash Game contest</li>
                  <li><strong>Draft Your Team</strong> - Snake draft with 5 teams, pick players within your $15 budget</li>
                  <li><strong>Compete</strong> - Your roster scores points based on real NFL/NBA performance</li>
                  <li><strong>Win Prizes</strong> - Highest scoring lineup wins!</li>
                </ol>
              </CollapsibleSection>

              <CollapsibleSection title="Contest Types" id="contest-types">
                <div className="contest-type">
                  <h4>💰 Cash Games</h4>
                  <p>Head-to-head drafts against 4 other players. Winner take all!</p>
                </div>
                <div className="contest-type">
                  <h4>🔥 Market Mover <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 'normal' }}>(Coming Soon)</span></h4>
                  <p>Weekly tournament with community voting that influences draft boards. Details to be determined — stay tuned!</p>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="NFL Roster Format" id="nfl-roster-format">
                <ul>
                  <li><strong>QB</strong> - 1 Quarterback</li>
                  <li><strong>RB</strong> - 1 Running Back</li>
                  <li><strong>WR</strong> - 1 Wide Receiver</li>
                  <li><strong>TE</strong> - 1 Tight End</li>
                  <li><strong>FLEX</strong> - 1 RB/WR/TE</li>
                </ul>
                <p className="note">Total Budget: $15 | Players priced $1-$5</p>
              </CollapsibleSection>

              <CollapsibleSection title="NBA Roster Format" id="nba-roster-format">
                <ul>
                  <li><strong>PG</strong> - 1 Point Guard</li>
                  <li><strong>SG</strong> - 1 Shooting Guard</li>
                  <li><strong>SF</strong> - 1 Small Forward</li>
                  <li><strong>PF</strong> - 1 Power Forward</li>
                  <li><strong>C</strong> - 1 Center</li>
                </ul>
                <p className="note">Total Budget: $15 | Players priced $1-$5</p>
              </CollapsibleSection>
            </section>
          )}

          {/* SCORING */}
          {activeSection === 'scoring' && (
            <section>
              <h1>Scoring</h1>
              
              {/* Sport Toggle */}
              <div className="sport-toggle">
                <button 
                  className={`sport-btn ${scoringSport === 'nfl' ? 'active' : ''}`}
                  onClick={() => setScoringSport('nfl')}
                >
                  🏈 NFL
                </button>
                <button 
                  className={`sport-btn ${scoringSport === 'nba' ? 'active' : ''}`}
                  onClick={() => setScoringSport('nba')}
                >
                  🏀 NBA
                </button>
              </div>

              {/* NFL SCORING */}
              {scoringSport === 'nfl' && (
                <>
                  <p className="intro-text">
                    BidBlitz uses Half-PPR scoring with Tight End Premium (TEP) and milestone bonuses.
                  </p>

                  <CollapsibleSection title="Passing" id="passing">
                    <table className="scoring-table">
                      <tbody>
                        <tr>
                          <td>Passing Yard</td>
                          <td className="points">+0.04 pts</td>
                          <td className="note-cell">(1 pt per 25 yards)</td>
                        </tr>
                        <tr>
                          <td>Passing Touchdown</td>
                          <td className="points">+4 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr>
                          <td>Interception</td>
                          <td className="points negative">-2 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr className="bonus-row">
                          <td>300+ Passing Yards Bonus</td>
                          <td className="points bonus">+2 pts</td>
                          <td className="note-cell">Milestone</td>
                        </tr>
                      </tbody>
                    </table>
                  </CollapsibleSection>

                  <CollapsibleSection title="Rushing" id="rushing">
                    <table className="scoring-table">
                      <tbody>
                        <tr>
                          <td>Rushing Yard</td>
                          <td className="points">+0.1 pts</td>
                          <td className="note-cell">(1 pt per 10 yards)</td>
                        </tr>
                        <tr>
                          <td>Rushing Touchdown</td>
                          <td className="points">+6 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr>
                          <td>Fumble Lost</td>
                          <td className="points negative">-2 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr className="bonus-row">
                          <td>100+ Rushing Yards Bonus</td>
                          <td className="points bonus">+1 pt</td>
                          <td className="note-cell">Milestone</td>
                        </tr>
                      </tbody>
                    </table>
                  </CollapsibleSection>

                  <CollapsibleSection title="Receiving" id="receiving">
                    <table className="scoring-table">
                      <tbody>
                        <tr>
                          <td>Reception (RB/WR)</td>
                          <td className="points">+0.5 pts</td>
                          <td className="note-cell">Half PPR</td>
                        </tr>
                        <tr className="tep-row">
                          <td>Reception (TE)</td>
                          <td className="points tep">+0.75 pts</td>
                          <td className="note-cell">TEP Bonus!</td>
                        </tr>
                        <tr>
                          <td>Receiving Yard</td>
                          <td className="points">+0.1 pts</td>
                          <td className="note-cell">(1 pt per 10 yards)</td>
                        </tr>
                        <tr>
                          <td>Receiving Touchdown</td>
                          <td className="points">+6 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr className="bonus-row">
                          <td>100+ Receiving Yards Bonus</td>
                          <td className="points bonus">+1 pt</td>
                          <td className="note-cell">Milestone</td>
                        </tr>
                      </tbody>
                    </table>
                  </CollapsibleSection>

                  <CollapsibleSection title="Miscellaneous" id="nfl-misc">
                    <table className="scoring-table">
                      <tbody>
                        <tr>
                          <td>2-Point Conversion (Pass/Rush/Rec)</td>
                          <td className="points">+2 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr>
                          <td>Fumble Lost</td>
                          <td className="points negative">-2 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                      </tbody>
                    </table>
                  </CollapsibleSection>

                  <CollapsibleSection title="Scoring Summary" id="nfl-scoring-summary">
                    <div className="scoring-summary">
                      <div className="summary-card">
                        <h4>Format</h4>
                        <p>Half PPR + TEP</p>
                      </div>
                      <div className="summary-card tep">
                        <h4>TE Premium</h4>
                        <p>+0.25 per catch</p>
                      </div>
                      <div className="summary-card bonus">
                        <h4>Milestones</h4>
                        <p>300 pass / 100 rush / 100 rec</p>
                      </div>
                    </div>
                  </CollapsibleSection>
                </>
              )}

              {/* NBA SCORING */}
              {scoringSport === 'nba' && (
                <>
                  <p className="intro-text">
                    BidBlitz NBA uses balanced scoring that rewards all-around play with milestone bonuses for double-doubles and triple-doubles.
                  </p>

                  <CollapsibleSection title="Scoring" id="nba-scoring">
                    <table className="scoring-table">
                      <tbody>
                        <tr>
                          <td>Point Scored</td>
                          <td className="points">+1 pt</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr className="bonus-row">
                          <td>3-Point Field Goal Made</td>
                          <td className="points bonus">+0.5 pts</td>
                          <td className="note-cell">Bonus per 3PM</td>
                        </tr>
                        <tr>
                          <td>Rebound</td>
                          <td className="points">+1 pt</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr>
                          <td>Assist</td>
                          <td className="points">+1.5 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr>
                          <td>Steal</td>
                          <td className="points">+3 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr>
                          <td>Block</td>
                          <td className="points">+2 pts</td>
                          <td className="note-cell"></td>
                        </tr>
                        <tr>
                          <td>Turnover</td>
                          <td className="points negative">-1 pt</td>
                          <td className="note-cell"></td>
                        </tr>
                      </tbody>
                    </table>
                  </CollapsibleSection>

                  <CollapsibleSection title="Milestone Bonuses" id="nba-milestones">
                    <table className="scoring-table">
                      <tbody>
                        <tr className="bonus-row">
                          <td>Double-Double</td>
                          <td className="points bonus">+2 pts</td>
                          <td className="note-cell">10+ in 2 categories</td>
                        </tr>
                        <tr className="bonus-row">
                          <td>Triple-Double</td>
                          <td className="points bonus">+4 pts</td>
                          <td className="note-cell">10+ in 3 categories</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="note">Categories: Points, Rebounds, Assists, Steals, Blocks</p>
                  </CollapsibleSection>

                  <CollapsibleSection title="Scoring Summary" id="nba-scoring-summary">
                    <div className="scoring-summary">
                      <div className="summary-card">
                        <h4>Points</h4>
                        <p>1 pt each (+0.5 for 3PM)</p>
                      </div>
                      <div className="summary-card">
                        <h4>Rebounds</h4>
                        <p>1 pt each</p>
                      </div>
                      <div className="summary-card">
                        <h4>Assists</h4>
                        <p>1.5 pts each</p>
                      </div>
                      <div className="summary-card">
                        <h4>Steals</h4>
                        <p>3 pts each</p>
                      </div>
                      <div className="summary-card">
                        <h4>Blocks</h4>
                        <p>2 pts each</p>
                      </div>
                      <div className="summary-card negative">
                        <h4>Turnovers</h4>
                        <p>-1 pt each</p>
                      </div>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Scoring Comparison" id="nba-comparison">
                    <p>BidBlitz scoring is designed to balance all positions:</p>
                    <table className="scoring-table comparison-table">
                      <thead>
                        <tr>
                          <th>Stat</th>
                          <th>DraftKings</th>
                          <th>FanDuel</th>
                          <th>BidBlitz</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Rebounds</td>
                          <td>1.25</td>
                          <td>1.2</td>
                          <td className="highlight">1.0</td>
                        </tr>
                        <tr>
                          <td>Blocks</td>
                          <td>2</td>
                          <td>3</td>
                          <td className="highlight">2</td>
                        </tr>
                        <tr>
                          <td>Steals</td>
                          <td>2</td>
                          <td>3</td>
                          <td className="highlight">3</td>
                        </tr>
                        <tr>
                          <td>Double-Double</td>
                          <td>1.5</td>
                          <td>—</td>
                          <td className="highlight">2</td>
                        </tr>
                        <tr>
                          <td>Triple-Double</td>
                          <td>3</td>
                          <td>—</td>
                          <td className="highlight">4</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="note">Lower rebound scoring prevents center dominance while rewarding versatile players.</p>
                  </CollapsibleSection>
                </>
              )}
            </section>
          )}

          {/* CASH GAMES */}
          {activeSection === 'cash-games' && (
            <section>
              <h1>Cash Games</h1>
              <p className="intro-text">
                Head-to-head draft contests. Winner takes all!
              </p>

              <CollapsibleSection title="Entry & Format" id="cash-format">
                <ul>
                  <li><strong>Players:</strong> 5 drafters per contest</li>
                  <li><strong>Draft Type:</strong> Snake draft (1-2-3-4-5, 5-4-3-2-1, ...)</li>
                  <li><strong>Time per Pick:</strong> 30 seconds</li>
                  <li><strong>Budget:</strong> $15 per team</li>
                  <li><strong>Entry Fee:</strong> $5</li>
                  <li><strong>Payout:</strong> Winner take all</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="Prizes" id="cash-prizes">
                <table className="prize-table">
                  <thead>
                    <tr>
                      <th>Entry</th>
                      <th>Prize Pool</th>
                      <th>Winner Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>$5</td>
                      <td>$25</td>
                      <td>$24</td>
                    </tr>
                  </tbody>
                </table>
                <p className="note">Platform fee: 4% rake</p>
              </CollapsibleSection>

              <CollapsibleSection title="Tiebreakers" id="cash-tiebreakers">
                <p>If two or more players have the same score:</p>
                <ol>
                  <li><strong>Lower total salary spent wins</strong> - A $14 lineup beats a $15 lineup with the same score</li>
                  <li><strong>If same score AND same salary</strong> - Players split the prize pool equally</li>
                </ol>
                <p className="note">Example: If two players tie with 120 pts and both spent $15, they each receive half the prize.</p>
              </CollapsibleSection>
            </section>
          )}

          {/* MARKET MOVER */}
          {activeSection === 'market-mover' && (
            <section>
              <h1>Market Mover</h1>
              <p className="intro-text" style={{ color: '#f59e0b' }}>
                🚧 Coming Soon — This game mode is not active during the beta launch.
              </p>
              <p className="intro-text">
                Market Mover will be a weekly tournament with community-driven player pricing through voting. 
                Entry fees, prize structures, and voting mechanics are still being finalized.
              </p>

              <CollapsibleSection title="How Voting Will Work" id="mm-voting">
                <p>Each week, users will vote on players to become "Fire Sale" or "Cool Down":</p>
                <div className="voting-info">
                  <div className="fire-sale">
                    <h4>🔥 Fire Sale</h4>
                    <p>Players voted as Fire Sale will appear more often on draft boards.</p>
                  </div>
                  <div className="cool-down">
                    <h4>❄️ Cool Down</h4>
                    <p>Players voted as Cool Down will appear less often on draft boards.</p>
                  </div>
                </div>
                <p className="note">Full details to be determined.</p>
              </CollapsibleSection>

              <CollapsibleSection title="Entry & Prizes" id="mm-prizes">
                <p style={{ color: '#64748b', fontStyle: 'italic' }}>To be determined. Entry fees and prize structures will be announced before this mode goes live.</p>
              </CollapsibleSection>
            </section>
          )}

          {/* DRAFT RULES */}
          {activeSection === 'draft-rules' && (
            <section>
              <h1>Draft Rules</h1>

              <CollapsibleSection title="Snake Draft Order" id="snake-draft">
                <p>Drafts use snake format where the order reverses each round:</p>
                <div className="snake-example">
                  <p><strong>Round 1:</strong> Team 1 → Team 2 → Team 3 → Team 4 → Team 5</p>
                  <p><strong>Round 2:</strong> Team 5 → Team 4 → Team 3 → Team 2 → Team 1</p>
                  <p><strong>Round 3:</strong> Team 1 → Team 2 → Team 3 → Team 4 → Team 5</p>
                  <p>...and so on</p>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Time Limits" id="time-limits">
                <ul>
                  <li><strong>Standard pick:</strong> 30 seconds</li>
                  <li><strong>$0 budget remaining:</strong> 4 seconds (auto-skip)</li>
                  <li><strong>Auto-pick:</strong> If timer expires, cheapest eligible player is selected</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="Budget Rules" id="budget-rules">
                <ul>
                  <li>Each team starts with <strong>$15 budget</strong></li>
                  <li>Players are priced <strong>$1 to $5</strong></li>
                  <li>You cannot draft a player you can't afford</li>
                  <li>Unspent budget does not carry over or provide bonus</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="Disconnection Policy" id="disconnection">
                <p>If you disconnect during a draft:</p>
                <ul>
                  <li>Your picks will be made automatically (cheapest eligible player)</li>
                  <li>You can rejoin at any time to resume manual picking</li>
                  <li>Draft will not pause for disconnected players</li>
                </ul>
              </CollapsibleSection>
            </section>
          )}

          {/* LINEUP REQUIREMENTS */}
          {activeSection === 'lineup' && (
            <section>
              <h1>Lineup Requirements</h1>

              <CollapsibleSection title="NFL Roster Positions" id="nfl-positions">
                <table className="position-table">
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Count</th>
                      <th>Eligible Players</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>QB</td>
                      <td>1</td>
                      <td>Quarterbacks only</td>
                    </tr>
                    <tr>
                      <td>RB</td>
                      <td>1</td>
                      <td>Running Backs only</td>
                    </tr>
                    <tr>
                      <td>WR</td>
                      <td>1</td>
                      <td>Wide Receivers only</td>
                    </tr>
                    <tr>
                      <td>TE</td>
                      <td>1</td>
                      <td>Tight Ends only</td>
                    </tr>
                    <tr>
                      <td>FLEX</td>
                      <td>1</td>
                      <td>RB, WR, or TE</td>
                    </tr>
                  </tbody>
                </table>
              </CollapsibleSection>

              <CollapsibleSection title="NBA Roster Positions" id="nba-positions">
                <table className="position-table">
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Count</th>
                      <th>Eligible Players</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>PG</td>
                      <td>1</td>
                      <td>Point Guards only</td>
                    </tr>
                    <tr>
                      <td>SG</td>
                      <td>1</td>
                      <td>Shooting Guards only</td>
                    </tr>
                    <tr>
                      <td>SF</td>
                      <td>1</td>
                      <td>Small Forwards only</td>
                    </tr>
                    <tr>
                      <td>PF</td>
                      <td>1</td>
                      <td>Power Forwards only</td>
                    </tr>
                    <tr>
                      <td>C</td>
                      <td>1</td>
                      <td>Centers only</td>
                    </tr>
                  </tbody>
                </table>
              </CollapsibleSection>

              <CollapsibleSection title="Player Eligibility" id="eligibility">
                <ul>
                  <li>Only players from games in the current week's slate are available</li>
                  <li>Players on IR, Out, or Suspended are excluded from boards</li>
                  <li>Each player can only be drafted once per contest</li>
                </ul>
              </CollapsibleSection>
            </section>
          )}

          {/* PRIZES & PAYOUTS */}
          {activeSection === 'prizes' && (
            <section>
              <h1>Prizes & Payouts</h1>

              <CollapsibleSection title="Cash Game Payouts" id="cash-payouts">
                <table className="payout-table">
                  <thead>
                    <tr>
                      <th>Entry</th>
                      <th>Prize Pool</th>
                      <th>Winner Payout</th>
                      <th>Platform Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>$5</td>
                      <td>$25</td>
                      <td>$24</td>
                      <td>$1 (4%)</td>
                    </tr>
                  </tbody>
                </table>
                <p className="note">Winner take all. Contests only run with full 5-player lobbies.</p>
              </CollapsibleSection>

              <CollapsibleSection title="Market Mover Payouts" id="mm-payouts">
                <p style={{ color: '#f59e0b', fontWeight: '600' }}>🚧 To Be Determined</p>
                <p>Market Mover is not active during the beta launch. Entry fees, prize pools, and payout structures will be announced before this mode goes live.</p>
              </CollapsibleSection>

              <CollapsibleSection title="Withdrawal Policy" id="withdrawals">
                <ul>
                  <li>Minimum withdrawal: $10</li>
                  <li>Processing time: 1-3 business days</li>
                  <li>Methods: Bank transfer, PayPal</li>
                </ul>
              </CollapsibleSection>
            </section>
          )}

          {/* INELIGIBLE STATES */}
          {activeSection === 'ineligible-states' && (
            <section>
              <h1>Ineligible States</h1>
              <p className="intro-text">
                Due to state regulations, residents of the following states are not eligible 
                to participate in paid contests:
              </p>

              <CollapsibleSection title="Restricted States" id="restricted-states">
                <div className="state-grid">
                  <div className="state">Arizona</div>
                  <div className="state">Connecticut</div>
                  <div className="state">Delaware</div>
                  <div className="state">Hawaii</div>
                  <div className="state">Idaho</div>
                  <div className="state">Louisiana</div>
                  <div className="state">Michigan</div>
                  <div className="state">Montana</div>
                  <div className="state">Nevada</div>
                  <div className="state">Washington</div>
                </div>
                <p className="note">This list is subject to change based on state legislation.</p>
              </CollapsibleSection>

              <CollapsibleSection title="Age Requirements" id="age-requirements">
                <ul>
                  <li>Must be 18+ to play (21+ in Massachusetts and Arizona)</li>
                  <li>Age verification required for withdrawals</li>
                </ul>
              </CollapsibleSection>
            </section>
          )}

          {/* TERMS OF SERVICE */}
          {activeSection === 'terms' && (
            <section>
              <h1>Terms of Service</h1>
              <p className="intro-text">
                By using BidBlitz, you agree to the following terms and conditions.
              </p>

              <CollapsibleSection title="Account Rules" id="account-rules">
                <ul>
                  <li>One account per person</li>
                  <li>Must use accurate personal information</li>
                  <li>Account sharing is prohibited</li>
                  <li>Collusion with other players is prohibited</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="Fair Play" id="fair-play">
                <ul>
                  <li>No use of bots or automated systems</li>
                  <li>No exploitation of bugs or glitches</li>
                  <li>No sharing of inside information</li>
                  <li>Violations may result in account suspension and forfeiture of funds</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="Dispute Resolution" id="disputes">
                <p>Contest results are final once games are completed and scores are settled. 
                For disputes, contact support within 48 hours of contest completion.</p>
              </CollapsibleSection>
            </section>
          )}

          {/* PRIVACY POLICY */}
          {activeSection === 'privacy' && (
            <section>
              <h1>Privacy Policy</h1>

              <CollapsibleSection title="Data We Collect" id="data-collection">
                <ul>
                  <li>Account information (email, username)</li>
                  <li>Payment information (processed securely via Stripe)</li>
                  <li>Contest history and activity</li>
                  <li>Device and browser information</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="How We Use Data" id="data-use">
                <ul>
                  <li>To operate contests and process payments</li>
                  <li>To prevent fraud and abuse</li>
                  <li>To improve our services</li>
                  <li>To communicate important updates</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="Data Protection" id="data-protection">
                <p>We use industry-standard encryption and security practices to protect 
                your personal information. We never sell your data to third parties.</p>
              </CollapsibleSection>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default RulesPage;