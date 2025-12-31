import React from 'react';
import './ResultsModal.css';

const ResultsModal = ({ results, onClose, contestType }) => {
  const prizes = {
    cash: [25, 0, 0, 0, 0],
    bash: [3000, 1000, 500, 300, 200],
    market: [35000, 20000, 15000, 10000, 5000],
    kingpin: [67500, 37500, 22500, 15000, 7500]
  };

  const contestPrizes = prizes[contestType] || [0, 0, 0, 0, 0];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Draft Results</h2>
        <div className="results-table">
          <div className="results-header">
            <span>Place</span>
            <span>Team</span>
            <span>Points</span>
            <span>Prize</span>
          </div>
          {results.map((team, index) => (
            <div 
              key={index} 
              className={`results-row ${team.color ? `team-${team.color}` : ''} ${index === 0 ? 'winner' : ''}`}
            >
              <span className="place">{index + 1}</span>
              <span className="team-name">{team.name || `Team ${index + 1}`}</span>
              <span className="points">{team.points}</span>
              <span className="prize">${contestPrizes[index] || 0}</span>
            </div>
          ))}
        </div>
        <button className="close-button" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
};

export default ResultsModal;