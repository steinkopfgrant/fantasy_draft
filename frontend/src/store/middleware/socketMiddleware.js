// frontend/src/store/middleware/socketMiddleware.js
import socketService from '../../services/socket';
import { 
  setSocketStatus,
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
} from '../slices/socketSlice';
import { 
  updateContest, 
  addContest, 
  replaceContest,
  markStale 
} from '../slices/contestSlice';
import { 
  updateDraftState,
  setDraftStatus,
  addPick,
  setPlayerBoard,
  setCurrentTurn,
  setCountdown,
  setMyTurn,
  updateTimer
} from '../slices/draftSlice';
import { showToast } from '../slices/uiSlice';

// Socket event type constants
const SOCKET_EVENTS = {
  // Internal events (from socket service)
  CONNECTED: 'socket:connected',
  DISCONNECTED: 'socket:disconnected',
  AUTHENTICATED: 'socket:authenticated',
  AUTH_ERROR: 'socket:authError',
  RECONNECTED: 'socket:reconnected',
  RECONNECT_ATTEMPT: 'socket:reconnectAttempt',
  RECONNECT_ERROR: 'socket:reconnectError',
  RECONNECT_FAILED: 'socket:reconnectFailed',
  CONNECT_ERROR: 'socket:connectError',
  ERROR: 'socket:error',
  TIMEOUT: 'socket:timeout',
  EVENT_QUEUED: 'socket:eventQueued',
  AUTH_REQUIRED: 'socket:authRequired',
  
  // Server events
  CONTEST_UPDATED: 'contest-updated',
  CONTEST_CREATED: 'contest-created',
  JOINED_ROOM: 'joined-room',
  LEFT_ROOM: 'left-room',
  ROOM_STATE: 'room-state',
  USER_JOINED: 'user-joined',
  USER_LEFT: 'user-left',
  DRAFT_STARTING: 'draft-starting',
  COUNTDOWN_STARTED: 'countdown-started',
  COUNTDOWN_UPDATE: 'countdown-update',
  DRAFT_STARTED: 'draft-started',
  TURN_UPDATE: 'turn-update',
  TIMER_UPDATE: 'timer-update',
  PICK_MADE: 'pick-made',
  DRAFT_COMPLETED: 'draft-completed',
  DRAFT_STATE_UPDATE: 'draft-state-update',
  ACTIVE_DRAFT: 'active-draft',
  SERVER_ERROR: 'error'
};

// Action type constants
const SOCKET_ACTIONS = {
  CONNECT: 'socket/connect',
  DISCONNECT: 'socket/disconnect',
  EMIT: 'socket/emit',
  RECONNECT: 'socket/reconnect',
  INITIALIZE: 'socket/initialize'
};

// Track initialization globally to prevent duplicate handlers
let middlewareInitialized = false;
let registeredHandlers = new Set();

const socketMiddleware = (store) => {
  let eventHandlers = null;

  // Set up the event emitter for the socket service (only once)
  if (!middlewareInitialized) {
    socketService.setEventEmitter((event, data) => {
      // Dispatch internal socket events to Redux
      handleSocketServiceEvent(store, event, data);
    });
  }

  return (next) => (action) => {
    // Initialize socket event handlers only once globally
    if (!middlewareInitialized) {
      middlewareInitialized = true;
      
      // Clean up any existing handlers first
      registeredHandlers.forEach(event => {
        socketService.off(event);
      });
      registeredHandlers.clear();
      
      // Create and register event handlers
      eventHandlers = createSocketEventHandlers(store);
      registerSocketEventHandlers(eventHandlers);
      
      console.log('Socket middleware initialized with event handlers');
    }

    // Handle socket-related actions
    switch (action.type) {
      // Socket connection actions
      case SOCKET_ACTIONS.CONNECT:
      case 'auth/login/fulfilled':
      case 'auth/checkAuth/fulfilled': {
        const token = action.payload?.token || localStorage.getItem('token');
        if (token && !socketService.isConnected()) {
          handleSocketConnect(store, token);
        }
        break;
      }

      // Socket disconnection
      case SOCKET_ACTIONS.DISCONNECT:
      case 'auth/logout': {
        handleSocketDisconnect(store);
        break;
      }

      // Socket emit
      case SOCKET_ACTIONS.EMIT: {
        handleSocketEmit(store, action.payload);
        break;
      }

      // Draft navigation
      case 'draft/navigateToRoom': {
        const { roomId } = action.payload;
        if (roomId) {
          // Store draft data in session storage for navigation
          sessionStorage.setItem('currentDraft', JSON.stringify(action.payload));
          
          // Navigate to draft (this should be handled by a saga or component)
          window.location.href = `/draft/${roomId}`;
        }
        break;
      }

      // Active draft found
      case 'draft/activeDraftFound': {
        const { draftRoomId, contestName } = action.payload;
        const confirmRejoin = window.confirm(
          `You have an active draft in ${contestName}. Would you like to rejoin?`
        );
        
        if (confirmRejoin) {
          sessionStorage.setItem('currentDraft', JSON.stringify(action.payload));
          window.location.href = `/draft/${draftRoomId}`;
        }
        break;
      }

      // Contest entry success - join socket room
      case 'contest/enter/fulfilled': {
        const { draftRoomId, roomId, contestId } = action.payload;
        const actualRoomId = draftRoomId || roomId;
        if (actualRoomId) {
          socketService.joinRoom(actualRoomId, { contestId });
        }
        break;
      }

      // Contest withdrawal - leave socket room
      case 'contest/withdraw/fulfilled': {
        const { roomId } = action.payload;
        if (roomId) {
          socketService.leaveRoom(roomId);
        }
        break;
      }
    }

    // Pass action to next middleware
    const result = next(action);

    // Post-action processing
    if (action.type === SOCKET_ACTIONS.CONNECT && store.getState().socket.queuedEvents.length > 0) {
      processQueuedEvents(store);
    }

    return result;
  };
};

// Handle internal events from socket service
function handleSocketServiceEvent(store, event, data) {
  const dispatch = store.dispatch;

  switch (event) {
    case SOCKET_EVENTS.CONNECTED:
      dispatch(setSocketStatus({ 
        connected: true, 
        connecting: false,
        socketId: data.socketId,
        error: null
      }));
      
      if (data.reconnected) {
        dispatch(showToast({ 
          message: 'Reconnected to server', 
          type: 'info' 
        }));
      }
      break;

    case SOCKET_EVENTS.DISCONNECTED:
      dispatch(socketDisconnected(data));
      
      if (data.wasAuthenticated) {
        dispatch(showToast({ 
          message: 'Connection lost. Attempting to reconnect...', 
          type: 'warning' 
        }));
      }
      break;

    case SOCKET_EVENTS.AUTHENTICATED:
      dispatch(socketAuthenticated(data));
      dispatch(resetReconnectAttempts());
      break;

    case SOCKET_EVENTS.AUTH_ERROR:
      dispatch(setSocketError(data.error));
      dispatch(showToast({ 
        message: data.error || 'Authentication failed', 
        type: 'error' 
      }));
      break;

    case SOCKET_EVENTS.RECONNECTED:
      dispatch(setSocketStatus({ 
        connected: true, 
        connecting: false,
        reconnectAttempts: 0
      }));
      dispatch(showToast({ 
        message: 'Successfully reconnected', 
        type: 'success' 
      }));
      break;

    case SOCKET_EVENTS.RECONNECT_ATTEMPT:
      dispatch(incrementReconnectAttempts());
      
      // Show toast every 3 attempts
      if (data.attempt % 3 === 0) {
        dispatch(showToast({ 
          message: `Reconnecting... (${data.attempt}/${data.maxAttempts})`, 
          type: 'info' 
        }));
      }
      break;

    case SOCKET_EVENTS.RECONNECT_FAILED:
      dispatch(setSocketError('Failed to reconnect after maximum attempts'));
      dispatch(showToast({ 
        message: 'Connection failed. Please refresh the page.', 
        type: 'error',
        duration: 0 // Don't auto-dismiss
      }));
      break;

    case SOCKET_EVENTS.EVENT_QUEUED:
      // Silently queue - toast already shown by middleware
      break;

    case SOCKET_EVENTS.AUTH_REQUIRED:
      dispatch(showToast({ 
        message: 'Please log in again', 
        type: 'error' 
      }));
      // Dispatch logout action
      dispatch({ type: 'auth/logout' });
      break;

    default:
      console.warn(`Unhandled socket service event: ${event}`, data);
  }
}

