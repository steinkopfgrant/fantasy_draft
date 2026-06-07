// frontend/src/components/Settings/SettingsPage.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSoundSettings } from '../../hooks/useSoundSettings';
import './SettingsPage.css';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { muted, toggleMute } = useSoundSettings();

  return (
    <div className="settings-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Sound</h2>

        <div className="setting-row">
          <div className="setting-label">
            <div className="setting-title">Draft entry sound</div>
            <div className="setting-description">
              Plays a short sound when your draft begins.
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={!muted}
              onChange={toggleMute}
              aria-label="Toggle draft entry sound"
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {muted && (
          <div className="setting-hint">
            🔇 Sounds are currently muted. Toggle on to re-enable.
          </div>
        )}
      </section>
    </div>
  );
};

export default SettingsPage;