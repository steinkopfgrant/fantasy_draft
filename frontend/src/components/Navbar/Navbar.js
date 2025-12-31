// frontend/src/components/Navbar/Navbar.js
import React from 'react';
import './Navbar.css';

const Navbar = ({ user, onLogout, onNavigate, currentView }) => {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <button 
          className="navbar-logo"
          onClick={() => onNavigate('home')}
        >
          Fantasy Draft
        </button>

        <div className="navbar-menu">
          {user ? (
            <>
              <button 
                className={`navbar-link ${currentView === 'lobby' ? 'active' : ''}`}
                onClick={() => onNavigate('lobby')}
              >
                Lobby
              </button>
              <button 
                className={`navbar-link ${currentView === 'my-contests' ? 'active' : ''}`}
                onClick={() => onNavigate('my-contests')}
              >
                My Contests
              </button>
              <button 
                className={`navbar-link ${currentView === 'ticket-shop' ? 'active' : ''}`}
                onClick={() => onNavigate('ticket-shop')}
              >
                Ticket Shop
              </button>
              <div className="navbar-user">
                <span className="navbar-username">{user.username}</span>
                <span className="navbar-balance">${user.balance?.toFixed(2) || '0.00'}</span>
                <span className="navbar-tickets">{user.tickets || 0} 🎟️</span>
                <button onClick={onLogout} className="navbar-logout">
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <button 
                className="navbar-link"
                onClick={() => onNavigate('login')}
              >
                Login
              </button>
              <button 
                className="navbar-link navbar-register"
                onClick={() => onNavigate('login')}
              >
                Register
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;