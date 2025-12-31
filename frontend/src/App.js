import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store/store';
import { checkAuth, selectAuthUser, selectIsAuthenticated, selectAuthLoading } from './store/slices/authSlice';
import { connectSocket, disconnectSocket } from './store/slices/socketSlice';
import socketService from './services/socket';
import './utils/axiosConfig';
import './App.css';

// Import components
import Header from './components/Header/Header';
import LandingPage from './components/Landing/LandingPage';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import Dashboard from './components/Dashboard/Dashboard';
import LobbyScreen from './components/Lobby/LobbyScreen';
import DraftScreen from './components/Draft/DraftScreen';
import ProfileScreen from './components/Profile/ProfileScreen';
import TeamsPage from './components/Teams/TeamsPage';
import AdminPanel from './components/Admin/AdminPanel';
import SettlementPanel from './components/Admin/SettlementPanel';
import ToastContainer from './components/Toast/ToastContainer';
import MarketMoverPage from './components/MarketMover/MarketMoverPage';

// Helper to check if user is admin (handles both role and is_admin flag)
const isUserAdmin = (user) => {
  return user?.role === 'admin' || user?.is_admin === true || user?.isAdmin === true;
};

// Protected Route Component - FIXED to wait for auth loading
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const user = useSelector(selectAuthUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const loading = useSelector(selectAuthLoading);
  
  console.log('🔐 ProtectedRoute Check:', {
    path: window.location.pathname,
    isAuthenticated,
    loading,
    requireAdmin,
    userRole: user?.role,
    isAdmin: user?.is_admin,
    username: user?.username
  });
  
  // WAIT for auth check to complete before making any decisions
  if (loading) {
    console.log('⏳ Auth still loading, showing spinner...');
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '50vh',
        color: '#8892b0'
      }}>
        <div className="spinner"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    console.log('❌ Not authenticated, redirecting to login');
    return <Navigate to="/login" />;
  }
  
  // Check admin using helper function (supports both role and is_admin)
  if (requireAdmin && !isUserAdmin(user)) {
    console.log('❌ Admin required but user is not admin, redirecting to dashboard');
    return <Navigate to="/dashboard" />;
  }
  
  console.log('✅ Protected route access granted');
  return children;
};

// Public Route Component (redirects to dashboard if authenticated)
const PublicRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const loading = useSelector(selectAuthLoading);
  
  // Wait for auth check before redirecting
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '50vh',
        color: '#8892b0'
      }}>
        <div className="spinner"></div>
      </div>
    );
  }
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" />;
  }
  
  return children;
};

// App Content Component (uses Redux hooks)
const AppContent = () => {
  const dispatch = useDispatch();
  const loading = useSelector(selectAuthLoading);
  const user = useSelector(selectAuthUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  // Log current route
  useEffect(() => {
    console.log('📍 Current Route:', window.location.pathname);
    console.log('👤 Current User:', user?.username, 'Role:', user?.role, 'isAdmin:', user?.is_admin);
  });

  // Check authentication on mount
  useEffect(() => {
    dispatch(checkAuth());
  }, [dispatch]);

  // Socket connection management
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (isAuthenticated && user && token) {
      console.log('🔌 Initializing socket connection for user:', user.username);
      
      // Connect socket with Redux action
      dispatch(connectSocket(token));
      
      // Set up socket event emitter for Redux integration
      socketService.setEventEmitter((event, data) => {
        // Handle socket events that should update Redux state
        switch (event) {
          case 'socket:connected':
            break;
          case 'socket:authenticated':
            break;
          case 'socket:disconnected':
            break;
          case 'socket:reconnected':
            break;
          case 'socket:error':
            console.error('❌ Socket error:', data);
            break;
          case 'socket:authError':
            console.error('🔐 Socket authentication error:', data);
            break;
          default:
            break;
        }
      });
    } else if (!isAuthenticated && socketService.isConnected()) {
      console.log('🔌 Disconnecting socket - user logged out');
      dispatch(disconnectSocket());
    }
    
    // Cleanup on unmount
    return () => {
      if (socketService.isConnected()) {
        console.log('🔌 App unmounting - disconnecting socket');
        socketService.disconnect();
      }
    };
  }, [isAuthenticated, user, dispatch]);

  // Simple toast function for AdminPanel
  const showToast = (message, type = 'info') => {
    console.log(`Toast: ${type} - ${message}`);
  };

  console.log('🎯 RENDERING ROUTES - Current path:', window.location.pathname, 'Loading:', loading);

  return (
    <Router>
      <div className="App">
        <Header />
        
        <main className="main-content">
          {console.log('📋 ROUTES MOUNTING - User:', user?.username, 'Loading:', loading)}
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            
            <Route path="/login" element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } />
            
            <Route path="/register" element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            } />
            
            {/* Admin routes */}
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute requireAdmin>
                  <AdminPanel user={user} showToast={showToast} />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/admin/settlement" 
              element={
                <ProtectedRoute requireAdmin>
                  <SettlementPanel />
                </ProtectedRoute>
              } 
            />
            
            {/* Protected routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            
            <Route path="/lobby" element={
              <ProtectedRoute>
                <LobbyScreen />
              </ProtectedRoute>
            } />
            
            <Route path="/draft/:roomId" element={
              <ProtectedRoute>
                <DraftScreen />
              </ProtectedRoute>
            } />
            
            <Route path="/profile" element={
              <ProtectedRoute>
                <ProfileScreen />
              </ProtectedRoute>
            } />

            <Route path="/teams" element={
              <ProtectedRoute>
                <TeamsPage />
              </ProtectedRoute>
            } />

            {/* MarketMover route */}
            <Route path="/market-mover" element={
              <ProtectedRoute>
                <MarketMoverPage />
              </ProtectedRoute>
            } />
            
            {/* 404 route */}
            <Route path="*" element={
              <div className="not-found">
                <h1>404 - Page Not Found</h1>
                <p>The page you're looking for doesn't exist.</p>
                <a href="/">Go Home</a>
              </div>
            } />
          </Routes>
        </main>
        
        {/* Toast notifications */}
        <ToastContainer />
      </div>
    </Router>
  );
};

// Main App Component with Provider
function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

export default App;