// frontend/src/components/Header/Header.js
// UPDATED: Replaced "Profile" with "Teams"
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { selectAuthUser, selectIsAuthenticated, logout } from '../../store/slices/authSlice';
import { showToast } from '../../store/slices/uiSlice';
import axios from 'axios';
import './Header.css';

const Header = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectAuthUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  
  // Local state for balance and tickets
  const [userData, setUserData] = useState({
    balance: 0,
    tickets: 0
  });
  
  // Fetch balance and tickets directly
  useEffect(() => {
    const fetchUserData = async () => {
      if (!isAuthenticated) return;
      
      const token = localStorage.getItem('token');
      if (!token) return;
      
      try {
        const response = await axios.get('/api/users/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('Fetched user profile:', response.data);
        
        if (response.data.user) {
          setUserData({
            balance: response.data.user.balance || 0,
            tickets: response.data.user.tickets || 0
          });
        }
      } catch (error) {
        console.error('Error fetching user balance/tickets:', error);
        // Try the balance endpoint as fallback
        try {
          const balanceResponse = await axios.get('/api/users/balance', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (balanceResponse.data) {
            setUserData({
              balance: balanceResponse.data.balance || 0,
              tickets: balanceResponse.data.tickets || 0
            });
          }
        } catch (balanceError) {
          console.error('Error fetching from balance endpoint:', balanceError);
        }
      }
    };
    
    // Fetch immediately
    fetchUserData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchUserData, 30000);
    
    // Also refresh when window gains focus
    const handleFocus = () => fetchUserData();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, user?.id]); // Re-fetch when user changes

  const handleLogout = () => {
    dispatch(logout());
    dispatch(showToast({ message: 'Logged out successfully', type: 'info' }));
    navigate('/');
  };

  const handleMarketMoverClick = () => {
    navigate('/market-mover');
  };

  // Manual refresh function for testing
  const refreshBalance = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const response = await axios.get('/api/users/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.data.user) {
        setUserData({
          balance: response.data.user.balance || 0,
          tickets: response.data.user.tickets || 0
        });
        dispatch(showToast({ message: 'Balance refreshed!', type: 'success' }));
      }
    } catch (error) {
      console.error('Error refreshing balance:', error);
      dispatch(showToast({ message: 'Failed to refresh balance', type: 'error' }));
    }
  };

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          BidBlitz
        </Link>
        
        <nav className="nav">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/lobby">Lobby</Link>
              <Link to="/teams">Teams</Link>
              <button 
                onClick={handleMarketMoverClick}
                className="nav-link-button market-mover-btn"
              >
                📈 Market Mover
              </button>
              {(user?.role === 'admin' || user?.is_admin) && (
                <Link to="/admin">Admin</Link>
              )}
              <div className="user-info">
                <div className="user-stats">
                  <span 
                    className="balance" 
                    onClick={refreshBalance}
                    style={{ cursor: 'pointer' }}
                    title="Click to refresh"
                  >
                    ${Number(userData.balance).toFixed(2)}
                  </span>
                  <div 
                    className="tickets-display"
                    onClick={refreshBalance}
                    style={{ cursor: 'pointer' }}
                    title="Click to refresh"
                  >
                    <span className="tickets-icon">🎟️</span>
                    <span className="tickets-count">{userData.tickets}</span>
                  </div>
                </div>
                <span className="username">{user?.username}</span>
                <button onClick={handleLogout} className="logout-btn">
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;