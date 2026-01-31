// DraftScreen.mobile.jsx
// Mobile-specific components for the draft screen

import React from 'react';

/**
 * Auto-draft bar shown when a player is selected
 * Displays which player will be auto-drafted if time runs out
 * Or shows pre-selection when not your turn
 */
export const AutoDraftBar = ({ selectedPlayer, visible, isMyTurn }) => {
  if (!visible || !selectedPlayer) return null;
  
  return (
    <div className={`auto-draft-bar visible ${!isMyTurn ? 'pre-selected' : ''}`}>
      {isMyTurn 
        ? `⚡ AUTO-DRAFT: ${selectedPlayer.name} ($${selectedPlayer.price})`
        : `✓ QUEUED: ${selectedPlayer.name} ($${selectedPlayer.price})`
      }
    </div>
  );
};

/**
 * Confirmation modal for drafting a player
 * Shows player details and big DRAFT button
 * Tap outside to dismiss (doesn't clear selection)
 * Can be opened anytime for preview, but DRAFT only works on your turn
 */
export const MobileConfirmModal = ({ 
  player, 
  visible, 
  onConfirm, 
  onDismiss,
  isMyTurn = false,
  timeRemaining = 30
}) => {
  if (!player) return null;

  const handleOverlayClick = (e) => {
    // Only dismiss if clicking the overlay, not the modal itself
    if (e.target === e.currentTarget) {
      onDismiss();
    }
  };

  const handleConfirm = () => {
    if (isMyTurn) {
      onConfirm(player);
    }
  };

  const isLowTime = isMyTurn && timeRemaining <= 10;

  return (
    <div 
      className={`mobile-confirm-overlay ${visible ? 'visible' : ''}`}
      onClick={handleOverlayClick}
    >
      <div className={`mobile-confirm-modal ${isLowTime ? 'low-time' : ''}`}>
        <div className="mobile-confirm-price">${player.price}</div>
        <div className="mobile-confirm-name">{player.name}</div>
        <div className="mobile-confirm-details">
          {player.team} • {player.position}
        </div>
        {player.matchup && (
          <div className="mobile-confirm-matchup">{player.matchup}</div>
        )}
        
        {isLowTime && (
          <div className="mobile-confirm-timer-warning">
            ⏰ {timeRemaining}s - Tap now!
          </div>
        )}
        
        <button 
          className={`mobile-confirm-btn ${!isMyTurn ? 'not-my-turn' : ''}`}
          onClick={handleConfirm}
          disabled={!isMyTurn}
        >
          {isMyTurn ? 'DRAFT' : 'READY'}
        </button>
        
        <div className="mobile-confirm-hint">
          {isMyTurn 
            ? 'Tap anywhere outside to cancel' 
            : 'Pre-selected • Will auto-draft if timer expires'}
        </div>
      </div>
    </div>
  );
};

/**
 * Compact roster bar for mobile
 * Shows filled/empty slots at bottom of screen
 */
export const MobileRosterBar = ({ roster, budget, bonus = 0 }) => {
  const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
  const filledCount = slots.filter(slot => roster?.[slot]?.name).length;
  const totalSpent = 15 - (budget || 15);
  
  // Helper to get player name truncated for display
  const getPlayerDisplay = (slot) => {
    const player = roster?.[slot];
    if (!player?.name) return null;
    // Get last name or truncate if needed
    const parts = player.name.split(' ');
    return parts.length > 1 ? parts[parts.length - 1] : player.name;
  };

  return (
    <div className="mobile-roster-bar">
      <div className="mobile-roster-header">
        <span className="label">YOUR ROSTER</span>
        <span className="status">
          {filledCount}/5 • ${totalSpent} spent • ${budget + bonus} left
        </span>
      </div>
      <div className="mobile-roster-slots">
        {slots.map(slot => {
          const playerName = getPlayerDisplay(slot);
          const isFilled = !!playerName;
          
          return (
            <div 
              key={slot} 
              className={`mobile-roster-slot ${isFilled ? 'filled' : ''}`}
            >
              <div className="pos">{slot}</div>
              {playerName && (
                <div className="player-mini">{playerName}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Mobile header with timer, turn indicator, and budget
 * Simplified version of desktop header
 */
export const MobileHeader = ({ 
  timeRemaining, 
  isMyTurn, 
  budget, 
  bonus = 0,
  showWarning 
}) => {
  const timerClass = `timer ${isMyTurn ? 'my-turn' : ''} ${showWarning ? 'warning' : ''}`;
  
  return (
    <div className="draft-header">
      <div className="timer-section">
        <div className={timerClass}>
          {timeRemaining || 30}s
        </div>
        {isMyTurn && (
          <div className="turn-indicator">YOUR TURN</div>
        )}
      </div>
      <div className="mobile-budget">
        ${(budget || 15) + bonus}
      </div>
    </div>
  );
};

/**
 * Hook to detect if we're on mobile
 */
export const useIsMobile = () => {
  // Initialize with actual value to avoid flash of wrong state
  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};

/**
 * Hook to manage mobile draft selection state
 * Keeps track of selected player for auto-draft
 */
export const useMobileSelection = () => {
  const [mobileSelectedPlayer, setMobileSelectedPlayer] = React.useState(null);
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);

  const selectPlayer = (player, row, col) => {
    setMobileSelectedPlayer({ ...player, row, col });
    setShowConfirmModal(true);
  };

  const dismissModal = () => {
    // Close modal but keep player selected for auto-draft
    setShowConfirmModal(false);
  };

  const clearSelection = () => {
    setMobileSelectedPlayer(null);
    setShowConfirmModal(false);
  };

  const confirmSelection = () => {
    setShowConfirmModal(false);
    // Return the player to be drafted
    return mobileSelectedPlayer;
  };

  return {
    mobileSelectedPlayer,
    showConfirmModal,
    selectPlayer,
    dismissModal,
    clearSelection,
    confirmSelection,
  };
};

export default {
  AutoDraftBar,
  MobileConfirmModal,
  MobileRosterBar,
  MobileHeader,
  useIsMobile,
  useMobileSelection,
};
