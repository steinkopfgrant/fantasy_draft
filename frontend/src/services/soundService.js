// frontend/src/services/soundService.js
//
// Lightweight sound service for BidBlitz. Plays preloaded audio with
// graceful failure (autoplay blocked, file missing, etc.) and persists
// the user's mute preference to localStorage.
//
// Currently registered sounds:
//   - draftStart: plays when a draft is about to begin (entry moment)
//
// To add a new sound: drop the file in frontend/public/sounds/, add an
// entry to SOUND_FILES below, then call soundService.play('yourSoundName').

const SOUND_FILES = {
  draftStart: '/sounds/draft-start.mp3',
};

const MUTE_STORAGE_KEY = 'bidblitz_sound_muted';
const DEFAULT_VOLUME = 0.7;

class SoundService {
  constructor() {
    this.sounds = {};
    this.loaded = false;
    this.muted = this._loadMutePreference();
    this.listeners = new Set();
    this._unlockBound = false;
  }

  _loadMutePreference() {
    try {
      return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  _saveMutePreference() {
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, this.muted ? 'true' : 'false');
    } catch (e) {
      // localStorage unavailable (private browsing, etc.) — silently ignore
    }
  }

  // Preload all sound files into Audio objects. Called automatically on
  // first play() call; safe to call multiple times.
  init() {
    if (this.loaded) return;
    Object.entries(SOUND_FILES).forEach(([key, path]) => {
      try {
        const audio = new Audio(path);
        audio.preload = 'auto';
        audio.volume = DEFAULT_VOLUME;
        this.sounds[key] = audio;
      } catch (e) {
        console.warn(`[sound] Failed to preload ${key}:`, e.message);
      }
    });
    this.loaded = true;
  }

  // Unlock audio playback on the user's first gesture. Browsers block
  // programmatic .play() until the page has received a user interaction
  // on the current page load. Priming each Audio element (muted) during a
  // real gesture lifts that block for the rest of the session, so a
  // draft-start sound that fires after a route change still plays.
  // Safe to call multiple times; only the first arms the listeners.
  unlockOnFirstGesture() {
    if (this._unlockBound) return;
    this._unlockBound = true;

    const unlock = () => {
      if (!this.loaded) this.init();

      Object.values(this.sounds).forEach((audio) => {
        try {
          audio.muted = true;
          const p = audio.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = false;
            }).catch(() => {
              audio.muted = false;
            });
          } else {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
          }
        } catch (e) {
          audio.muted = false;
        }
      });

      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('keydown', unlock);
      console.log('[sound] Audio unlocked on first gesture');
    };

    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    document.addEventListener('keydown', unlock);
  }

  play(name) {
    if (this.muted) return;
    if (!this.loaded) this.init();

    const sound = this.sounds[name];
    if (!sound) {
      console.warn(`[sound] Unknown sound: ${name}`);
      return;
    }

    try {
      sound.currentTime = 0;
      const playPromise = sound.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          // Most common: autoplay blocked by browser before user interaction
          console.warn(`[sound] Playback blocked for ${name}:`, err.message);
        });
      }
    } catch (e) {
      console.warn(`[sound] Playback failed for ${name}:`, e.message);
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._saveMutePreference();
    this.listeners.forEach((cb) => cb(this.muted));
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  isMuted() {
    return this.muted;
  }

  // Subscribe to mute changes. Returns an unsubscribe function.
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

const soundService = new SoundService();
soundService.unlockOnFirstGesture();
export default soundService;