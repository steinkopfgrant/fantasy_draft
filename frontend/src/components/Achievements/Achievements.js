// frontend/src/components/Achievements/Achievements.js
import React, { useState, useEffect } from 'react';
import './Achievements.css';

const Achievements = ({ userId }) => {
  const [achievements, setAchievements] = useState([]);
  const [progress, setProgress] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAchievements();
  }, [userId]);

  const fetchAchievements = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/achievements/progress`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setProgress(data);
        setAchievements(data.achievements || []);
      }
    } catch (error) {
      console.error('Error fetching achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      draft: '🎯',
      win: '🏆',
      participation: '📊',
      special: '⭐',
      milestone: '🎖️'
    };
    return icons[category] || '🏅';
  };

  const filteredAchievements = achievements.filter(ach => 
    selectedCategory === 'all' || ach.category === selectedCategory
  );

  if (loading) {
    return (
      <div className="achievements-loading">
        <div className="loading-spinner"></div>
        <p>Loading achievements...</p>
      </div>
    );
  }

  return (
    <div className="achievements-container">
      <div className="achievements-header">
        <h2>Achievements</h2>
        <div className="achievement-stats">
          <div className="stat-item">
            <span className="stat-value">{progress?.completed || 0}</span>
            <span className="stat-label">Unlocked</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{progress?.points || 0}</span>
            <span className="stat-label">Points</span>
          </div>
        </div>
      </div>

      <div className="achievement-filters">
        <button 
          className={selectedCategory === 'all' ? 'active' : ''}
          onClick={() => setSelectedCategory('all')}
        >
          All ({achievements.length})
        </button>
        <button 
          className={selectedCategory === 'draft' ? 'active' : ''}
          onClick={() => setSelectedCategory('draft')}
        >
          {getCategoryIcon('draft')} Draft
        </button>
        <button 
          className={selectedCategory === 'win' ? 'active' : ''}
          onClick={() => setSelectedCategory('win')}
        >
          {getCategoryIcon('win')} Wins
        </button>
        <button 
          className={selectedCategory === 'participation' ? 'active' : ''}
          onClick={() => setSelectedCategory('participation')}
        >
          {getCategoryIcon('participation')} Participation
        </button>
        <button 
          className={selectedCategory === 'special' ? 'active' : ''}
          onClick={() => setSelectedCategory('special')}
        >
          {getCategoryIcon('special')} Special
        </button>
      </div>

      <div className="achievements-grid">
        {filteredAchievements.map((achievement) => (
          <div 
            key={achievement.id}
            className={`achievement-card ${achievement.completed ? 'completed' : 'locked'}`}
          >
            <div className="achievement-icon">
              {achievement.completed ? (
                achievement.reward_data?.icon || '🏅'
              ) : (
                '🔒'
              )}
            </div>
            
            <div className="achievement-info">
              <h3 className="achievement-name">{achievement.name}</h3>
              <p className="achievement-description">{achievement.description}</p>
              
              <div className="achievement-meta">
                <span className="achievement-points">
                  {achievement.points} pts
                </span>
                {achievement.completed && (
                  <span className="achievement-date">
                    {new Date(achievement.completedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Achievements;