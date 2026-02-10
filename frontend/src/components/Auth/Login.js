// frontend/src/components/Auth/Login.js
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { clearError } from '../../store/slices/authSlice';
import LightningTransition, { useLightningTransition } from '../Effects/LightningTransition';
import { subscribeToPush } from '../../services/pushNotifications';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const dispatch = useDispatch();
  const isMountedRef = useRef(true);
  
  // ⚡ Lightning transition hook
  const { isActive, triggerLightning, handleComplete } = useLightningTransition();
  
  useEffect(() => {
    isMountedRef.current = true;
    dispatch(clearError());
    return () => {
      isMountedRef.current = false;
    };
  }, [dispatch]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        console.log('✅ Login successful - TRIGGERING LIGHTNING!');
        
        // Store token in localStorage
        localStorage.setItem('token', data.token);
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
        }
        
        // Subscribe to push notifications (fire and forget)
        subscribeToPush(data.token).catch(err => 
          console.log('Push subscription skipped:', err.message)
        );
        
        // ⚡ Trigger lightning animation
        triggerLightning(() => {
          console.log('⚡ Lightning complete - redirecting to dashboard');
          
          // Use window.location for a full page reload
          // This ensures all auth state is properly initialized
          window.location.href = '/dashboard';
        });
      } else {
        setLocalError(data.error || data.message || 'Login failed');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setLocalError('Network error. Please try again.');
      setIsSubmitting(false);
    }
  };
  
  const isDisabled = isSubmitting || isActive;
  
  return (
    <LightningTransition active={isActive} onComplete={handleComplete}>
      <div style={{ 
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0e1b 0%, #1a1f2e 100%)'
      }}>
        <div style={{ 
          maxWidth: '400px', 
          width: '100%',
          margin: '2rem', 
          padding: '2.5rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h2 style={{ 
            color: '#fff', 
            textAlign: 'center', 
            marginBottom: '1.5rem',
            fontSize: '1.8rem'
          }}>
            Welcome Back
          </h2>
          
          {localError && (
            <div style={{ 
              color: '#ff6b6b', 
              backgroundColor: 'rgba(255, 68, 68, 0.1)',
              border: '1px solid rgba(255, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '1rem' 
            }}>
              {localError}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                color: '#94a3b8',
                fontSize: '0.9rem'
              }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                disabled={isDisabled}
                style={{ 
                  display: 'block', 
                  width: '100%', 
                  padding: '12px 16px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                color: '#94a3b8',
                fontSize: '0.9rem'
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isDisabled}
                style={{ 
                  display: 'block', 
                  width: '100%', 
                  padding: '12px 16px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isDisabled}
              style={{
                width: '100%',
                padding: '14px',
                background: isActive 
                  ? 'linear-gradient(45deg, #FFD700, #FF8C00)' 
                  : isSubmitting 
                    ? 'rgba(0, 191, 255, 0.5)' 
                    : 'linear-gradient(45deg, #00bfff, #0099cc)',
                color: isActive ? '#1a1a2e' : 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: '1.1rem',
                fontWeight: '600',
                boxShadow: isActive 
                  ? '0 4px 20px rgba(255, 215, 0, 0.4)'
                  : '0 4px 15px rgba(0, 191, 255, 0.3)',
                transition: 'all 0.3s'
              }}
            >
              {isActive ? '⚡ THUNDER! ⚡' : isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          
          <p style={{ 
            marginTop: '1.5rem', 
            textAlign: 'center',
            color: '#8892b0'
          }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#00bfff', textDecoration: 'none' }}>
              Register
            </Link>
          </p>
        </div>
      </div>
    </LightningTransition>
  );
};

export default Login;