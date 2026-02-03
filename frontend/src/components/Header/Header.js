// frontend/src/components/Header/Header.js
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { selectAuthUser, selectIsAuthenticated, logout } from '../../store/slices/authSlice';
import { showToast } from '../../store/slices/uiSlice';
import axios from 'axios';
import './Header.css';

const Header = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector(selectAuthUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  
  const [userData, setUserData] = useState({
    balance: 0,
    tickets: 0
  });
  
  useEffect(() => {
    const fetchUserData = async () => {
      if (!isAuthenticated) return;
      
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
        }
      } catch (error) {
        console.error('Error fetching user balance/tickets:', error);
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
    
    fetchUserData();
    const interval = setInterval(fetchUserData, 30000);
    const handleFocus = () => fetchUserData();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, user?.id]);

  const handleLogout = () => {
    dispatch(logout());
    dispatch(showToast({ message: 'Logged out successfully', type: 'info' }));
    navigate('/');
  };

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

  const isActive = (path) => location.pathname === path;

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          BidBlitz
        </Link>
        
        <nav className="nav">
          {isAuthenticated ? (
            <>
              <Link 
                to="/dashboard" 
                className={`nav-btn ${isActive('/dashboard') ? 'nav-btn-active' : ''}`}
              >
                Dashboard
              </Link>
              <Link 
                to="/lobby" 
                className={`nav-btn ${isActive('/lobby') ? 'nav-btn-active' : ''}`}
              >
                Lobby
              </Link>
              <Link 
                to="/teams" 
                className={`nav-btn ${isActive('/teams') ? 'nav-btn-active' : ''}`}
              >
                Teams
              </Link>
              <Link 
                to="/market-mover" 
                className={`nav-btn nav-btn-voting ${isActive('/market-mover') ? 'nav-btn-active' : ''}`}
              >
                <span className="nav-btn-emoji">📈 </span>Voting
              </Link>
              {(user?.role === 'admin' || user?.is_admin) && (
                <Link 
                  to="/admin" 
                  className={`nav-btn nav-btn-admin ${isActive('/admin') ? 'nav-btn-active' : ''}`}
                >
                  Admin
                </Link>
              )}
              <div className="user-info">
                <div className="user-stats-bar">
                  <button 
                    className="add-funds-btn"
                    onClick={() => navigate('/deposit')}
                    title="Add Funds"
                  >
                    +
                  </button>
                  <span 
                    className="balance" 
                    onClick={refreshBalance}
                    title="Click to refresh"
                  >
                    ${Number(userData.balance).toFixed(2)}
                  </span>
                  <div 
                    className="tickets-display"
                    onClick={refreshBalance}
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
              <Link to="/login" className="nav-btn">Login</Link>
              <Link to="/register" className="nav-btn">Register</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;