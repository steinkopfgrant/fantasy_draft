import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectAuthUser, selectIsAuthenticated } from '../../store/slices/authSlice';
import axios from 'axios';
import './LegalPages.css';

const ResponsibleGaming = () => {
  const user = useSelector(selectAuthUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [depositLimit, setDepositLimit] = useState('');
  const [limitPeriod, setLimitPeriod] = useState('weekly');
  const [currentLimits, setCurrentLimits] = useState(null);
  const [selfExcludeConfirm, setSelfExcludeConfirm] = useState('');
  const [showExcludeModal, setShowExcludeModal] = useState(false);
  const [message, setMessage] = useState('');

  const handleSetLimit = async () => {
    if (!depositLimit || isNaN(depositLimit) || Number(depositLimit) <= 0) {
      setMessage('Please enter a valid deposit limit amount.');
      return;
    }
    try {
      await axios.post('/api/users/deposit-limit', {
        amount: Number(depositLimit),
        period: limitPeriod
      });
      setMessage(`✅ ${limitPeriod.charAt(0).toUpperCase() + limitPeriod.slice(1)} deposit limit set to $${depositLimit}`);
      setDepositLimit('');
    } catch (error) {
      setMessage('Failed to set deposit limit. Please try again or contact support.');
    }
  };

  const handleSelfExclude = async () => {
    if (selfExcludeConfirm !== 'EXCLUDE') {
      setMessage('Please type EXCLUDE to confirm self-exclusion.');
      return;
    }
    try {
      await axios.post('/api/users/self-exclude');
      setMessage('✅ Your account has been self-excluded. Contact support@bidblitz.io to discuss reactivation.');
      setShowExcludeModal(false);
      setSelfExcludeConfirm('');
    } catch (error) {
      setMessage('Failed to process self-exclusion. Please contact support@bidblitz.io directly.');
    }
  };

  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1>Responsible Gaming</h1>
        <p className="legal-subtitle">
          BidBlitz is committed to promoting responsible gaming. Fantasy sports should be fun and 
          entertaining — never a source of financial stress.
        </p>

        <section>
          <h2>Our Commitment</h2>
          <p>
            We believe in providing a safe, fair, and transparent environment for all players. 
            We offer tools and resources to help you stay in control of your gaming activity 
            and make informed decisions about your participation.
          </p>
        </section>

        <section>
          <h2>Know the Signs</h2>
          <p>Gaming may become a problem if you:</p>
          <ul>
            <li>Spend more money than you can afford to lose</li>
            <li>Chase losses by depositing more after a losing streak</li>
            <li>Neglect responsibilities, relationships, or work due to gaming</li>
            <li>Feel anxious, irritable, or stressed about your gaming activity</li>
            <li>Borrow money or sell possessions to fund your account</li>
            <li>Lie to others about how much time or money you spend gaming</li>
            <li>Feel unable to stop or reduce your gaming activity</li>
          </ul>
          <p>
            If any of these apply to you, we encourage you to use the tools below or seek professional help.
          </p>
        </section>

        {isAuthenticated && (
          <section className="rg-tools-section">
            <h2>Your Responsible Gaming Tools</h2>
            
            {message && (
              <div className={`rg-message ${message.startsWith('✅') ? 'rg-success' : 'rg-error'}`}>
                {message}
              </div>
            )}

            <div className="rg-tool-card">
              <h3>💰 Deposit Limits</h3>
              <p>Set a maximum deposit amount to control your spending.</p>
              <div className="rg-form-row">
                <div className="rg-input-group">
                  <label>Amount ($)</label>
                  <input
                    type="number"
                    value={depositLimit}
                    onChange={(e) => setDepositLimit(e.target.value)}
                    placeholder="Enter limit amount"
                    min="1"
                  />
                </div>
                <div className="rg-input-group">
                  <label>Period</label>
                  <select value={limitPeriod} onChange={(e) => setLimitPeriod(e.target.value)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <button className="rg-btn" onClick={handleSetLimit}>Set Limit</button>
              </div>
              <p className="rg-note">
                Note: Lowering a deposit limit takes effect immediately. 
                Increasing or removing a limit has a 48-hour cooling-off period.
              </p>
            </div>

            <div className="rg-tool-card rg-danger-card">
              <h3>🚫 Self-Exclusion</h3>
              <p>
                If you need a break, you can self-exclude from the Platform. During self-exclusion, 
                you will not be able to enter contests, make deposits, or access your account.
              </p>
              {!showExcludeModal ? (
                <button 
                  className="rg-btn rg-btn-danger" 
                  onClick={() => setShowExcludeModal(true)}
                >
                  Request Self-Exclusion
                </button>
              ) : (
                <div className="rg-exclude-modal">
                  <p className="rg-warning">
                    ⚠️ This action will immediately lock your account. You will not be able to 
                    play, deposit, or withdraw until the exclusion period ends. To reactivate 
                    your account, you must contact support and wait a minimum cooling-off period.
                  </p>
                  <label>Type <strong>EXCLUDE</strong> to confirm:</label>
                  <input
                    type="text"
                    value={selfExcludeConfirm}
                    onChange={(e) => setSelfExcludeConfirm(e.target.value)}
                    placeholder="Type EXCLUDE"
                  />
                  <div className="rg-btn-row">
                    <button className="rg-btn rg-btn-danger" onClick={handleSelfExclude}>
                      Confirm Self-Exclusion
                    </button>
                    <button 
                      className="rg-btn rg-btn-secondary" 
                      onClick={() => { setShowExcludeModal(false); setSelfExcludeConfirm(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <h2>Getting Help</h2>
          <p>
            If you or someone you know is struggling with problem gambling, 
            these resources can help:
          </p>
          <div className="rg-resources">
            <div className="rg-resource-card">
              <h3>National Council on Problem Gambling</h3>
              <p>24/7 Confidential Helpline</p>
              <a href="tel:1-800-522-4700" className="rg-phone">1-800-522-4700</a>
              <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer">
                ncpgambling.org
              </a>
            </div>
            <div className="rg-resource-card">
              <h3>Gamblers Anonymous</h3>
              <p>Support groups and recovery resources</p>
              <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer">
                gamblersanonymous.org
              </a>
            </div>
            <div className="rg-resource-card">
              <h3>SAMHSA National Helpline</h3>
              <p>Free treatment referrals and information</p>
              <a href="tel:1-800-662-4357" className="rg-phone">1-800-662-4357</a>
              <a href="https://www.samhsa.gov" target="_blank" rel="noopener noreferrer">
                samhsa.gov
              </a>
            </div>
          </div>
        </section>

        <section>
          <h2>Tips for Responsible Play</h2>
          <ul>
            <li>Set a budget before you start and stick to it</li>
            <li>Never deposit more than you can afford to lose</li>
            <li>Take regular breaks from the Platform</li>
            <li>Don't chase losses — accept them as part of the game</li>
            <li>Keep fantasy sports as entertainment, not a primary source of income</li>
            <li>Use our deposit limit tools to stay in control</li>
            <li>Talk to someone if you feel your gaming habits are becoming unhealthy</li>
          </ul>
        </section>

        <section>
          <h2>Contact Us</h2>
          <p>
            If you have concerns about your gaming activity or need assistance with responsible 
            gaming tools, please contact us at{' '}
            <a href="mailto:support@bidblitz.io">support@bidblitz.io</a>. 
            We're here to help.
          </p>
        </section>
      </div>
    </div>
  );
};

export default ResponsibleGaming;