// Handle socket connection
async function handleSocketConnect(store, token) {
  const dispatch = store.dispatch;
  
  dispatch(setSocketStatus({ 
    connecting: true, 
    error: null 
  }));

  try {
    const result = await socketService.connect(token);
    console.log('Socket connection established:', result);
  } catch (error) {
    console.error('Socket connection failed:', error);
    dispatch(setSocketError(error.message));
    dispatch(showToast({ 
      message: 'Failed to connect to game server', 
      type: 'error' 
    }));
  }
}

// Handle socket disconnection
function handleSocketDisconnect(store) {
  socketService.disconnect();
  store.dispatch(setSocketStatus({ 
    connected: false, 
    authenticated: false,
    socketId: null
  }));
}

// Handle socket emit
function handleSocketEmit(store, { event, data, options }) {
  const state = store.getState();
  
  if (!state.socket.connected) {
    // Queue the event
    store.dispatch(queueEvent({ event, data }));
    store.dispatch(showToast({ 
      message: 'Action queued - will retry when connected', 
      type: 'warning' 
    }));
    return;
  }

  socketService.emit(event, data, options)
    .catch(error => {
      console.error(`Failed to emit ${event}:`, error);
      store.dispatch(showToast({ 
        message: `Action failed: ${error.message}`, 
        type: 'error' 
      }));
    });
}

// Process queued events
function processQueuedEvents(store) {
  const state = store.getState();
  const events = state.socket.queuedEvents;
  
  if (events.length === 0) return;
  
  console.log(`Processing ${events.length} queued events`);
  
  events.forEach(({ event, data }, index) => {
    setTimeout(() => {
      socketService.emit(event, data)
        .catch(error => {
          console.error(`Failed to emit queued event ${event}:`, error);
        });
    }, index * 100);
  });
  
  store.dispatch(clearEventQueue());
  store.dispatch(showToast({ 
    message: `Processing ${events.length} queued actions`, 
    type: 'info' 
  }));
}

// Register socket event handlers
function registerSocketEventHandlers(handlers) {
  Object.entries(handlers).forEach(([event, handler]) => {
    // Only register if not already registered
    if (!registeredHandlers.has(event)) {
      socketService.on(event, handler);
      registeredHandlers.add(event);
    }
  });
}

