// frontend/src/components/Header/Header.js
import React, { useState, useEffect, useRef } from 'react';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  
  const [userData, setUserData] = useState({
    balance: 0,
    tickets: 0
  });
  
  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

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
    setMenuOpen(false);
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
    <header className="header" ref={menuRef}>
      <div className="header-container">
        <Link to="/" className="logo">
          BidBlitz
        </Link>
        
        {/* Desktop nav */}
        <nav className="nav nav-desktop">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className={`nav-btn ${isActive('/dashboard') ? 'nav-btn-active' : ''}`}>
                Dashboard
              </Link>
              <Link to="/lobby" className={`nav-btn ${isActive('/lobby') ? 'nav-btn-active' : ''}`}>
                Lobby
              </Link>
              <Link to="/teams" className={`nav-btn ${isActive('/teams') ? 'nav-btn-active' : ''}`}>
                Teams
              </Link>
              <Link to="/market-mover" className={`nav-btn nav-btn-voting ${isActive('/market-mover') ? 'nav-btn-active' : ''}`}>
                📈 Voting
              </Link>
              {(user?.role === 'admin' || user?.is_admin) && (
                <Link to="/admin" className={`nav-btn ${isActive('/admin') ? 'nav-btn-active' : ''}`}>
                  Admin
                </Link>
              )}
              <div className="user-info">
                <div className="user-stats-bar">
                  <button className="add-funds-btn" onClick={() => navigate('/deposit')} title="Add Funds">
                    +
                  </button>
                  <span className="balance" onClick={refreshBalance} title="Click to refresh">
                    ${Number(userData.balance).toFixed(2)}
                  </span>
                  <div className="tickets-display" onClick={refreshBalance} title="Click to refresh">
                    <span className="tickets-icon">🎟️</span>
                    <span className="tickets-count">{userData.tickets}</span>
                  </div>
                </div>
                <span className="username">{user?.username}</span>
                <button onClick={handleLogout} className="logout-btn">Logout</button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-btn">Login</Link>
              <Link to="/register" className="nav-btn">Register</Link>
            </>
          )}
        </nav>

        {/* Mobile: balance + hamburger */}
        {isAuthenticated && (
          <div className="mobile-header-right">
            <div className="user-stats-bar mobile-stats">
              <button className="add-funds-btn" onClick={() => navigate('/deposit')} title="Add Funds">
                +
              </button>
              <span className="balance" onClick={refreshBalance}>
                ${Number(userData.balance).toFixed(2)}
              </span>
              <div className="tickets-display" onClick={refreshBalance}>
                <span className="tickets-icon">🎟️</span>
                <span className="tickets-count">{userData.tickets}</span>
              </div>
            </div>
            <button 
              className={`hamburger ${menuOpen ? 'hamburger-open' : ''}`} 
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        )}

        {/* Mobile: login/register */}
        {!isAuthenticated && (
          <nav className="nav nav-mobile-auth">
            <Link to="/login" className="nav-btn">Login</Link>
            <Link to="/register" className="nav-btn">Register</Link>
          </nav>
        )}
      </div>

      {/* Mobile dropdown menu */}
      {isAuthenticated && (
        <div className={`mobile-menu ${menuOpen ? 'mobile-menu-open' : ''}`}>
          <Link to="/dashboard" className={`mobile-menu-item ${isActive('/dashboard') ? 'mobile-menu-active' : ''}`}>
            🏠 Dashboard
          </Link>
          <Link to="/lobby" className={`mobile-menu-item ${isActive('/lobby') ? 'mobile-menu-active' : ''}`}>
            🎯 Lobby
          </Link>
          <Link to="/teams" className={`mobile-menu-item ${isActive('/teams') ? 'mobile-menu-active' : ''}`}>
            👥 Teams
          </Link>
          <Link to="/market-mover" className={`mobile-menu-item ${isActive('/market-mover') ? 'mobile-menu-active' : ''}`}>
            📈 Voting
          </Link>
          <Link to="/cosmetics" className={`mobile-menu-item ${isActive('/cosmetics') ? 'mobile-menu-active' : ''}`}>
            ✨ Cosmetics
          </Link>
          {(user?.role === 'admin' || user?.is_admin) && (
            <Link to="/admin" className={`mobile-menu-item ${isActive('/admin') ? 'mobile-menu-active' : ''}`}>
              🛠️ Admin
            </Link>
          )}
          <div className="mobile-menu-divider"></div>
          <div className="mobile-menu-user">
            <span className="mobile-menu-username">{user?.username}</span>
          </div>
          <button onClick={handleLogout} className="mobile-menu-item mobile-menu-logout">
            Logout
          </button>
        </div>
      )}
    </header>
  );
};

export default Header;