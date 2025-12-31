// frontend/src/components/Profile/ProfileScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './ProfileScreen.css';

const ProfileScreen = ({ user, showToast, updateUser }) => {
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('stats');
  const [lineups, setLineups] = useState([]);
  const [lineupsLoading, setLineupsLoading] = useState(false);
  const [selectedLineup, setSelectedLineup] = useState(null);
  const [lineupFilters, setLineupFilters] = useState({
    status: 'all',
    contestType: 'all',
    page: 1
  });
  const [lineupStats, setLineupStats] = useState({
    total: 0,
    totalPages: 1,
    hasMore: false
  });
  
  const [formData, setFormData] = useState({
    bio: user?.bio || '',
    email_notifications: user?.email_notifications || true,
    draft_reminders: user?.draft_reminders || true,
    sound_enabled: user?.sound_enabled || true
  });
  const [loading, setLoading] = useState(false);

  // Helper function to safely show toast or fallback to console
  const safeShowToast = useCallback((message, type = 'info') => {
    if (showToast && typeof showToast === 'function') {
      showToast(message, type);
    } else {
      if (type === 'error') {
        console.error(message);
      } else {
        console.log(message);
      }
    }
  }, [showToast]);

  const fetchLineups = useCallback(async () => {
    setLineupsLoading(true);
    try {
      const params = new URLSearchParams();
      if (lineupFilters.status !== 'all') params.append('status', lineupFilters.status);
      if (lineupFilters.contestType !== 'all') params.append('type', lineupFilters.contestType);
      params.append('page', lineupFilters.page);
      params.append('limit', 20);

      const response = await axios.get(`/api/teams/my-teams?${params}`);
      if (response.data.success) {
        setLineups(response.data.lineups || []);
        setLineupStats({
          total: response.data.total || 0,
          totalPages: response.data.totalPages || 1,
          hasMore: response.data.hasMore || false
        });
      }
    } catch (error) {
      console.error('Error fetching lineups:', error);
      safeShowToast('Failed to load your teams', 'error');
    }
    setLineupsLoading(false);
  }, [lineupFilters, safeShowToast]);

  useEffect(() => {
    if (activeTab === 'teams') {
      fetchLineups();
    }
  }, [activeTab, fetchLineups]);

  const handleFilterChange = (filterType, value) => {
    setLineupFilters({
      ...lineupFilters,
      [filterType]: value,
      page: 1
    });
  };

  const viewLineupDetails = async (lineupId) => {
    try {
      const response = await axios.get(`/api/teams/lineup/${lineupId}`);
      if (response.data.success) {
        setSelectedLineup(response.data.lineup);
      }
    } catch (error) {
      console.error('Error loading lineup details:', error);
      safeShowToast('Failed to load lineup details', 'error');
    }
  };

  const formatContestType = (type) => {
    if (!type) return 'Contest';
    
    const normalizedType = type.toLowerCase().trim();
    
    const types = {
      // Cash games (head-to-head or small groups)
      'cash': 'Cash Game',
      'cash_game': 'Cash Game',
      'cashgame': 'Cash Game',
      
      // Market Mover - $25 weekly flagship tournament with voting modifiers
      'market': 'Market Mover',
      'market_mover': 'Market Mover',
      'marketmover': 'Market Mover',
      'mm': 'Market Mover',
      'bash': 'Market Mover',        // Legacy mapping
      'daily_bash': 'Market Mover',  // Legacy mapping
      'dailybash': 'Market Mover',   // Legacy mapping
      
      // Fire Sale
      'firesale': 'Fire Sale',
      'fire_sale': 'Fire Sale',
      'fire': 'Fire Sale',
      
      // Double Draft
      'double': 'Double Draft',
      'double_draft': 'Double Draft',
      'doubledraft': 'Double Draft',
      
      // Custom Board
      'custom': 'Custom Board',
      'custom_board': 'Custom Board',
      'customboard': 'Custom Board'
    };
    
    return types[normalizedType] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.put('/api/users/profile', formData);
      if (response.data.success) {
        if (updateUser && typeof updateUser === 'function') {
          updateUser(response.data.data);
        }
        safeShowToast('Profile updated successfully', 'success');
        setEditing(false);
      }
    } catch (error) {
      safeShowToast(error.response?.data?.error || 'Failed to update profile', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="profile-container">
      <h1>Profile</h1>
      
      <div className="profile-tabs">
        <button
          className={`profile-tab-button ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Statistics
        </button>
        <button
          className={`profile-tab-button ${activeTab === 'teams' ? 'active' : ''}`}
          onClick={() => setActiveTab('teams')}
        >
          Your Teams ({lineupStats.total || 0})
        </button>
        <button
          className={`profile-tab-button ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {activeTab === 'stats' && (
        <div>
          <div className="profile-section">
            <h3>Account Information</h3>
            <p className="profile-stat-item"><strong>Username:</strong> {user?.username}</p>
            <p className="profile-stat-item"><strong>Email:</strong> {user?.email}</p>
            <p className="profile-stat-item"><strong>Balance:</strong> ${user?.balance || 0}</p>
            <p className="profile-stat-item"><strong>Tickets:</strong> {user?.tickets || 0} 🎟️</p>
            <p className="profile-stat-item"><strong>Member Since:</strong> {new Date(user?.created_at || Date.now()).toLocaleDateString()}</p>
          </div>

          <div className="profile-section">
            <h3>Statistics</h3>
            <p className="profile-stat-item"><strong>Total Contests:</strong> {user?.total_contests_entered || 0}</p>
            <p className="profile-stat-item"><strong>Contests Won:</strong> {user?.total_contests_won || 0}</p>
            <p className="profile-stat-item"><strong>Win Rate:</strong> {user?.win_rate || 0}%</p>
            <p className="profile-stat-item"><strong>Total Winnings:</strong> ${user?.total_prize_money || 0}</p>
            <p className="profile-stat-item"><strong>Highest Score:</strong> {user?.highest_score || 0}</p>
          </div>
        </div>
      )}

      {activeTab === 'teams' && (
        <div>
          <div className="teams-filters">
            <select
              value={lineupFilters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="drafted">Drafted</option>
              <option value="live">Live</option>
              <option value="final">Final</option>
              <option value="paid">Paid</option>
            </select>

            <select
              value={lineupFilters.contestType}
              onChange={(e) => handleFilterChange('contestType', e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="cash">Cash Games</option>
              <option value="market">Market Mover</option>
              <option value="firesale">Fire Sale</option>
              <option value="double">Double Draft</option>
            </select>
          </div>

          {lineupsLoading ? (
            <div className="teams-loading">Loading your teams...</div>
          ) : lineups.length === 0 ? (
            <div className="teams-empty">
              <p>No teams found. Complete some drafts to see your lineups here!</p>
            </div>
          ) : (
            <div>
              <div className="lineup-list">
                {lineups.map(lineup => (
                  <div 
                    key={lineup.id}
                    className={`lineup-card ${lineup.isLive ? 'live' : ''}`}
                    onClick={() => viewLineupDetails(lineup.id)}
                  >
                    <div className="lineup-header">
                      <div>
                        <h4 className="lineup-title">{lineup.contestName}</h4>
                        <div className="lineup-details">
                          <span>{formatContestType(lineup.contestType)}</span>
                          <span className="separator">•</span>
                          <span>Entry: ${lineup.entryFee}</span>
                          {lineup.finalScore !== null && (
                            <>
                              <span className="separator">•</span>
                              <span>Score: {lineup.finalScore}</span>
                            </>
                          )}
                          {lineup.rank && (
                            <>
                              <span className="separator">•</span>
                              <span>Rank: {lineup.rank}</span>
                            </>
                          )}
                          {lineup.payout > 0 && (
                            <>
                              <span className="separator">•</span>
                              <span className="lineup-payout">Won: ${lineup.payout}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="lineup-status-container">
                        <span className={`status-badge ${lineup.status}`}>
                          {lineup.status}
                        </span>
                        {lineup.isLive && (
                          <span className="live-indicator">● LIVE</span>
                        )}
                      </div>
                    </div>

                    {lineup.roster && (
                      <div className="roster-preview">
                        <strong>Roster:</strong> {' '}
                        {Object.entries(lineup.roster).map(([pos, player], idx) => (
                          <span key={pos}>
                            {player?.name || 'Empty'} ({pos})
                            {idx < Object.entries(lineup.roster).length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {lineupStats.totalPages > 1 && (
                <div className="pagination">
                  <button
                    onClick={() => handleFilterChange('page', Math.max(1, lineupFilters.page - 1))}
                    disabled={lineupFilters.page === 1}
                  >
                    Previous
                  </button>
                  <span className="pagination-info">
                    Page {lineupFilters.page} of {lineupStats.totalPages}
                  </span>
                  <button
                    onClick={() => handleFilterChange('page', lineupFilters.page + 1)}
                    disabled={!lineupStats.hasMore}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {selectedLineup && (
            <div className="modal-overlay" onClick={() => setSelectedLineup(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>{selectedLineup.contestName}</h3>
                <div className={`status-badge ${selectedLineup.status}`}>
                  {selectedLineup.status}
                </div>
                
                <div className="roster-details">
                  <h4>Roster Details</h4>
                  {selectedLineup.roster && Object.entries(selectedLineup.roster).map(([pos, player]) => (
                    <div key={pos} className="roster-item">
                      <span><strong>{pos}:</strong> {player?.name || 'Empty'}</span>
                      <span>{player?.team} - ${player?.price || 0}</span>
                    </div>
                  ))}
                </div>

                <div className="scoring-details">
                  <h4>Scoring</h4>
                  <p>Live Score: {selectedLineup.liveScore || 0}</p>
                  <p>Final Score: {selectedLineup.finalScore || 'Pending'}</p>
                  {selectedLineup.rank && <p>Final Rank: {selectedLineup.rank}</p>}
                  {selectedLineup.payout > 0 && (
                    <p className="payout-amount">Payout: ${selectedLineup.payout}</p>
                  )}
                </div>

                <button className="btn btn-primary" onClick={() => setSelectedLineup(null)}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="settings-form">
          <h3>Settings</h3>
          {!editing ? (
            <div>
              <p className="profile-stat-item"><strong>Bio:</strong> {user?.bio || 'No bio set'}</p>
              <p className="profile-stat-item"><strong>Email Notifications:</strong> {user?.email_notifications ? 'Enabled' : 'Disabled'}</p>
              <p className="profile-stat-item"><strong>Draft Reminders:</strong> {user?.draft_reminders ? 'Enabled' : 'Disabled'}</p>
              <p className="profile-stat-item"><strong>Sound Effects:</strong> {user?.sound_enabled ? 'Enabled' : 'Disabled'}</p>
              <button className="btn btn-primary" onClick={() => setEditing(true)}>
                Edit Settings
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Bio:</label>
                <textarea
                  name="bio"
                  value={formData.bio}
                  onChange={handleChange}
                  rows="4"
                />
              </div>
              
              <div className="checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="email_notifications"
                    checked={formData.email_notifications}
                    onChange={handleChange}
                  />
                  Email Notifications
                </label>
              </div>
              
              <div className="checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="draft_reminders"
                    checked={formData.draft_reminders}
                    onChange={handleChange}
                  />
                  Draft Reminders
                </label>
              </div>
              
              <div className="checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="sound_enabled"
                    checked={formData.sound_enabled}
                    onChange={handleChange}
                  />
                  Sound Effects
                </label>
              </div>
              
              <div className="form-buttons">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileScreen;