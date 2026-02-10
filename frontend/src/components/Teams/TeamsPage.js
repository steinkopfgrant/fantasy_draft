// frontend/src/components/Teams/TeamsPage.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './TeamsPage.css';

// Sport-specific position configurations
const SPORT_CONFIG = {
  nfl: {
    positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
    label: 'NFL',
    icon: '🏈',
  },
  nba: {
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    label: 'NBA',
    icon: '🏀',
  },
  mlb: {
    positions: ['P', 'C', '1B', 'OF', 'FLEX'],
    label: 'MLB',
    icon: '⚾',
  },
};

// Helper to get positions for a team/contest
const getPositionsForTeam = (team) => {
  const sport = team?.sport || team?.contestSport || 'nfl';
  return SPORT_CONFIG[sport]?.positions || SPORT_CONFIG.nfl.positions;
};

// Helper to get the sport key for a team
const getTeamSport = (team) => {
  return (team?.sport || team?.contestSport || 'nfl').toLowerCase();
};

const TeamsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'active';
  const initialFilter = searchParams.get('filter') || 'all';
  const initialSport = searchParams.get('sport') || 'all';
  
  const [activeTab, setActiveTab] = useState(initialTab);
  const [contestFilter, setContestFilter] = useState(initialFilter);
  const [sportFilter, setSportFilter] = useState(initialSport);
  const [activeTeams, setActiveTeams] = useState([]);
  const [historyTeams, setHistoryTeams] = useState([]);
  const [historySummary, setHistorySummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamDetails, setTeamDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchActiveTeams = useCallback(async () => {
    try {
      const response = await axios.get('/api/teams/active');
      if (response.data.success) {
        setActiveTeams(response.data.teams);
      }
    } catch (error) {
      console.error('Error fetching active teams:', error);
    }
  }, []);

  const fetchHistoryTeams = useCallback(async (page = 1) => {
    try {
      const response = await axios.get(`/api/teams/history?page=${page}&limit=20`);
      if (response.data.success) {
        setHistoryTeams(response.data.teams);
        setHistoryPagination(response.data.pagination);
        setHistorySummary(response.data.summary);
      }
    } catch (error) {
      console.error('Error fetching team history:', error);
    }
  }, []);

  const fetchTeamDetails = useCallback(async (entryId) => {
    setLoadingDetails(true);
    try {
      const response = await axios.get(`/api/teams/${entryId}/details`);
      if (response.data.success) {
        setTeamDetails(response.data);
      }
    } catch (error) {
      console.error('Error fetching team details:', error);
    }
    setLoadingDetails(false);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      if (activeTab === 'active') {
        await fetchActiveTeams();
      } else {
        await fetchHistoryTeams(historyPage);
      }
      setLoading(false);
    };
    loadData();
  }, [activeTab, historyPage, fetchActiveTeams, fetchHistoryTeams]);

  useEffect(() => {
    if (selectedTeam && selectedTeam.status === 'settled') {
      fetchTeamDetails(selectedTeam.id);
    } else {
      setTeamDetails(null);
    }
  }, [selectedTeam, fetchTeamDetails]);

  // Filter teams by contest type
  const filterByContestType = useCallback((teams) => {
    if (contestFilter === 'all') return teams;
    
    return teams.filter(team => {
      const type = team.contestType?.toLowerCase();
      if (contestFilter === 'cash') {
        return type === 'cash';
      } else if (contestFilter === 'market') {
        return type === 'market' || type === 'bash';
      }
      return true;
    });
  }, [contestFilter]);

  // Filter teams by sport
  const filterBySport = useCallback((teams) => {
    if (sportFilter === 'all') return teams;
    return teams.filter(team => getTeamSport(team) === sportFilter);
  }, [sportFilter]);

  // Combined filter: contest type + sport
  const applyFilters = useCallback((teams) => {
    return filterBySport(filterByContestType(teams));
  }, [filterByContestType, filterBySport]);

  // Filtered teams
  const filteredActiveTeams = useMemo(() => 
    applyFilters(activeTeams), 
    [activeTeams, applyFilters]
  );
  
  const filteredHistoryTeams = useMemo(() => 
    applyFilters(historyTeams),
    [historyTeams, applyFilters]
  );

  // Determine which sports are present in the current teams
  const currentTeams = activeTab === 'active' ? activeTeams : historyTeams;
  
  const availableSports = useMemo(() => {
    const sports = new Set(currentTeams.map(t => getTeamSport(t)));
    return Array.from(sports).sort();
  }, [currentTeams]);

  // Count teams by type for badges (respects sport filter)
  const sportFilteredTeams = useMemo(() => 
    filterBySport(currentTeams),
    [currentTeams, filterBySport]
  );

  const countsByType = useMemo(() => ({
    all: sportFilteredTeams.length,
    cash: sportFilteredTeams.filter(t => t.contestType?.toLowerCase() === 'cash').length,
    market: sportFilteredTeams.filter(t => ['market', 'bash'].includes(t.contestType?.toLowerCase())).length,
  }), [sportFilteredTeams]);

  // Count teams by sport for badges (respects contest type filter)
  const typeFilteredTeams = useMemo(() => 
    filterByContestType(currentTeams),
    [currentTeams, filterByContestType]
  );

  const countsBySport = useMemo(() => {
    const counts = { all: typeFilteredTeams.length };
    for (const sport of availableSports) {
      counts[sport] = typeFilteredTeams.filter(t => getTeamSport(t) === sport).length;
    }
    return counts;
  }, [typeFilteredTeams, availableSports]);

  const updateSearchParams = (tab, filter, sport) => {
    const params = { tab, filter };
    if (sport !== 'all') params.sport = sport;
    setSearchParams(params);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    updateSearchParams(tab, contestFilter, sportFilter);
  };

  const handleFilterChange = (filter) => {
    setContestFilter(filter);
    updateSearchParams(activeTab, filter, sportFilter);
    if (activeTab === 'history') setHistoryPage(1);
  };

  const handleSportChange = (sport) => {
    setSportFilter(sport);
    updateSearchParams(activeTab, contestFilter, sport);
    if (activeTab === 'history') setHistoryPage(1);
  };

  const formatContestType = (type) => {
    const types = {
      'cash': 'Cash Game',
      'market': 'Market Mover',
      'firesale': 'Fire Sale',
      'bash': 'Market Mover'
    };
    return types[type?.toLowerCase()] || type;
  };

  const getStatusBadge = (status, contestStatus) => {
    if (contestStatus === 'settled') return { text: 'Settled', class: 'settled' };
    const badges = {
      'pending': { text: 'Waiting', class: 'pending' },
      'drafting': { text: 'Drafting', class: 'drafting' },
      'completed': { text: 'Drafted', class: 'drafted' },
      'live': { text: '● LIVE', class: 'live' },
      'processing': { text: 'Processing', class: 'processing' }
    };
    return badges[status] || { text: status, class: 'default' };
  };

  const handleTeamClick = (team) => {
    if (team.status === 'pending' || team.status === 'drafting') {
      navigate(`/draft/${team.draftRoomId}`);
    } else {
      setSelectedTeam(team);
    }
  };

  const closeModal = () => {
    setSelectedTeam(null);
    setTeamDetails(null);
  };

  // FIXED: Sport-aware roster rendering
  const renderRoster = (roster, team) => {
    if (!roster) return null;
    const positions = getPositionsForTeam(team);
    return positions.map(pos => {
      const player = roster[pos];
      return (
        <div key={pos} className="roster-slot">
          <span className="position-label">{pos}</span>
          <span className="player-name">{player?.name || '—'}</span>
          {player?.team && <span className="player-team">{player.team}</span>}
        </div>
      );
    });
  };

  const getModalTeam = () => teamDetails?.team || selectedTeam;
  const getWinners = () => teamDetails?.winners || [];

  // Get short last name for compact display
  const getLastName = (name) => name?.split(' ').pop() || '—';

  // Build the empty state message based on active filters
  const getEmptyMessage = () => {
    const parts = [];
    if (contestFilter !== 'all') {
      parts.push(contestFilter === 'cash' ? 'Cash Game' : 'Market Mover');
    }
    if (sportFilter !== 'all') {
      parts.push(SPORT_CONFIG[sportFilter]?.label || sportFilter.toUpperCase());
    }
    if (parts.length === 0) return activeTab === 'active' ? 'No Active Teams' : 'No Contest History';
    return `No ${parts.join(' ')} ${activeTab === 'active' ? 'Teams' : 'History'}`;
  };

  return (
    <div className="teams-page">
      <div className="teams-header">
        <h1>My Teams</h1>
        <div className="teams-tabs">
          <button
            className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => handleTabChange('active')}
          >
            <span className="tab-icon">🏈</span>
            Active
            {activeTeams.length > 0 && <span className="tab-count">{activeTeams.length}</span>}
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => handleTabChange('history')}
          >
            <span className="tab-icon">📊</span>
            History
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        {/* Contest Type Filter */}
        <div className="contest-filter">
          <button
            className={`filter-btn ${contestFilter === 'all' ? 'active' : ''}`}
            onClick={() => handleFilterChange('all')}
          >
            All
            {countsByType.all > 0 && (
              <span className="filter-count">{countsByType.all}</span>
            )}
          </button>
          <button
            className={`filter-btn cash ${contestFilter === 'cash' ? 'active' : ''}`}
            onClick={() => handleFilterChange('cash')}
          >
            💵 Cash Games
            {countsByType.cash > 0 && (
              <span className="filter-count">{countsByType.cash}</span>
            )}
          </button>
          <button
            className={`filter-btn market ${contestFilter === 'market' ? 'active' : ''}`}
            onClick={() => handleFilterChange('market')}
          >
            📈 Market Mover
            {countsByType.market > 0 && (
              <span className="filter-count">{countsByType.market}</span>
            )}
          </button>
        </div>

        {/* Sport Filter — only show if more than 1 sport exists */}
        {availableSports.length > 1 && (
          <div className="sport-filter">
            <button
              className={`filter-btn sport ${sportFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleSportChange('all')}
            >
              All Sports
              {countsBySport.all > 0 && (
                <span className="filter-count">{countsBySport.all}</span>
              )}
            </button>
            {availableSports.map(sport => (
              <button
                key={sport}
                className={`filter-btn sport ${sportFilter === sport ? 'active' : ''}`}
                onClick={() => handleSportChange(sport)}
              >
                {SPORT_CONFIG[sport]?.icon || '🎯'} {SPORT_CONFIG[sport]?.label || sport.toUpperCase()}
                {(countsBySport[sport] || 0) > 0 && (
                  <span className="filter-count">{countsBySport[sport]}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="teams-loading">
          <div className="spinner"></div>
          <p>Loading your teams...</p>
        </div>
      ) : activeTab === 'active' ? (
        <div className="active-teams-section">
          {filteredActiveTeams.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏈</div>
              <h3>{getEmptyMessage()}</h3>
              <p>Join a contest to start drafting your lineup!</p>
              <button className="btn-primary" onClick={() => navigate('/lobby')}>Browse Contests</button>
            </div>
          ) : (
            <div className="teams-grid">
              {filteredActiveTeams.map(team => {
                const badge = getStatusBadge(team.status, team.contestStatus);
                const sport = getTeamSport(team);
                return (
                  <div key={team.id} className={`team-card ${badge.class}`} onClick={() => handleTeamClick(team)}>
                    <div className="team-card-header">
                      <div className="contest-info">
                        <h3>{team.contestName}</h3>
                        <div className="contest-meta">
                          <span className="contest-type">{formatContestType(team.contestType)}</span>
                          {sport !== 'nfl' && (
                            <span className="sport-tag">{SPORT_CONFIG[sport]?.icon} {SPORT_CONFIG[sport]?.label}</span>
                          )}
                        </div>
                      </div>
                      <span className={`status-badge ${badge.class}`}>{badge.text}</span>
                    </div>
                    <div className="team-card-body">
                      <div className="entry-info">
                        <span className="entry-fee">Entry: ${team.entryFee.toFixed(2)}</span>
                        <span className="prize-pool">Prize: ${team.prizePool.toFixed(2)}</span>
                      </div>
                      {team.playerCount > 0 && <div className="roster-preview">{renderRoster(team.roster, team)}</div>}
                    </div>
                    <div className="team-card-footer">
                      {team.status === 'pending' || team.status === 'drafting' ? (
                        <button className="btn-action">{team.status === 'drafting' ? 'Rejoin Draft →' : 'Waiting for players...'}</button>
                      ) : (
                        <span className="players-count">{team.playerCount}/5 players</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="history-section">
          {historySummary && (
            <div className="history-summary">
              <div className="summary-card"><span className="summary-label">Contests</span><span className="summary-value">{historySummary.totalContests}</span></div>
              <div className="summary-card"><span className="summary-label">Record</span><span className="summary-value">{historySummary.wins}W - {historySummary.losses}L</span></div>
              <div className="summary-card"><span className="summary-label">Win Rate</span><span className="summary-value">{historySummary.winRate}%</span></div>
              <div className={`summary-card ${historySummary.netProfit >= 0 ? 'positive' : 'negative'}`}>
                <span className="summary-label">Net Profit</span>
                <span className="summary-value">{historySummary.netProfit >= 0 ? '+' : ''}${historySummary.netProfit.toFixed(2)}</span>
              </div>
            </div>
          )}

          {filteredHistoryTeams.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3>{getEmptyMessage()}</h3>
              <p>Your settled contests will appear here.</p>
            </div>
          ) : (
            <>
              <div className="history-list">
                {filteredHistoryTeams.map(team => (
                  <div key={team.id} className={`history-card ${team.isWinner ? 'winner' : 'loser'}`} onClick={() => setSelectedTeam(team)}>
                    <div className="result-badge">
                      <span className={`net-result ${team.netResult >= 0 ? 'positive' : 'negative'}`}>
                        {team.netResult >= 0 ? '+' : ''}${team.netResult.toFixed(2)}
                      </span>
                    </div>
                    <div className="history-card-content">
                      <div className="history-main">
                        <h3>{team.contestName}</h3>
                        <div className="history-details">
                          <span className="contest-type">{formatContestType(team.contestType)}</span>
                          <span className="separator">•</span>
                          <span>{SPORT_CONFIG[getTeamSport(team)]?.label || 'NFL'}</span>
                          <span className="separator">•</span>
                          <span>Entry: ${team.entryFee.toFixed(2)}</span>
                          {team.rank && <><span className="separator">•</span><span>Rank: #{team.rank}</span></>}
                          <span className="separator">•</span>
                          <span>{team.totalPoints.toFixed(1)} pts</span>
                        </div>
                      </div>
                      <div className="history-roster-mini">
                        {team.roster && Object.entries(team.roster).slice(0, 3).map(([pos, player]) => (
                          <span key={pos} className="mini-player">{player?.name?.split(' ').pop() || '—'}</span>
                        ))}
                        {team.playerCount > 3 && <span className="more-players">+{team.playerCount - 3}</span>}
                      </div>
                    </div>
                    <div className="history-date">{new Date(team.completedAt).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
              {historyPagination && historyPagination.totalPages > 1 && (
                <div className="pagination">
                  <button disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)}>← Previous</button>
                  <span>Page {historyPage} of {historyPagination.totalPages}</span>
                  <button disabled={!historyPagination.hasMore} onClick={() => setHistoryPage(p => p + 1)}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Team Detail Modal */}
      {selectedTeam && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content team-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>
            
            <div className="modal-header">
              <h2>{selectedTeam.contestName}</h2>
              <div className="modal-header-meta">
                <span className="contest-type">{formatContestType(selectedTeam.contestType)}</span>
                <span className="sport-tag">
                  {SPORT_CONFIG[getTeamSport(selectedTeam)]?.icon} {SPORT_CONFIG[getTeamSport(selectedTeam)]?.label}
                </span>
              </div>
            </div>

            {loadingDetails ? (
              <div className="modal-loading"><div className="spinner"></div></div>
            ) : (
              <>
                {/* Result Box - Split: Your Result | Winning Lineup */}
                {getModalTeam()?.netResult !== undefined && (
                  <div className="modal-result-split">
                    <div className={`result-side ${getModalTeam().netResult >= 0 ? 'positive' : 'negative'}`}>
                      <span className="result-label">{getModalTeam().netResult >= 0 ? 'WON' : 'LOST'}</span>
                      <span className="result-amount">${Math.abs(getModalTeam().netResult).toFixed(2)}</span>
                    </div>
                    <div className="winner-side">
                      <span className="winner-label">🏆 Winning Lineup ({getWinners()[0]?.points?.toFixed(1) || '—'} pts)</span>
                      <div className="winner-mini-roster">
                        {getWinners().length > 0 && getWinners()[0].roster ? (
                          getPositionsForTeam(getModalTeam()).map(pos => (
                            <span key={pos} className="winner-player">
                              {getLastName(getWinners()[0].roster[pos]?.name)}
                            </span>
                          ))
                        ) : (
                          <span className="winner-player">Loading...</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="modal-stats">
                  <div className="stat"><span className="stat-label">Entry Fee</span><span className="stat-value">${getModalTeam()?.entryFee?.toFixed(2)}</span></div>
                  <div className="stat"><span className="stat-label">Total Points</span><span className="stat-value">{getModalTeam()?.totalPoints?.toFixed(1)}</span></div>
                  {getModalTeam()?.rank && <div className="stat"><span className="stat-label">Final Rank</span><span className="stat-value">#{getModalTeam().rank}</span></div>}
                </div>

                {/* Your Lineup with Scores - FIXED: Sport-aware */}
                <div className="modal-roster">
                  <h3>Lineup</h3>
                  <div className="roster-detail">
                    {getModalTeam()?.roster && getPositionsForTeam(getModalTeam()).map(pos => {
                      const player = getModalTeam().roster[pos];
                      return (
                        <div key={pos} className="roster-row">
                          <span className="pos">{pos}</span>
                          <span className="name">{player?.name || 'Empty'}</span>
                          <span className="team">{player?.team || '—'}</span>
                          <span className="price">${player?.price || 0}</span>
                          <span className={`score ${(player?.score || 0) > 15 ? 'high' : (player?.score || 0) < 8 ? 'low' : ''}`}>
                            {player?.score?.toFixed(1) || '0.0'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamsPage;