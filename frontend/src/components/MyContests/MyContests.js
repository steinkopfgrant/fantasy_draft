// frontend/src/components/MyContests/MyContests.js
import React, { useState, useEffect } from 'react';
import './MyContests.css';

const MyContests = ({ user, onViewDraft, onRejoinDraft }) => {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');

  useEffect(() => {
    fetchUserContests();
  }, []);

  const fetchUserContests = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/contests/my-entries`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch contests');
      }

      const data = await response.json();
      console.log('User contests:', data);
      setContests(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching contests:', error);
      setLoading(false);
    }
  };

  const handleViewDraft = (entry) => {
    if (entry.status === 'completed') {
      onViewDraft(entry);
    }
  };

  const handleRejoinDraft = (entry) => {
    const contestData = {
      contestId: entry.contest_id,
      contestType: entry.Contest?.type || 'cash',
      contestName: entry.Contest?.name || 'Contest',
      entryId: entry.id,
      playerBoard: entry.Contest?.player_board,
      entry: entry
    };
    
    onRejoinDraft(contestData);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return <span className="status-badge completed">Completed</span>;
      case 'drafting':
        return <span className="status-badge drafting">In Draft</span>;
      case 'pending':
        return <span className="status-badge pending">Waiting</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const calculateTotalSpent = (roster) => {
    if (!roster) return 0;
    return Object.values(roster)
      .filter(player => player)
      .reduce((total, player) => total + (player.price || 0), 0);
  };

  const filteredContests = contests.filter(contest => {
    if (filter === 'all') return true;
    if (filter === 'active') return contest.status === 'drafting' || contest.status === 'pending';
    if (filter === 'completed') return contest.status === 'completed';
    return contest.Contest?.type === filter;
  });

  const sortedContests = [...filteredContests].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return new Date(b.created_at) - new Date(a.created_at);
      case 'status':
        return a.status.localeCompare(b.status);
      case 'type':
        return (a.Contest?.type || '').localeCompare(b.Contest?.type || '');
      case 'prize':
        return (b.prize_won || 0) - (a.prize_won || 0);
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div className="my-contests">
        <div className="loading">Loading your contests...</div>
      </div>
    );
  }

  return (
    <div className="my-contests">
      <div className="my-contests-header">
        <h1>My Contests</h1>
      </div>

      <div className="contests-controls">
        <div className="filter-buttons">
          <button 
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={filter === 'active' ? 'active' : ''}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button 
            className={filter === 'completed' ? 'active' : ''}
            onClick={() => setFilter('completed')}
          >
            Completed
          </button>
          <button 
            className={filter === 'cash' ? 'active' : ''}
            onClick={() => setFilter('cash')}
          >
            Cash
          </button>
          <button 
            className={filter === 'market' ? 'active' : ''}
            onClick={() => setFilter('market')}
          >
            Market Mover
          </button>
        </div>

        <div className="sort-control">
          <label>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">Date</option>
            <option value="status">Status</option>
            <option value="type">Type</option>
            <option value="prize">Prize</option>
          </select>
        </div>
      </div>

      <div className="contests-list">
        {sortedContests.length === 0 ? (
          <div className="no-contests">
            <p>No contests found</p>
            <p>Join a contest from the lobby to get started!</p>
          </div>
        ) : (
          sortedContests.map(entry => (
            <div key={entry.id} className={`contest-entry ${entry.Contest?.type}`}>
              <div className="entry-header">
                <div className="entry-info">
                  <h3>{entry.Contest?.name || 'Contest'}</h3>
                  <span className="contest-type">{entry.Contest?.type?.toUpperCase()}</span>
                </div>
                {getStatusBadge(entry.status)}
              </div>

              <div className="entry-details">
                <div className="detail-row">
                  <span className="detail-label">Entry Fee:</span>
                  <span className="detail-value">${entry.Contest?.entry_fee || 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Prize Pool:</span>
                  <span className="detail-value">
                    ${(parseFloat(entry.Contest?.prize_pool) || 0).toLocaleString()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Entered:</span>
                  <span className="detail-value">{formatDate(entry.created_at)}</span>
                </div>
                {entry.status === 'completed' && (
                  <>
                    <div className="detail-row">
                      <span className="detail-label">Final Rank:</span>
                      <span className="detail-value">
                        {entry.final_rank || 'N/A'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Points:</span>
                      <span className="detail-value">
                        {entry.total_points || 0}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Prize Won:</span>
                      <span className="detail-value prize">
                        ${entry.prize_won || 0}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {entry.status === 'completed' && entry.roster && (
                <div className="roster-summary">
                  <h4>Final Roster (${calculateTotalSpent(entry.roster)})</h4>
                  <div className="roster-grid">
                    {['QB', 'RB', 'WR', 'TE', 'FLEX'].map(slot => (
                      <div key={slot} className="roster-slot">
                        <span className="slot-name">{slot}:</span>
                        <span className="player-name">
                          {entry.roster[slot] ? 
                            `${entry.roster[slot].name} ($${entry.roster[slot].price})` : 
                            'Empty'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="entry-actions">
                {entry.status === 'drafting' ? (
                  <button 
                    className="action-button rejoin"
                    onClick={() => handleRejoinDraft(entry)}
                  >
                    Rejoin Draft
                  </button>
                ) : entry.status === 'completed' ? (
                  <button 
                    className="action-button view"
                    onClick={() => handleViewDraft(entry)}
                  >
                    View Draft
                  </button>
                ) : (
                  <button className="action-button" disabled>
                    Waiting...
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MyContests;