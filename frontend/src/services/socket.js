// frontend/src/services/socket.js
import io from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.eventEmitter = null; // Will be set by middleware
    this.connected = false;
    this.authenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.listeners = new Map();
    this.oneTimeListeners = new Map();
    this.connectionPromise = null;
    this.authToken = null;
    this.eventQueue = [];
    this.rooms = new Set();
    this.config = {
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      autoConnect: true
    };
  }

  // Set event emitter for decoupled communication
  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
  }

  connect(token, options = {}) {
    // Store token for reconnection attempts
    this.authToken = token;
    
    // Merge options with defaults
    const config = { ...this.config, ...options };
    
    // If already connected and authenticated, return immediately
    if (this.socket?.connected && this.authenticated) {
      console.log('✅ Already connected and authenticated');
      return Promise.resolve({
        socket: this.socket,
        socketId: this.socket.id,
        authenticated: true
      });
    }

    // If connection is in progress, return existing promise
    if (this.connectionPromise) {
      console.log('🔌 Connection already in progress...');
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      console.log('🔌 Initiating socket connection...');
      
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      
      // Disconnect any existing socket first
      if (this.socket) {
        this.disconnect();
      }

      // Create socket with authentication token
      this.socket = io(API_URL, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: config.reconnectionDelay,
        reconnectionDelayMax: config.reconnectionDelayMax,
        reconnectionAttempts: this.maxReconnectAttempts,
        timeout: config.timeout,
        transports: ['websocket', 'polling'],
        autoConnect: config.autoConnect
      });

      const connectionTimeout = setTimeout(() => {
        this.connectionPromise = null;
        this.emitEvent('socket:timeout', { 
          message: 'Connection timeout',
          attempts: this.reconnectAttempts 
        });
        reject(new Error('Socket connection timeout'));
      }, 15000);

      // Connection success handler
      const handleConnect = () => {
        console.log('✅ Socket connected:', this.socket.id);
        const wasReconnect = this.connected; // Track if this is a reconnection
        this.connected = true;
        this.reconnectAttempts = 0;
        clearTimeout(connectionTimeout);
        
        this.emitEvent('socket:connected', { 
          socketId: this.socket.id,
          reconnected: wasReconnect
        });
        
        // Set up persistent handlers after connection
        this.setupCoreHandlers();
        
        // Only register listeners on first connection
        // Socket.io preserves listeners through reconnections automatically
        if (!wasReconnect) {
          this.reregisterListeners();
        }
        
        // Rejoin rooms
        this.rejoinRooms();
        
        // CRITICAL FIX: Send authenticate event to backend after connection!
        console.log('🔐 Sending authentication to backend...');
        this.socket.emit('authenticate', { token: this.authToken });
      };

      // Authentication success handler
      const handleAuthenticated = (data) => {
        console.log('✅ Socket authenticated:', data);
        this.authenticated = true;
        this.connectionPromise = null;
        
        this.emitEvent('socket:authenticated', {
          userId: data.user?.id || data.userId,
          username: data.user?.username,
          socketId: this.socket.id
        });
        
        // Process queued events
        this.processEventQueue();
        
        resolve({
          socket: this.socket,
          socketId: this.socket.id,
          authenticated: true,
          user: data.user
        });
      };

      // Authentication error handler
      const handleAuthError = (error) => {
        console.error('❌ Socket authentication failed:', error);
        this.authenticated = false;
        this.connectionPromise = null;
        clearTimeout(connectionTimeout);
        
        this.emitEvent('socket:authError', {
          error: error.message || 'Authentication failed',
          code: error.code
        });
        
        reject(new Error(error.message || 'Authentication failed'));
      };

      // Connection error handler
      const handleConnectError = (error) => {
        console.error('❌ Socket connection error:', error.message);
        
        // Only reject if we haven't connected yet
        if (!this.connected && connectionTimeout) {
          clearTimeout(connectionTimeout);
          this.connectionPromise = null;
          
          this.emitEvent('socket:connectError', {
            error: error.message,
            type: error.type,
            attempts: this.reconnectAttempts
          });
          
          reject(error);
        }
      };

      // Register one-time event handlers
      this.socket.once('connect', handleConnect);
      this.socket.once('authenticated', handleAuthenticated);
      this.socket.once('auth-error', handleAuthError);
      this.socket.on('connect_error', handleConnectError);
    });

    return this.connectionPromise;
  }

  setupCoreHandlers() {
    if (!this.socket) return;

    // Remove existing core handlers to prevent duplicates
    const coreEvents = [
      'disconnect', 
      'reconnect', 
      'reconnect_attempt', 
      'reconnect_error',
      'reconnect_failed',
      'error'
    ];
    
    coreEvents.forEach(event => this.socket.removeAllListeners(event));
    
    // Disconnect handler
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      this.connected = false;
      this.authenticated = false;
      
      this.emitEvent('socket:disconnected', { 
        reason,
        wasAuthenticated: this.authenticated
      });
      
      // Clear connection promise so reconnection can work
      this.connectionPromise = null;
      
      // Handle different disconnect reasons
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, might need manual reconnection
        console.log('Server disconnected the socket');
        this.handleServerDisconnect();
      }
    });

    // Reconnection handlers
    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`✅ Reconnected after ${attemptNumber} attempts`);
      this.connected = true;
      this.reconnectAttempts = 0;
      
      this.emitEvent('socket:reconnected', { 
        attempts: attemptNumber,
        socketId: this.socket.id
      });
      
      // CRITICAL FIX: Re-authenticate after reconnection!
      console.log('🔐 Re-authenticating after reconnection...');
      this.socket.emit('authenticate', { token: this.authToken });
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
      this.reconnectAttempts = attemptNumber;
      
      this.emitEvent('socket:reconnectAttempt', { 
        attempt: attemptNumber,
        maxAttempts: this.maxReconnectAttempts
      });
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('❌ Reconnection error:', error.message);
      
      this.emitEvent('socket:reconnectError', { 
        error: error.message,
        attempt: this.reconnectAttempts
      });
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ Failed to reconnect after maximum attempts');
      
      this.emitEvent('socket:reconnectFailed', { 
        attempts: this.maxReconnectAttempts
      });
    });

    // General error handler
    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      
      // Check if it's an authentication error
      if (this.isAuthError(error)) {
        this.handleAuthenticationError();
      } else {
        this.emitEvent('socket:error', { 
          error: error.message || 'Unknown error',
          type: error.type,
          code: error.code
        });
      }
    });

    // Development logging
    if (process.env.NODE_ENV === 'development') {
      this.socket.onAny((event, ...args) => {
        if (!event.startsWith('pong') && !event.startsWith('ping')) {
          console.log(`📨 Socket event: ${event}`, args);
        }
      });
    }
  }

  emit(event, data, options = {}) {
    const { volatile = false, compress = true, timeout = 5000, skipQueue = false } = options;
    
    if (this.socket && this.connected && this.authenticated) {
      console.log(`📤 Emitting: ${event}`, data);
      
      let emitter = this.socket;
      
      if (volatile) emitter = emitter.volatile;
      if (compress) emitter = emitter.compress(compress);
      if (timeout) emitter = emitter.timeout(timeout);
      
      return new Promise((resolve, reject) => {
        emitter.emit(event, data, (response) => {
          if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
    } else {
      // If skipQueue is true, just resolve immediately without queueing
      if (skipQueue) {
        console.warn(`Socket not connected for event: ${event} (skipping queue)`);
        return Promise.resolve();
      }
      
      console.warn(`⏳ Socket not connected, queueing event: ${event}`);
      
      // Queue the event
      this.eventQueue.push({ event, data, options, timestamp: Date.now() });
      
      // Emit queued event for UI feedback
      this.emitEvent('socket:eventQueued', { 
        event, 
        queueLength: this.eventQueue.length 
      });
      
      // Return a pending promise that will be resolved when connection is established
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.connected && this.authenticated) {
            clearInterval(checkInterval);
            this.emit(event, data, options).then(resolve).catch(reject);
          }
        }, 100);
        
        // Timeout after 5 seconds instead of 30 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Socket connection timeout - event not sent'));
        }, timeout || 5000);
      });
    }
  }

  on(event, callback, context = null) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    const listener = context ? callback.bind(context) : callback;
    this.listeners.get(event).add(listener);
    
    if (this.socket) {
      this.socket.on(event, listener);
    }
    
    return () => this.off(event, listener);
  }

  once(event, callback, context = null) {
    const listener = context ? callback.bind(context) : callback;
    
    if (!this.oneTimeListeners.has(event)) {
      this.oneTimeListeners.set(event, new Set());
    }
    
    this.oneTimeListeners.get(event).add(listener);
    
    if (this.socket) {
      this.socket.once(event, listener);
    }
    
    return () => {
      const listeners = this.oneTimeListeners.get(event);
      if (listeners) {
        listeners.delete(listener);
      }
    };
  }

  off(event, callback) {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
        
        const listeners = this.listeners.get(event);
        if (listeners) {
          listeners.delete(callback);
          if (listeners.size === 0) {
            this.listeners.delete(event);
          }
        }
      } else {
        // Remove all listeners for this event
        this.socket.off(event);
        this.listeners.delete(event);
      }
    }
  }

  // Add a method to wait for connection
  async waitForConnection(timeout = 10000) {
    if (this.connected && this.authenticated) {
      return true;
    }
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkConnection = () => {
        if (this.connected && this.authenticated) {
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Connection timeout'));
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      
      checkConnection();
    });
  }

  // Room management with tracking
  joinRoom(roomId, data = {}) {
    this.rooms.add(roomId);
    return this.emit('join-room', { roomId, ...data });
  }

  leaveRoom(roomId, data = {}) {
    this.rooms.delete(roomId);
    return this.emit('leave-room', { roomId, ...data });
  }

  // Draft specific methods
  joinDraft(contestId, entryId, data = {}) {
    return this.emit('join-draft', { contestId, entryId, ...data });
  }

  leaveDraft(contestId, entryId, data = {}) {
    return this.emit('leave-draft', { contestId, entryId, ...data });
  }

  makePick(pickData) {
    return this.emit('make-pick', pickData, { timeout: 5000 });
  }

  skipTurn(reason = 'no_budget') {
    return this.emit('skip-turn', { reason }, { timeout: 5000 });
  }

  // Utility methods
  isConnected() {
    return this.connected && this.socket?.connected;
  }

  isAuthenticated() {
    return this.authenticated;
  }

  getSocket() {
    return this.socket;
  }

  getSocketId() {
    return this.socket?.id || null;
  }

  getConnectionState() {
    return {
      connected: this.connected,
      authenticated: this.authenticated,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id,
      rooms: Array.from(this.rooms),
      queuedEvents: this.eventQueue.length
    };
  }

  // Private helper methods
  emitEvent(event, data) {
    if (this.eventEmitter) {
      this.eventEmitter(event, data);
    }
  }

  isAuthError(error) {
    return error.message === 'Not authenticated' || 
           error.type === 'UnauthorizedError' || 
           error.message === 'Authentication required' ||
           error.code === 'invalid_token';
  }

  handleAuthenticationError() {
    console.log('🔐 Handling authentication error...');
    
    if (this.authToken) {
      console.log('Attempting re-authentication with stored token');
      this.socket.emit('authenticate', { token: this.authToken });
    } else {
      const token = localStorage.getItem('token');
      if (token) {
        console.log('Attempting re-authentication with localStorage token');
        this.authToken = token;
        this.socket.emit('authenticate', { token });
      } else {
        console.error('No token available for authentication');
        this.emitEvent('socket:authRequired', {
          message: 'Authentication required'
        });
      }
    }
  }

  handleServerDisconnect() {
    // Attempt manual reconnection after server disconnect
    setTimeout(() => {
      if (!this.connected && this.authToken) {
        console.log('Attempting manual reconnection...');
        this.connect(this.authToken);
      }
    }, 2000);
  }

  reregisterListeners() {
    // Re-register all stored listeners
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket.on(event, callback);
      });
    });
    
    // Re-register one-time listeners
    this.oneTimeListeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket.once(event, callback);
      });
    });
  }

  rejoinRooms() {
    // Rejoin all rooms we were in
    this.rooms.forEach(roomId => {
      console.log(`📍 Rejoining room: ${roomId}`);
      this.emit('join-room', { roomId, rejoin: true });
    });
  }

  processEventQueue() {
    if (this.eventQueue.length === 0) return;
    
    console.log(`📤 Processing ${this.eventQueue.length} queued events`);
    
    const queue = [...this.eventQueue];
    this.eventQueue = [];
    
    // Process events with a small delay between each
    queue.forEach((item, index) => {
      setTimeout(() => {
        // Only emit if event is not too old (5 minutes)
        if (Date.now() - item.timestamp < 300000) {
          this.emit(item.event, item.data, item.options)
            .catch(error => {
              console.error(`Failed to emit queued event ${item.event}:`, error);
            });
        }
      }, index * 100);
    });
  }

  // Manual authentication method
  authenticate(token) {
    if (!token) {
      token = this.authToken || localStorage.getItem('token');
    }
    
    if (token && this.socket && this.connected) {
      console.log('🔐 Manually authenticating socket...');
      this.authToken = token;
      this.socket.emit('authenticate', { token });
      return true;
    }
    
    console.warn('Cannot authenticate: no token or socket not connected');
    return false;
  }

  // Complete cleanup
  disconnect() {
    console.log('🧹 Disconnecting socket service');
    
    // Clear all listeners
    if (this.socket) {
      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach(callback => {
          this.socket.off(event, callback);
        });
      });
      
      this.oneTimeListeners.forEach((callbacks, event) => {
        callbacks.forEach(callback => {
          this.socket.off(event, callback);
        });
      });
      
      // Remove core handlers
      this.socket.removeAllListeners();
      
      // Disconnect
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Clear all stored data
    this.listeners.clear();
    this.oneTimeListeners.clear();
    this.rooms.clear();
    this.eventQueue = [];
    
    // Reset state
    this.connected = false;
    this.authenticated = false;
    this.connectionPromise = null;
    this.authToken = null;
    this.reconnectAttempts = 0;
    
    // Emit final event
    this.emitEvent('socket:disconnected', { 
      reason: 'manual',
      wasAuthenticated: this.authenticated 
    });
  }

  // Get queue status
  getQueueStatus() {
    return {
      size: this.eventQueue.length,
      events: this.eventQueue.map(item => ({
        event: item.event,
        age: Date.now() - item.timestamp
      }))
    };
  }

  // Clear event queue
  clearEventQueue() {
    const count = this.eventQueue.length;
    this.eventQueue = [];
    return count;
  }
}

// Create singleton instance
const socketService = new SocketService();

// Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    socketService.disconnect();
  });
  
  // Handle page visibility for better reconnection
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !socketService.isConnected() && socketService.authToken) {
      console.log('Page visible, checking connection...');
      setTimeout(() => {
        if (!socketService.isConnected()) {
          socketService.connect(socketService.authToken);
        }
      }, 1000);
    }
  });
}

export default socketService;