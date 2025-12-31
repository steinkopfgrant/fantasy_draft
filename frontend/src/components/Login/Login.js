// frontend/src/components/Login/Login.js
import React, { useState, useEffect } from 'react';
import './Login.css';
import LightningTransition, { useLightningTransition } from '../Effects/LightningTransition';

const LoginScreen = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // ⚡ Lightning transition hook
  const { isActive, triggerLightning, handleComplete } = useLightningTransition();
  
  console.log('⚡ Login render - isActive:', isActive);
  
  // Store login data to use after animation
  const [pendingLogin, setPendingLogin] = useState(null);
  
  // Rotating featured players for the showcase
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const featuredPlayers = [
    { name: 'Josh Allen', boost: '+35%', position: 'QB' },
    { name: 'Christian McCaffrey', boost: '+28%', position: 'RB' },
    { name: 'Ja\'Marr Chase', boost: '+22%', position: 'WR' },
    { name: 'Travis Kelce', boost: '+19%', position: 'TE' },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % featuredPlayers.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [featuredPlayers.length]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const endpoint = isLogin ? 'login' : 'register';
    const body = isLogin 
      ? { username, password }
      : { username, email, password };

    try {
      const response = await fetch(`http://localhost:5000/api/auth/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Login successful - TRIGGERING LIGHTNING!');
        // ⚡ Store login data and trigger lightning!
        setPendingLogin({ user: data.user, token: data.token });
        triggerLightning(() => {
          // This runs after lightning animation completes
          console.log('⚡ Lightning animation complete - calling onLogin');
          onLogin(data.user, data.token);
        });
      } else {
        setError(data.error || 'Authentication failed');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Network error:', error);
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setUsername('');
    setEmail('');
    setPassword('');
  };

  // ⚡ Wrap entire component in LightningTransition
  return (
    <LightningTransition active={isActive} onComplete={handleComplete}>
      <div className="login-screen">
        {/* Animated background elements */}
        <div className="bg-gradient"></div>
        <div className="bg-grid"></div>
        
        <div className="login-content">
          {/* Left side - Branding & Features */}
          <div className="login-hero">
            <div className="hero-badge">
              <span className="badge-icon">🏈</span>
              <span className="badge-text">Fantasy Reimagined</span>
            </div>
            
            <h1 className="hero-title">
              <span className="title-icon">🔥</span>
              Market Mover
            </h1>
            
            <p className="hero-tagline">
              The first fantasy platform where <span className="highlight">YOU</span> control the player pool.
            </p>
            
            {/* Feature Cards */}
            <div className="feature-cards">
              <div className="feature-card featured-player">
                <div className="card-header">
                  <span className="card-icon">🔥</span>
                  <span className="card-label">Current BID UP Player</span>
                </div>
                <div className="player-showcase">
                  <span className="player-name">{featuredPlayers[featuredIndex].name}</span>
                  <span className="player-position">{featuredPlayers[featuredIndex].position}</span>
                </div>
                <div className="boost-badge">
                  {featuredPlayers[featuredIndex].boost} Appearance Rate
                </div>
              </div>
              
              <div className="feature-card vote-card">
                <div className="card-header">
                  <span className="card-icon">🗳️</span>
                  <span className="card-label">Vote & Influence</span>
                </div>
                <p className="card-description">
                  Cast votes to boost players. Gain intel on what others are building.
                </p>
                <div className="vote-indicator">
                  <span className="pulse-dot"></span>
                  <span>Voting Active</span>
                </div>
              </div>
              
              <div className="feature-card draft-card">
                <div className="card-header">
                  <span className="card-icon">⚡</span>
                  <span className="card-label">Live Snake Drafts</span>
                </div>
                <p className="card-description">
                  5-player drafts. $15 budget. Strategic picks in real-time.
                </p>
              </div>
            </div>
          </div>
          
          {/* Right side - Login Form */}
          <div className="login-form-container">
            <div className="form-box">
              <div className="form-header">
                <h2 className="form-title">{isLogin ? 'Welcome Back' : 'Join the Game'}</h2>
                <p className="form-subtitle">
                  {isLogin ? 'Sign in to continue drafting' : 'Create your account to start'}
                </p>
              </div>
              
              {error && (
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="login-form">
                <div className="input-group">
                  <label className="input-label">Username</label>
                  <input
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="form-input"
                    autoComplete="username"
                    disabled={isActive}
                  />
                </div>
                
                {!isLogin && (
                  <div className="input-group">
                    <label className="input-label">Email</label>
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="form-input"
                      autoComplete="email"
                      disabled={isActive}
                    />
                  </div>
                )}
                
                <div className="input-group">
                  <label className="input-label">Password</label>
                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="form-input"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    disabled={isActive}
                  />
                </div>
                
                <button 
                  type="submit" 
                  className={`submit-button ${isLoading ? 'loading' : ''} ${isActive ? 'lightning' : ''}`}
                  disabled={isLoading || isActive}
                >
                  {isActive ? (
                    <span>⚡ THUNDER! ⚡</span>
                  ) : isLoading ? (
                    <span className="loading-spinner"></span>
                  ) : (
                    isLogin ? 'Sign In' : 'Create Account'
                  )}
                </button>
              </form>
              
              <div className="form-divider">
                <span>or</span>
              </div>
              
              <button onClick={toggleMode} className="toggle-button" disabled={isLoading || isActive}>
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
              
              <p className="form-footer">
                By continuing, you agree to our Terms of Service
              </p>
            </div>
          </div>
        </div>
      </div>
    </LightningTransition>
  );
};

export default LoginScreen;