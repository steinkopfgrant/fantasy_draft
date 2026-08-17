// frontend/src/components/Rules/RulesPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './RulesPage.css';

// ---------------------------------------------------------------------------
// ELIGIBLE JURISDICTIONS
//
// This is an ALLOWLIST: contests are offered ONLY in the jurisdictions below.
// Any jurisdiction not listed is ineligible by default.
//
// MUST STAY IN SYNC with the geo-restriction middleware. If the middleware
// still operates as a blocklist, it needs to be inverted to check membership
// in this same list — a blocklist fails open (an unlisted state is silently
// permitted), an allowlist fails closed. Ideally both read from one shared
// module so the two can never drift.
// ---------------------------------------------------------------------------
const ELIGIBLE_JURISDICTIONS = [
  'Alabama',
  'Alaska',
  'District of Columbia',
  'Florida',
  'Georgia',
  'Illinois',
  'Kansas',
  'Kentucky',
  'Minnesota',
  'Nebraska',
  'New Mexico',
  'North Carolina',
  'North Dakota',
  'Oklahoma',
  'Oregon',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Utah',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
];

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
    { id: 'eligible-states', label: 'Eligible States' },
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
                  <li><strong>Join a Contest</strong> - Enter a Cash Game contest</li>
                  <li><strong>Draft Your Team</strong> - Snake draft with 5 teams, pick players within your $15 budget</li>
                  <li><strong>Compete</strong> - Your roster scores points based on real NFL performance</li>
                  <li><strong>Win Prizes</strong> - Highest scoring lineup wins!</li>
                </ol>
              </CollapsibleSection>

              <CollapsibleSection title="Contest Types" id="contest-types">
                <div className="contest-type">
                  <h4>💰 Cash Games</h4>
                  <p>Snake drafts against 4 other players. Winner take all!</p>
                </div>
                <div className="contest-type">
                  <h4>🔥 Market Mover <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 'normal' }}>(Coming Soon)</span></h4>
                  <p>Weekly tournament with community-driven player appearance rates through voting — this leads to skews in ownership for the contest. Target periods with favorable Hot and Cold pools to boost performance. Details to be determined.</p>
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

              <CollapsibleSection title="NBA Contests" id="nba-roster-format">
                <p style={{ color: '#f59e0b', fontWeight: '600' }}>🚧 Not active at launch</p>
                <p>
                  NBA contests are not offered during the initial NFL season launch. When NBA
                  contests become available, roster format, scoring, and eligibility will be
                  published here before the mode goes live.
                </p>
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
                    Scoring is based entirely on real NFL statistical performance. No draft-related
                    bonuses of any kind are applied to a lineup's score.
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

                  <CollapsibleSection title="Empty Roster Slots" id="empty-slots">
                    <p>
                      A roster slot left empty scores <strong>zero points</strong>. Empty slots are
                      rare — a turn is passed only when no selection on the board can legally fill
                      one of your open positions within your remaining budget.
                    </p>
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
                  <p className="intro-text" style={{ color: '#f59e0b' }}>
                    🚧 NBA contests are not active at launch.
                  </p>
                  <p className="intro-text">
                    NBA scoring rules will be published here before NBA contests become available.
                  </p>
                </>
              )}
            </section>
          )}

          {/* CASH GAMES */}
          {activeSection === 'cash-games' && (
            <section>
              <h1>Cash Games</h1>
              <p className="intro-text">
                Five-player snake draft contests. Winner takes all!
              </p>

              <CollapsibleSection title="Entry & Format" id="cash-format">
                <ul>
                  <li><strong>Players:</strong> 5 drafters per contest</li>
                  <li><strong>Draft Type:</strong> Snake draft (1-2-3-4-5, 5-4-3-2-1, ...)</li>
                  <li><strong>Rounds:</strong> 5 rounds, 25 total picks</li>
                  <li><strong>Time per Pick:</strong> 30 seconds</li>
                  <li><strong>Budget:</strong> $15 per team</li>
                  <li><strong>Entry Fee:</strong> $5</li>
                  <li><strong>Payout:</strong> Winner take all</li>
                </ul>
                <p className="note">
                  Contests run only with a full 5-player lobby. Draft order is randomized before
                  the draft begins and is displayed to all entrants.
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="Draft Board Composition" id="cash-board">
                <p>
                  In Cash Games, every player on the draft board is drawn uniformly at random from
                  the eligible player pool for that price tier and position. Community voting
                  (Fire Sale / Cool Down) has <strong>no effect on Cash Game boards</strong> — that
                  mechanic applies only to Market Mover contests.
                </p>
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
                Market Mover will be a weekly tournament with community-driven player appearance rates through voting — this leads to skews in ownership for the contest. Target periods with favorable Hot and Cold pools to boost performance. 
                Entry fees, prize structures, and voting mechanics are still being finalized.
              </p>

              <CollapsibleSection title="How Voting Will Work" id="mm-voting">
                <p>Each week, users will vote on players to become "Fire Sale" or "Cool Down":</p>
                <div className="voting-info">
                  <div className="fire-sale">
                    <h4>🔥 Fire Sale</h4>
                    <p>Players voted as Fire Sale will appear more often on Market Mover draft boards.</p>
                  </div>
                  <div className="cool-down">
                    <h4>❄️ Cool Down</h4>
                    <p>Players voted as Cool Down will appear less often on Market Mover draft boards.</p>
                  </div>
                </div>
                <p className="note">
                  Voting affects only how frequently a player <em>appears</em> on a board. It does
                  not affect player pricing or scoring. Voting has no effect on Cash Games.
                  Full details to be determined.
                </p>
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

              <CollapsibleSection title="The Draft Board" id="draft-board">
                <p>
                  Every contest uses a randomly generated board of approximately 30 players,
                  visible to all five drafters. All drafters compete for the same board — once a
                  player is selected, that player is unavailable to everyone else.
                </p>
                <p>The board is arranged in six rows:</p>
                <ul>
                  <li>
                    <strong>Rows 1–5 (price tiers):</strong> One row each for $5, $4, $3, $2, and $1
                    players. Each row contains a QB, RB, WR, TE, and one additional RB/WR/TE
                    priced at that row's tier.
                  </li>
                  <li>
                    <strong>Row 6 (Wildcards):</strong> Five additional players at mixed prices —
                    one QB and four RB/WR/TE.
                  </li>
                </ul>
                <p>Every board is generated subject to the following guarantees:</p>
                <ul>
                  <li><strong>Single appearance:</strong> No player appears more than once on a board.</li>
                  <li><strong>Running back availability:</strong> At least one running back appears among the flexible positions.</li>
                  <li><strong>Stack opportunity:</strong> At least one wide receiver shares an NFL team with a quarterback on the board.</li>
                </ul>
                <p className="note">
                  Player prices are set by BidBlitz before the contest and do not change during the
                  draft.
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="Snake Draft Order" id="snake-draft">
                <p>Drafts use snake format where the order reverses each round:</p>
                <div className="snake-example">
                  <p><strong>Round 1:</strong> Team 1 → Team 2 → Team 3 → Team 4 → Team 5</p>
                  <p><strong>Round 2:</strong> Team 5 → Team 4 → Team 3 → Team 2 → Team 1</p>
                  <p><strong>Round 3:</strong> Team 1 → Team 2 → Team 3 → Team 4 → Team 5</p>
                  <p>...and so on</p>
                </div>
                <p className="note">Five rounds, 25 total picks. Draft order is randomized and shown before the draft starts.</p>
              </CollapsibleSection>

              <CollapsibleSection title="Time Limits & Auto-Pick" id="time-limits">
                <ul>
                  <li><strong>Standard pick:</strong> 30 seconds</li>
                  <li><strong>Auto-pick:</strong> If your timer expires, a selection is made for you automatically</li>
                </ul>
                <p>Auto-pick fills your <strong>highest-priority empty roster slot</strong>, in this order:</p>
                <div className="snake-example">
                  <p><strong>QB → RB → WR → TE → FLEX</strong></p>
                </div>
                <p>
                  For that slot, auto-pick selects the <strong>most expensive available player</strong>
                  you can afford who legally fills it. All lineup requirements apply to auto-picks
                  exactly as they do to manual picks.
                </p>
                <p>
                  <strong>If two or more eligible players are tied at the same price</strong>, auto-pick
                  takes the one that appears earliest on the board, reading the way you would read a
                  page — top row first, then left to right within that row. Rows run in descending
                  price order ($5 at the top down to $1), with the Wildcards row last. Columns run
                  QB, RB, WR, TE, then the flexible slot.
                </p>
                <div className="snake-example">
                  <p><strong>Example.</strong> Auto-pick is filling your RB slot and two $5 running backs are available: one in the RB column of the $5 row, one in the Wildcards row. The $5 row comes first, so that running back is selected. If instead both $5 running backs were in the $5 row — one in the RB column and one in the flexible column — the RB column comes first.</p>
                </div>
                <p className="note">
                  A player shown in a flexible or Wildcards cell is still a running back, wide
                  receiver, or tight end, and auto-pick may place that player in the matching
                  position slot rather than your FLEX slot. Quarterbacks are never eligible for the
                  FLEX slot.
                </p>
                <p className="note">
                  On mobile, you may pre-select a player before your turn. If that player is still
                  available and can legally be added to your lineup when your timer expires, your
                  pre-selection is used instead of the automatic choice.
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="Passed Turns" id="passed-turns">
                <p>
                  A turn is passed only when <strong>no player on the board can legally fill any of
                  your open roster slots</strong> within your remaining budget. This is uncommon.
                </p>
                <p>
                  When a turn is passed, the roster slot remains empty and scores{' '}
                  <strong>zero points</strong>. The draft does not pause, and the turn moves to the
                  next drafter.
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="Budget Rules" id="budget-rules">
                <ul>
                  <li>Each team starts with <strong>$15 budget</strong></li>
                  <li>Players are priced <strong>$1 to $5</strong></li>
                  <li>You cannot draft a player you can't afford</li>
                  <li>Unspent budget does not carry over and provides no bonus</li>
                  <li>No bonuses, credits, or additional budget are awarded during a draft for any reason</li>
                </ul>
                <p className="note">
                  Unspent budget is used only as a tiebreaker — see Cash Games → Tiebreakers.
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="Disconnection Policy" id="disconnection">
                <p>If you disconnect during a draft:</p>
                <ul>
                  <li>Your picks will be made automatically using the auto-pick rules above (highest-priority empty slot, most expensive affordable player)</li>
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
              <p className="intro-text">
                Every lineup must satisfy the requirements below. The draft interface prevents
                selections that would violate them — players you cannot legally add are shown
                greyed out and cannot be selected.
              </p>

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
                <p className="note">Quarterbacks may only be placed in the QB slot.</p>
              </CollapsibleSection>

              <CollapsibleSection title="Team Limit" id="team-limit">
                <p>
                  A lineup may contain <strong>no more than 3 players from the same NFL team</strong>.
                </p>
                <p className="note">
                  Once you have rostered three players from one team, remaining players from that
                  team cannot be selected.
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="Multiple Games Requirement" id="game-requirement">
                <p>
                  A lineup must include players from <strong>at least two different NFL games</strong>.
                </p>
                <p>
                  This is enforced during the draft rather than at the end. Once you have{' '}
                  <strong>one roster slot remaining</strong>, if every player you have rostered so
                  far comes from a single game, you may only select a player from a different game.
                  Players from your existing game are greyed out at that point.
                </p>
                <p>
                  In a standard five-round draft this takes effect on your fourth pick. You may
                  still build a lineup with four of five players from one game — you simply cannot
                  leave the second game until your final selection.
                </p>
                <div className="snake-example">
                  <p><strong>Example.</strong> Your first three picks are two Chargers and one Cardinal, and the Chargers play the Cardinals that week — all three come from one game. On your fourth pick, every Chargers and Cardinals player on the board is greyed out. You must select from a different game. Your fifth and final pick is then unrestricted, subject to the team limit.</p>
                </div>
                <p className="note">
                  Rare exception: because all five drafters compete for the same board, it is
                  possible — though uncommon — for the remaining board and your remaining budget to
                  leave no valid selection at all. In that situation the requirement is relaxed for
                  that selection so that you are not denied a pick because of another drafter's
                  choices. BidBlitz records any lineup completed under this exception.
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="Player Eligibility" id="eligibility">
                <ul>
                  <li>Only players from games in the current week's slate are available</li>
                  <li>Each player appears at most once per board and can only be drafted once per contest</li>
                  <li>Player pools and prices are set by BidBlitz before each contest</li>
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
                  <li>Method: Bank transfer</li>
                </ul>
              </CollapsibleSection>
            </section>
          )}

          {/* ELIGIBLE STATES */}
          {activeSection === 'eligible-states' && (
            <section>
              <h1>Eligible States</h1>
              <p className="intro-text">
                BidBlitz offers paid contests only to residents of the jurisdictions listed below.
                If your jurisdiction is not listed, you are not eligible to participate in paid
                contests at this time.
              </p>

              <CollapsibleSection title="Where BidBlitz Is Available" id="eligible-list">
                <div className="state-grid">
                  {ELIGIBLE_JURISDICTIONS.map(name => (
                    <div className="state" key={name}>{name}</div>
                  ))}
                </div>
                <p className="note">
                  This list is subject to change based on state legislation. Eligibility is
                  determined by your location at the time of entry.
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="Age Requirements" id="age-requirements">
                <ul>
                  <li>Must be 18 or older to participate in paid contests</li>
                  <li>Certain jurisdictions require a minimum age of 19; the applicable minimum for your location is enforced at entry</li>
                  <li>Age and identity verification are required before withdrawal</li>
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
                  <li>Payment and bank account information, processed securely by our third-party payment providers</li>
                  <li>Location information, used to verify eligibility</li>
                  <li>Contest history and activity</li>
                  <li>Device and browser information</li>
                </ul>
              </CollapsibleSection>

              <CollapsibleSection title="Payment Processing" id="payment-processing">
                <p>
                  Deposits and withdrawals are processed by our third-party payment partners.
                  BidBlitz does not store full bank account or card numbers on its own systems.
                  Payment information you provide is transmitted directly to our payment providers
                  and handled under their security and privacy practices.
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="How We Use Data" id="data-use">
                <ul>
                  <li>To operate contests and process payments</li>
                  <li>To verify eligibility, age, and identity</li>
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