// Create socket event handlers
function createSocketEventHandlers(store) {
  const dispatch = store.dispatch;

  return {
    // Contest events
    [SOCKET_EVENTS.CONTEST_UPDATED]: (data) => {
      dispatch(updateContest(data.contest));
    },

    [SOCKET_EVENTS.CONTEST_CREATED]: (data) => {
      if (data.replacedContestId) {
        dispatch(replaceContest({
          oldId: data.replacedContestId,
          newContest: data.contest
        }));
      } else {
        dispatch(addContest(data.contest));
      }
      
      if (data.message) {
        dispatch(showToast({ 
          message: data.message, 
          type: 'info' 
        }));
      }
    },

    // Room events
    [SOCKET_EVENTS.JOINED_ROOM]: (data) => {
      dispatch(roomJoined(data));
      
      if (data.message) {
        dispatch(showToast({ 
          message: data.message, 
          type: 'success' 
        }));
      }
    },

    [SOCKET_EVENTS.LEFT_ROOM]: (data) => {
      dispatch(roomLeft(data));
    },

    [SOCKET_EVENTS.ROOM_STATE]: (data) => {
      dispatch(updateRoomState({
        roomId: data.roomId,
        updates: data
      }));
    },

    [SOCKET_EVENTS.USER_JOINED]: (data) => {
      dispatch(updateRoomState({
        roomId: data.roomId,
        updates: { 
          currentPlayers: data.currentPlayers,
          users: data.users 
        }
      }));
      
      if (data.username) {
        dispatch(showToast({ 
          message: `${data.username} joined the room`, 
          type: 'info' 
        }));
      }
    },

    [SOCKET_EVENTS.USER_LEFT]: (data) => {
      dispatch(updateRoomState({
        roomId: data.roomId,
        updates: { 
          currentPlayers: data.currentPlayers,
          users: data.users 
        }
      }));
      
      if (data.username) {
        dispatch(showToast({ 
          message: `${data.username} left the room`, 
          type: 'info' 
        }));
      }
    },

    // Draft events
    [SOCKET_EVENTS.DRAFT_STARTING]: (data) => {
      console.log('🚀 Draft starting event:', data);
      dispatch(setDraftStatus('starting'));
      dispatch(updateDraftState({
        roomId: data.roomId,
        contestId: data.contestId,
        contestType: data.contestType,
        participants: data.participants
      }));
      
      dispatch(showToast({ 
        message: 'Draft is starting! Get ready...', 
        type: 'success' 
      }));
      
      // Navigate to draft room
      dispatch({ type: 'draft/navigateToRoom', payload: data });
    },

    [SOCKET_EVENTS.COUNTDOWN_STARTED]: (data) => {
      dispatch(setDraftStatus('countdown'));
      dispatch(setCountdown(data.seconds));
      dispatch(updateDraftState({
        users: data.users,
        draftOrder: data.draftOrder,
        teams: data.teams
      }));
    },

    [SOCKET_EVENTS.COUNTDOWN_UPDATE]: (data) => {
      dispatch(setCountdown(data.seconds));
    },

    [SOCKET_EVENTS.DRAFT_STARTED]: (data) => {
      dispatch(setDraftStatus('active'));
      dispatch(setPlayerBoard(data.playerBoard));
      dispatch(updateDraftState({
        users: data.users,
        draftOrder: data.draftOrder,
        teams: data.teams,
        currentTurn: 0,
        currentPickNumber: 1
      }));
      
      dispatch(showToast({ 
        message: 'Draft has begun!', 
        type: 'success' 
      }));
    },

    [SOCKET_EVENTS.DRAFT_STATE_UPDATE]: (data) => {
      dispatch(updateDraftState(data));
    },

    [SOCKET_EVENTS.TURN_UPDATE]: (data) => {
      dispatch(setCurrentTurn(data));
      
      const state = store.getState();
      const isMyTurn = data.currentDrafterPosition === state.draft.userDraftPosition;
      
      dispatch(setMyTurn(isMyTurn));
      
      if (isMyTurn) {
        dispatch(showToast({ 
          message: "It's your turn to pick!", 
          type: 'info' 
        }));
      }
    },

    [SOCKET_EVENTS.TIMER_UPDATE]: (time) => {
      dispatch(updateTimer(time));
    },

    [SOCKET_EVENTS.PICK_MADE]: (data) => {
      dispatch(addPick(data));
      
      if (data.username && data.player) {
        dispatch(showToast({ 
          message: `${data.username} drafted ${data.player.name}`, 
          type: 'info' 
        }));
      }
    },

    [SOCKET_EVENTS.DRAFT_COMPLETED]: (data) => {
      dispatch(setDraftStatus('completed'));
      dispatch(updateDraftState({ 
        results: data.results,
        finalStandings: data.standings
      }));
      
      dispatch(showToast({ 
        message: 'Draft completed! View your results...', 
        type: 'success' 
      }));
    },

    // Error events
    [SOCKET_EVENTS.SERVER_ERROR]: (error) => {
      console.error('Server error:', error);
      
      const message = error.message || error.error || 'An error occurred';
      dispatch(showToast({ 
        message, 
        type: 'error' 
      }));
      
      // Handle specific error types
      if (error.code === 'DRAFT_NOT_FOUND') {
        dispatch(setDraftStatus('error'));
      }
    },

    // Active draft check
    [SOCKET_EVENTS.ACTIVE_DRAFT]: (data) => {
      if (data.draftRoomId && data.status === 'drafting') {
        dispatch({ type: 'draft/activeDraftFound', payload: data });
      }
    }
  };
}

// Export for testing
export { createSocketEventHandlers, SOCKET_EVENTS, SOCKET_ACTIONS };

export default socketMiddleware;