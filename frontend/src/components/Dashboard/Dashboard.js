// frontend/src/components/Dashboard/Dashboard.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuthUser } from '../../store/slices/authSlice';
import { subscribeToPush, unsubscribeFromPush } from '../../services/pushNotifications';

const Dashboard = ({ showToast }) => {
  const user = useSelector(selectAuthUser);
  const navigate = useNavigate();
  const [notificationStatus, setNotificationStatus] = useState('checking');
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    checkNotificationStatus();
  }, []);

  const checkNotificationStatus = async () => {
    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    // Check if running as standalone PWA
    const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                       window.navigator.standalone === true;

    // iOS requires PWA mode for push notifications
    if (iOS && !standalone) {
      setNotificationStatus('ios-not-standalone');
      return;
    }

    // Check if push notifications are supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotificationStatus('unsupported');
      return;
    }

    // Check permission status
    if (Notification.permission === 'denied') {
      setNotificationStatus('denied');
      return;
    }

    if (Notification.permission === 'granted') {
      // Check if actually subscribed
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setNotificationStatus(subscription ? 'enabled' : 'disabled');
      } catch (error) {
        setNotificationStatus('disabled');
      }
      return;
    }

    setNotificationStatus('disabled');
  };

  const handleEnableNotifications = async () => {
    setIsSubscribing(true);
    try {
      const token = localStorage.getItem('token');
      await subscribeToPush(token);
      setNotificationStatus('enabled');
      if (showToast) {
        showToast('Notifications enabled! You\'ll be notified when drafts start.', 'success');
      }
    } catch (error) {
      console.error('Failed to enable notifications:', error);
      if (error.message.includes('denied')) {
        setNotificationStatus('denied');
        if (showToast) {
          showToast('Notification permission denied. Please enable in browser settings.', 'error');
        }
      } else {
        if (showToast) {
          showToast('Failed to enable notifications: ' + error.message, 'error');
        }
      }
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleDisableNotifications = async () => {
    setIsSubscribing(true);
    try {
      const token = localStorage.getItem('token');
      await unsubscribeFromPush(token);
      setNotificationStatus('disabled');
      if (showToast) {
        showToast('Notifications disabled.', 'info');
      }
    } catch (error) {
      console.error('Failed to disable notifications:', error);
    } finally {
      setIsSubscribing(false);
    }
  };

  const getNotificationContent = () => {
    if (notificationStatus === 'checking') {
      return {
        icon: '⏳',
        title: 'Checking...',
        description: 'Checking notification status...',
        button: null
      };
    }

    if (notificationStatus === 'unsupported') {
      return {
        icon: '❌',
        title: 'Not Supported',
        description: 'Push notifications are not supported on this browser.',
        button: null
      };
    }

    if (notificationStatus === 'ios-not-standalone') {
      return {
        icon: '📱',
        title: 'Add to Home Screen',
        description: 'To enable notifications on iOS, add BidBlitz to your home screen first. Tap the share button (□↑) and select "Add to Home Screen".',
        button: null
      };
    }

    if (notificationStatus === 'denied') {
      return {
        icon: '🚫',
        title: 'Blocked',
        description: 'Notifications are blocked. Please enable them in your browser settings.',
        button: null
      };
    }

    if (notificationStatus === 'enabled') {
      return {
        icon: '🔔',
        title: 'Enabled',
        description: 'You\'ll receive notifications when drafts start and when it\'s your turn.',
        button: {
          text: 'Disable Notifications',
          action: handleDisableNotifications,
          style: 'secondary'
        }
      };
    }

    // disabled
    return {
      icon: '🔕',
      title: 'Disabled',
      description: 'Enable notifications to know when your draft starts and when it\'s your turn to pick.',
      button: {
        text: 'Enable Notifications',
        action: handleEnableNotifications,
        style: 'primary'
      }
    };
  };

  const notifContent = getNotificationContent();

  // Admin panel navigation function
  const handleAdminClick = () => {
    console.log('Navigating to admin panel with user:', user?.username);
    navigate('/admin');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: '#00d4ff', marginBottom: '2rem' }}>
        Dashboard
      </h1>
      <p style={{ fontSize: '1.2rem', marginBottom: '3rem', color: '#8892b0' }}>
        Welcome back, {user?.username || 'Player'}!
      </p>
      
      <div style={{ 
        display: 'grid', 
        gap: '2rem', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        marginBottom: '3rem'
      }}>
        {/* User Stats Card */}
        <div style={{ 
          padding: '2rem', 
          background: '#1a1f2e',
          border: '2px solid #2a2f3e', 
          borderRadius: '16px' 
        }}>
          <h3 style={{ color: '#00d4ff', marginBottom: '1.5rem' }}>Your Stats</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8892b0' }}>Balance:</span>
              <span style={{ color: '#44ff44', fontWeight: 'bold', fontSize: '1.2rem' }}>
                ${user?.balance || 0}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8892b0' }}>Tickets:</span>
              <span style={{ color: '#ffaa44', fontWeight: 'bold', fontSize: '1.2rem' }}>
                {user?.tickets || 0} 🎟️
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8892b0' }}>Total Contests:</span>
              <span style={{ color: '#ffffff' }}>{user?.total_contests_entered || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8892b0' }}>Wins:</span>
              <span style={{ color: '#ffffff' }}>{user?.total_contests_won || 0}</span>
            </div>
          </div>
        </div>
        
        {/* Notifications Card */}
        <div style={{ 
          padding: '2rem', 
          background: notificationStatus === 'enabled' 
            ? 'linear-gradient(135deg, rgba(68, 255, 68, 0.1) 0%, rgba(0, 212, 255, 0.1) 100%)'
            : 'linear-gradient(135deg, rgba(255, 170, 68, 0.1) 0%, rgba(255, 107, 107, 0.1) 100%)',
          border: `2px solid ${notificationStatus === 'enabled' ? '#44ff44' : '#ffaa44'}`, 
          borderRadius: '16px'
        }}>
          <h3 style={{ color: '#00d4ff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {notifContent.icon} Notifications
          </h3>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            marginBottom: '1rem' 
          }}>
            <span style={{ 
              fontSize: '0.9rem',
              color: notificationStatus === 'enabled' ? '#44ff44' : '#ffaa44',
              fontWeight: 'bold'
            }}>
              {notifContent.title}
            </span>
          </div>
          
          <p style={{ 
            color: '#8892b0', 
            fontSize: '0.9rem',
            marginBottom: '1.5rem',
            lineHeight: '1.5'
          }}>
            {notifContent.description}
          </p>
          
          {notifContent.button && (
            <button
              onClick={notifContent.button.action}
              disabled={isSubscribing}
              style={{ 
                width: '100%',
                padding: '0.75rem 1rem',
                background: notifContent.button.style === 'primary' 
                  ? '#00d4ff'
                  : '#2a2f3e',
                color: notifContent.button.style === 'primary' 
                  ? '#0a0e1b'
                  : '#8892b0',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                cursor: isSubscribing ? 'not-allowed' : 'pointer',
                opacity: isSubscribing ? 0.7 : 1,
                transition: 'all 0.3s'
              }}
            >
              {isSubscribing ? 'Processing...' : notifContent.button.text}
            </button>
          )}
        </div>
        
        {/* Quick Actions Card */}
        <div style={{ 
          padding: '2rem', 
          background: '#1a1f2e',
          border: '2px solid #2a2f3e', 
          borderRadius: '16px' 
        }}>
          <h3 style={{ color: '#00d4ff', marginBottom: '1.5rem' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Link to="/lobby" style={{ textDecoration: 'none' }}>
              <button style={{ 
                width: '100%',
                padding: '1rem',
                background: '#44ff44',
                color: '#0a0e1b',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}>
                🎯 View Contests
              </button>
            </Link>
            
            <button 
              onClick={() => navigate('/rules')}
              style={{ 
                width: '100%',
                padding: '1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            >
              📋 Rules & Scoring
            </button>
            
            {/* Support & Help Button */}
            <button 
              onClick={() => navigate('/support')}
              style={{ 
                width: '100%',
                padding: '1rem',
                background: 'linear-gradient(135deg, #00d4ff 0%, #667eea 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: '0 2px 10px rgba(0, 212, 255, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.target.style.boxShadow = '0 4px 20px rgba(0, 212, 255, 0.5)';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.boxShadow = '0 2px 10px rgba(0, 212, 255, 0.3)';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              💬 Support & FAQ
            </button>
            
            {/* PLAYER POOLS BUTTON */}
            <button 
              onClick={() => navigate('/pools')}
              style={{ 
                width: '100%',
                padding: '1rem',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.target.style.boxShadow = '0 4px 20px rgba(245, 158, 11, 0.5)';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.boxShadow = '0 2px 10px rgba(245, 158, 11, 0.3)';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              🎱 Player Pools
            </button>

            {/* COSMETICS BUTTON */}
            <button 
              onClick={() => navigate('/cosmetics')}
              style={{ 
                width: '100%',
                padding: '1rem',
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: '0 2px 10px rgba(168, 85, 247, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.target.style.boxShadow = '0 4px 20px rgba(168, 85, 247, 0.5)';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.boxShadow = '0 2px 10px rgba(168, 85, 247, 0.3)';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              ✨ Cosmetics
            </button>
            
            {/* ADMIN PANEL BUTTON - Only shows for specific user */}
            {user?.username === 'aaaaaa' && (
              <button 
                onClick={handleAdminClick}
                style={{ 
                  width: '100%',
                  padding: '1rem',
                  background: 'linear-gradient(45deg, #ff6b6b, #ff8e53)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  boxShadow: '0 2px 10px rgba(255, 107, 107, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.boxShadow = '0 4px 20px rgba(255, 107, 107, 0.5)';
                  e.target.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.boxShadow = '0 2px 10px rgba(255, 107, 107, 0.3)';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                🛠️ Admin Panel
              </button>
            )}
            
            <Link to="/profile" style={{ textDecoration: 'none' }}>
              <button style={{ 
                width: '100%',
                padding: '1rem',
                background: '#2a2f3e',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}>
                ⚙️ Edit Profile
              </button>
            </Link>
          </div>
        </div>
      </div>
      
      {/* Recent Activity Section */}
      <div style={{ 
        padding: '2rem', 
        background: '#1a1f2e',
        border: '2px solid #2a2f3e', 
        borderRadius: '16px',
        marginBottom: '2rem'
      }}>
        <h3 style={{ color: '#00d4ff', marginBottom: '1.5rem' }}>Recent Activity</h3>
        <p style={{ color: '#8892b0' }}>
          No recent activity. Join a contest to get started!
        </p>
        
        {/* Placeholder for recent contests, votes, etc. */}
        <div style={{ marginTop: '1rem' }}>
          <Link 
            to="/lobby" 
            style={{ 
              color: '#00d4ff', 
              textDecoration: 'none',
              fontSize: '1rem',
              fontWeight: '500'
            }}
          >
            → Browse Available Contests
          </Link>
        </div>
      </div>

      {/* Legal Links Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem 1.5rem',
        padding: '1.5rem 0',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        <Link to="/terms" style={{ color: '#8892b0', textDecoration: 'none', fontSize: '0.85rem' }}>
          Terms of Service
        </Link>
        <Link to="/privacy" style={{ color: '#8892b0', textDecoration: 'none', fontSize: '0.85rem' }}>
          Privacy Policy
        </Link>
        <Link to="/responsible-gaming" style={{ color: '#8892b0', textDecoration: 'none', fontSize: '0.85rem' }}>
          Responsible Gaming
        </Link>
        <Link to="/support" style={{ color: '#8892b0', textDecoration: 'none', fontSize: '0.85rem' }}>
          Support
        </Link>
      </div>

      {/* Floating Admin Button - Only for specific user */}
      {user?.username === 'aaaaaa' && (
        <button 
          onClick={handleAdminClick}
          style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            padding: '15px 25px',
            background: 'linear-gradient(45deg, #ff6b6b, #ff8e53)',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(255, 107, 107, 0.4)',
            transition: 'all 0.3s',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 30px rgba(255, 107, 107, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 107, 107, 0.4)';
          }}
        >
          🛠️ Admin Panel
        </button>
      )}
    </div>
  );
};

export default Dashboard;