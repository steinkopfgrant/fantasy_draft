// frontend/src/store/slices/socketSlice.js
import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import socketService from '../../services/socket';

// Async thunks
export const connectSocket = createAsyncThunk(
  'socket/connect',
  async (token, { dispatch, rejectWithValue }) => {
    try {
      const socket = await socketService.connect(token);
      
      // Set up event listeners that dispatch Redux actions
      socketService.on('authenticated', (data) => {
        dispatch(socketAuthenticated(data));
      });
      
      socketService.on('disconnect', (reason) => {
        dispatch(socketDisconnected({ reason }));
      });
      
      return { socketId: socket.id };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const disconnectSocket = createAsyncThunk(
  'socket/disconnect',
  async (_, { dispatch }) => {
    try {
      socketService.disconnect();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
);

export const joinRoom = createAsyncThunk(
  'socket/joinRoom',
  async ({ roomId, contestId, userId }, { rejectWithValue }) => {
    try {
      return new Promise((resolve, reject) => {
        socketService.emit('join-room', { roomId, contestId, userId });
        
        // Listen for confirmation
        const timeout = setTimeout(() => {
          reject(new Error('Join room timeout'));
        }, 5000);
        
        socketService.once('joined-room', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
        
        socketService.once('room-error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const socketSlice = createSlice({
  name: 'socket',
  initialState: {
    // Connection state
    connected: false,
    connecting: false,
    authenticated: false,
    socketId: null,
    userId: null,
    
    // Room management
    rooms: [],
    activeRoom: null,
    roomStates: {}, // roomId -> room state
    
    // Error handling
    error: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    
    // Event queue for offline mode
    queuedEvents: []
  },
  reducers: {
    // Connection events
    socketAuthenticated: (state, action) => {
      state.authenticated = true;
      state.userId = action.payload.userId || action.payload.user?.id;
      state.error = null;
    },
    
    socketDisconnected: (state, action) => {
      state.connected = false;
      state.authenticated = false;
      state.disconnectReason = action.payload.reason;
      // Don't clear rooms - we might reconnect
    },
    
    // Room management
    roomJoined: (state, action) => {
      const { roomId, roomState } = action.payload;
      if (!state.rooms.includes(roomId)) {
        state.rooms.push(roomId);
      }
      state.activeRoom = roomId;
      if (roomState) {
        state.roomStates[roomId] = roomState;
      }
    },
    
    roomLeft: (state, action) => {
      const { roomId } = action.payload;
      state.rooms = state.rooms.filter(id => id !== roomId);
      delete state.roomStates[roomId];
      if (state.activeRoom === roomId) {
        state.activeRoom = state.rooms[0] || null;
      }
    },
    
    updateRoomState: (state, action) => {
      const { roomId, updates } = action.payload;
      if (state.roomStates[roomId]) {
        state.roomStates[roomId] = {
          ...state.roomStates[roomId],
          ...updates
        };
      }
    },
    
    // Event queuing for offline
    queueEvent: (state, action) => {
      state.queuedEvents.push({
        ...action.payload,
        timestamp: Date.now()
      });
    },
    
    clearEventQueue: (state) => {
      state.queuedEvents = [];
    },
    
    // Error handling
    setSocketError: (state, action) => {
      state.error = action.payload;
    },
    
    incrementReconnectAttempts: (state) => {
      state.reconnectAttempts += 1;
    },
    
    resetReconnectAttempts: (state) => {
      state.reconnectAttempts = 0;
    }
  },
  extraReducers: (builder) => {
    builder
      // Connect socket
      .addCase(connectSocket.pending, (state) => {
        state.connecting = true;
        state.error = null;
      })
      .addCase(connectSocket.fulfilled, (state, action) => {
        state.connecting = false;
        state.connected = true;
        state.socketId = action.payload.socketId;
        state.reconnectAttempts = 0;
      })
      .addCase(connectSocket.rejected, (state, action) => {
        state.connecting = false;
        state.connected = false;
        state.error = action.payload;
      })
      // Disconnect socket
      .addCase(disconnectSocket.fulfilled, (state) => {
        state.connected = false;
        state.authenticated = false;
        state.socketId = null;
        state.reconnectAttempts = 0;
        // Keep rooms data in case we reconnect
      })
      // Join room
      .addCase(joinRoom.fulfilled, (state, action) => {
        // Handled by roomJoined reducer
      })
      .addCase(joinRoom.rejected, (state, action) => {
        state.error = `Failed to join room: ${action.payload}`;
      });
  }
});

export const {
  socketAuthenticated,
  socketDisconnected,
  roomJoined,
  roomLeft,
  updateRoomState,
  queueEvent,
  clearEventQueue,
  setSocketError,
  incrementReconnectAttempts,
  resetReconnectAttempts
} = socketSlice.actions;

// Selectors
const selectSocketState = (state) => state.socket;

export const selectSocketStatus = createSelector(
  [selectSocketState],
  (socket) => ({
    connected: socket.connected,
    authenticated: socket.authenticated,
    connecting: socket.connecting
  })
);

export const selectActiveRoom = (state) => state.socket.activeRoom;
export const selectRoomState = (roomId) => (state) => state.socket.roomStates[roomId];
export const selectIsInRoom = (roomId) => (state) => state.socket.rooms.includes(roomId);

export default socketSlice.reducer;