// frontend/src/hooks/useSoundSettings.js
import { useState, useEffect, useCallback } from 'react';
import soundService from '../services/soundService';

/**
 * React hook for reading and updating the user's sound mute preference.
 *
 * Returns:
 *   - muted (boolean): current mute state
 *   - toggleMute (function): flips mute state
 *   - setMuted (function): explicitly set mute state
 */
export function useSoundSettings() {
  const [muted, setMutedState] = useState(soundService.isMuted());

  useEffect(() => {
    // Subscribe to changes from anywhere else in the app
    return soundService.subscribe(setMutedState);
  }, []);

  const toggleMute = useCallback(() => {
    soundService.toggleMute();
  }, []);

  const setMuted = useCallback((value) => {
    soundService.setMuted(value);
  }, []);

  return { muted, toggleMute, setMuted };
}