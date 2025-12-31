import React, { useState, useEffect } from 'react';
import './CompletedDraft.css';

const CompletedDraft = ({ entry, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [draftDetails, setDraftDetails] = useState(null);

  useEffect(() => {
    // Simulate loading draft details
    setLoading(false);
    setDraftDetails(entry);
  }, [entry]);

  const calculateTotalSpent = (roster) => {
    if (!roster) return 0;
    return Object.values(roster)
      .filter(player => player)
      .reduce((total, player) => total + (player.price || 0), 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="completed-draft-container">
        <div className="loading">Loading draft details...</div>
      </div>
    );
  }

  return (
    <div className="completed-draft-container">
      <div className="draft-header">
        <button className="back-button" onClick={onBack}>
          ← Back to My Contests
        </button>
        <h1>Draft Details</h1>
      </div>

      <div className="draft-info">
        <div className="info-section">
          <h2>Contest Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">Contest:</span>
              <span className="value">{entry.Contest?.name || 'Contest'}</span>
            </div>
            <div className="info-item">
              <span className="label">Type:</span>
              <span className="value">{entry.Contest?.type?.toUpperCase() || 'N/A'}</span>
            </div>
            <div className="info-item">
              <span className="label">Entry Fee:</span>
              <span className="value">${entry.Contest?.entry_fee || 0}</span>
            </div>
            <div className="info-item">
              <span className="label">Prize Pool:</span>
              <span className="value">
                ${(parseFloat(entry.Contest?.prize_pool) || 0).toLocaleString()}
              </span>
            </div>
            <div className="info-item">
              <span className="label">Completed:</span>
              <span className="value">{formatDate(entry.updated_at)}</span>
            </div>
          </div>
        </div>

        <div className="info-section">
          <h2>Your Results</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">Final Rank:</span>
              <span className="value">{entry.final_rank || 'N/A'}</span>
            </div>
            <div className="info-item">
              <span className="label">Points Scored:</span>
              <span className="value">{entry.total_points || 0}</span>
            </div>
            <div className="info-item">
              <span className="label">Prize Won:</span>
              <span className="value prize">${entry.prize_won || 0}</span>
            </div>
          </div>
        </div>

        {entry.roster && (
          <div className="info-section">
            <h2>Your Roster</h2>
            <div className="roster-details">
              <div className="roster-header">
                <span>Total Spent: ${calculateTotalSpent(entry.roster)}</span>
                <span>Budget Remaining: ${15 - calculateTotalSpent(entry.roster)}</span>
              </div>
              <div className="roster-list">
                {['QB', 'RB', 'WR', 'TE', 'FLEX'].map(slot => {
                  const player = entry.roster[slot];
                  return (
                    <div key={slot} className="roster-player">
                      <div className="slot-label">{slot}</div>
                      {player ? (
                        <div className="player-details">
                          <div className="player-main">
                            <span className="player-name">{player.name}</span>
                            <span className="player-price">${player.price}</span>
                          </div>
                          <div className="player-sub">
                            <span className="player-team">{player.team}</span>
                            <span className="player-position">{player.position}</span>
                            {player.points !== undefined && (
                              <span className="player-points">{player.points} pts</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="empty-slot">Empty</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {entry.draft_order && (
          <div className="info-section">
            <h2>Draft Order</h2>
            <div className="draft-order">
              {entry.draft_order.map((pick, index) => (
                <div key={index} className="draft-pick">
                  <span className="pick-number">#{index + 1}</span>
                  <span className="pick-player">{pick.player}</span>
                  <span className="pick-slot">{pick.slot}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompletedDraft;