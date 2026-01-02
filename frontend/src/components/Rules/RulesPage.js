// frontend/src/components/Rules/RulesPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './RulesPage.css';

const RulesPage = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const [expandedItems, setExpandedItems] = useState({});

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
                against other players by drafting the best NFL roster within a $15 budget.
              </p>

              <CollapsibleSection title="How It Works" id="how-it-works">
                <ol>
                  <li><strong>Join a Contest</strong> - Enter a Cash Game or Market Mover contest</li>
                  <li><strong>Draft Your Team</strong> - Snake draft with 5 teams, pick players within your $15 budget</li>
                  <li><strong>Compete</strong> - Your roster scores points based on real NFL performance</li>
                  <li><strong>Win Prizes</strong> - Top finishers win cash prizes!</li>
                </ol>
              </CollapsibleSection>

              <CollapsibleSection title="Contest Types" id="contest-types">
                <div className="contest-type">
                  <h4>💰 Cash Games</h4>
                  <p>Head-to-head drafts against 4 other players. Entry fees range from $1 to $100. 
                  Top 2 finishers win prizes.</p>
                </div>
                <div className="contest-type">
                  <h4>🔥 Market Mover</h4>
                  <p>Weekly tournament with community voting. Fire Sale players get boosted odds 
                  on draft boards, Cool Down players get reduced odds. $25 entry with massive prize pools.</p>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Roster Format" id="roster-format">
                <ul>
                  <li><strong>QB</strong> - 1 Quarterback</li>
                  <li><strong>RB</strong> - 1 Running Back</li>
                  <li><strong>WR</strong> - 1 Wide Receiver</li>
                  <li><strong>TE</strong> - 1 Tight End</li>
                  <li><strong>FLEX</strong> - 1 RB/WR/TE</li>
                </ul>
                <p className="note">Total Budget: $15 | Players priced $1-$5</p>
              </CollapsibleSection>
            </section>
          )}

          {/* SCORING */}
          {activeSection === 'scoring' && (
            <section>
              <h1>Scoring</h1>
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

              <CollapsibleSection title="Miscellaneous" id="misc">
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

              <CollapsibleSection title="Scoring Summary" id="scoring-summary">
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
            </section>
          )}

          {/* CASH GAMES */}
          {activeSection === 'cash-games' && (
            <section>
              <h1>Cash Games</h1>
              <p className="intro-text">
                Standard head-to-head draft contests with fixed prize pools.
              </p>

              <CollapsibleSection title="Entry & Format" id="cash-format">
                <ul>
                  <li><strong>Players:</strong> 5 drafters per contest</li>
                  <li><strong>Draft Type:</strong> Snake draft (1-2-3-4-5, 5-4-3-2-1, ...)</li>
                  <li><strong>Time per Pick:</strong> 30 seconds</li>
                  <li><strong>Budget:</strong> $15 per team</li>
                  <li><strong>Entry Fees:</strong> $1, $5, $10, $25, $50, $100</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="Prizes" id="cash-prizes">
                <table className="prize-table">
                  <thead>
                    <tr>
                      <th>Place</th>
                      <th>Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>🥇 1st Place</td>
                      <td>60% of prize pool</td>
                    </tr>
                    <tr>
                      <td>🥈 2nd Place</td>
                      <td>24% of prize pool</td>
                    </tr>
                  </tbody>
                </table>
                <p className="note">Platform fee: 4% rake on full contests, 20% on underfilled contests</p>
              </CollapsibleSection>

              <CollapsibleSection title="Tiebreakers" id="cash-tiebreakers">
                <ol>
                  <li>Higher total points scored</li>
                  <li>More points from QB position</li>
                  <li>Lower total salary spent</li>
                  <li>Earlier draft position</li>
                </ol>
              </CollapsibleSection>
            </section>
          )}

          {/* MARKET MOVER */}
          {activeSection === 'market-mover' && (
            <section>
              <h1>Market Mover</h1>
              <p className="intro-text">
                Weekly tournament with community-driven player pricing through voting.
              </p>

              <CollapsibleSection title="How Voting Works" id="mm-voting">
                <p>Each week, users vote on players to become "Fire Sale" or "Cool Down":</p>
                <div className="voting-info">
                  <div className="fire-sale">
                    <h4>🔥 Fire Sale</h4>
                    <p>Players voted as Fire Sale appear <strong>3x more often</strong> on draft boards. 
                    Guaranteed at least 1 Fire Sale player per board.</p>
                  </div>
                  <div className="cool-down">
                    <h4>❄️ Cool Down</h4>
                    <p>Players voted as Cool Down appear at <strong>1/10th normal rate</strong> on draft boards.</p>
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Entry & Prizes" id="mm-prizes">
                <ul>
                  <li><strong>Entry Fee:</strong> $25</li>
                  <li><strong>Format:</strong> 5-player snake drafts</li>
                  <li><strong>Prize Pool:</strong> Accumulates all week</li>
                  <li><strong>Winner:</strong> Highest scoring lineup wins the pot</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="Voting Rewards" id="mm-voting-rewards">
                <p>Earn tickets by completing drafts! Tickets let you vote on which players 
                get Fire Sale or Cool Down status for the next week.</p>
                <ul>
                  <li>Complete a Cash Game draft: +1 ticket</li>
                  <li>Complete a Market Mover draft: +3 tickets</li>
                </ul>
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

              <CollapsibleSection title="Roster Positions" id="positions">
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
                      <th>1st Place</th>
                      <th>2nd Place</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>$1</td>
                      <td>$4.80</td>
                      <td>$2.88</td>
                      <td>$1.15</td>
                    </tr>
                    <tr>
                      <td>$5</td>
                      <td>$24</td>
                      <td>$14.40</td>
                      <td>$5.76</td>
                    </tr>
                    <tr>
                      <td>$10</td>
                      <td>$48</td>
                      <td>$28.80</td>
                      <td>$11.52</td>
                    </tr>
                    <tr>
                      <td>$25</td>
                      <td>$120</td>
                      <td>$72</td>
                      <td>$28.80</td>
                    </tr>
                  </tbody>
                </table>
                <p className="note">4% platform fee on full 5-player contests</p>
              </CollapsibleSection>

              <CollapsibleSection title="Market Mover Payouts" id="mm-payouts">
                <p>Market Mover is a weekly tournament where the prize pool accumulates from all entries.</p>
                <ul>
                  <li><strong>Entry:</strong> $25 per draft</li>
                  <li><strong>Winner:</strong> Highest scoring lineup takes the entire pot</li>
                  <li><strong>Minimum Prize:</strong> $1,000 guaranteed</li>
                </ul>
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