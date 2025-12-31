// frontend/src/hooks/useAutoPick.js
import { useState, useCallback } from 'react';

export const useAutoPick = (playerBoard, currentTeam, budget) => {
  const [selectedAutoPick, setSelectedAutoPick] = useState(null);

  const getAvailableSlots = useCallback((player) => {
    const playerPos = player.originalPosition || player.position;
    const availableSlots = [];
    const roster = currentTeam.roster || {};

    // Check if the specific position slot is open
    if (!roster[playerPos]) {
      availableSlots.push(playerPos);
    }

    // Check if FLEX slot is available (only for RB, WR, TE)
    if (!roster.FLEX && ['RB', 'WR', 'TE'].includes(playerPos)) {
      availableSlots.push('FLEX');
    }

    return availableSlots;
  }, [currentTeam]);

  const calculateAutoPick = useCallback(() => {
    let bestPick = null;
    let bestValue = -1;

    playerBoard.forEach((row, rowIndex) => {
      row.forEach((player, colIndex) => {
        if (player.drafted || player.price > budget) return;

        const availableSlots = getAvailableSlots(player);
        if (availableSlots.length === 0) return;

        // Calculate value score (you can adjust this formula)
        const value = player.price * (1 + (player.bonus || 0) * 0.1);
        
        if (value > bestValue) {
          bestValue = value;
          bestPick = {
            row: rowIndex,
            col: colIndex,
            player,
            slot: availableSlots[0]
          };
        }
      });
    });

    setSelectedAutoPick(bestPick);
    return bestPick;
  }, [playerBoard, currentTeam, budget, getAvailableSlots]);

  const clearAutoPick = useCallback(() => {
    setSelectedAutoPick(null);
  }, []);

  return {
    selectedAutoPick,
    calculateAutoPick,
    clearAutoPick
  };
};