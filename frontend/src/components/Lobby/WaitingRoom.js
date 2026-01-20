// frontend/src/components/Lobby/WaitingRoom.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import socketService from '../../services/socket';
import './WaitingRoom.css';

const WaitingRoom = ({ roomData, onLeave, isAdmin = false }) => {
  const navigate = useNavigate();
  const [players, setPlayers] = useState(roomData.players || []);
  const [timeWaiting, setTimeWaiting] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  
  const {
    contestId,
    contestName,
    roomId,
    entryId,
    maxPlayers = 5
  } = roomData;
  
  // Debug log to track state
  useEffect(() => {
    console.log('🎮 WaitingRoom State:', {
      roomId: roomData?.roomId,
      currentPlayers: roomData?.currentPlayers,
      maxPlayers: roomData?.maxPlayers,
      playersList: roomData?.players,
      isFull: roomData?.currentPlayers >= 5,
      isAdmin
    });
  }, [roomData, isAdmin]);
  
  // Update players when roomData changes
  useEffect(() => {
    if (roomData?.players) {
      setPlayers(roomData.players);
    }
  }, [roomData?.players]);
  
  // Update time waiting
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeWaiting(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Socket event listeners
  useEffect(() => {
    if (!socketService.isConnected()) return;
    
    const cleanupFunctions = [];
    
    // Player joined the room
    const cleanupPlayerJoined = socketService.on('player-joined', (data) => {
      if (data.roomId === roomId) {
        console.log('Player joined waiting room:', data);
        setPlayers(data.players || []);
      }
    });
    cleanupFunctions.push(cleanupPlayerJoined);
    
    // Player left the room
    const cleanupPlayerLeft = socketService.on('player-left', (data) => {
      if (data.roomId === roomId) {
        console.log('Player left waiting room:', data);
        setPlayers(data.players || []);
      }
    });
    cleanupFunctions.push(cleanupPlayerLeft);
    
    // Waiting room update
    const cleanupWaitingUpdate = socketService.on('waiting-room-update', (data) => {
      if (data.roomId === roomId) {
        console.log('Waiting room update:', data);
        setPlayers(data.players || []);
        
        // Check if room is full
        if (data.roomFull || data.currentPlayers >= 5) {
          console.log('Room is full! Draft should start soon...');
        }
      }
    });
    cleanupFunctions.push(cleanupWaitingUpdate);
    
    // Room player joined (from backend HTTP)
    const cleanupRoomPlayerJoined = socketService.on('room-player-joined', (data) => {
      if (data.roomId === roomId) {
        console.log('Room player joined:', data);
        setPlayers(data.players || []);
      }
    });
    cleanupFunctions.push(cleanupRoomPlayerJoined);
    
    // Draft countdown
    const cleanupDraftCountdown = socketService.on('draft-countdown', (data) => {
      if (data.roomId === roomId) {
        console.log(`Draft starting in ${data.seconds} seconds!`);
      }
    });
    cleanupFunctions.push(cleanupDraftCountdown);
    
    // Draft is starting
    const cleanupDraftStart = socketService.on('draft-start', (data) => {
      if (data.roomId === roomId) {
        console.log('Draft starting!', data);
        navigate(`/draft/${contestId}?room=${roomId}`);
      }
    });
    cleanupFunctions.push(cleanupDraftStart);
    
    // Draft starting (alternate event)
    const cleanupDraftStarting = socketService.on('draft-starting', (data) => {
      if (data.roomId === roomId) {
        console.log('Draft starting (alt)!', data);
        navigate(`/draft/${contestId}?room=${roomId}`);
      }
    });
    cleanupFunctions.push(cleanupDraftStarting);
    
    // Cleanup
    return () => {
      cleanupFunctions.forEach(cleanup => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      });
    };
  }, [roomId, contestId, navigate]);
  
  const handleLeave = async () => {
    if (isLeaving) return;
    
    setIsLeaving(true);
    try {
      await onLeave();
    } catch (error) {
      console.error('Error leaving waiting room:', error);
      setIsLeaving(false);
    }
  };
  
  const handleFillWithBots = async () => {
    if (isFilling) return;
    
    setIsFilling(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `/api/debug/fill-lobby/${contestId}`,
        { includeMe: false },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('Fill lobby response:', response.data);
      // Socket events should update the player list automatically
    } catch (error) {
      console.error('Failed to fill lobby:', error);
      alert('Failed to fill lobby: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsFilling(false);
    }
  };
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const currentPlayerCount = players.length || roomData?.currentPlayers || 0;
  const emptySlots = 5 - currentPlayerCount;
  const progressPercentage = (currentPlayerCount / 5) * 100;
  
  return (
    <div className="waiting-room-container">
      <div className="waiting-room-card">
        <div className="waiting-room-header">
          <h2>Waiting Room</h2>
          <div className="contest-info">
            <span className="contest-name">{contestName}</span>
            <span className="room-id">Room: {roomId}</span>
          </div>
        </div>
        
        <div className="waiting-room-body">
          <div className="progress-section">
            <h3>Players Joined</h3>
            <div className="player-count">
              <span className="current">{currentPlayerCount}</span>
              <span className="separator">/</span>
              <span className="max">5</span>
            </div>
            
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            
            {currentPlayerCount < 5 ? (
              <p className="waiting-text">
                Waiting for {emptySlots} more {emptySlots === 1 ? 'player' : 'players'}...
              </p>
            ) : (
              <p className="starting-message">
                Room is full! Draft will start automatically...
              </p>
            )}
          </div>
          
          <div className="players-section">
            <h3>Players in Room</h3>
            <div className="players-list">
              {players.map((player, index) => (
                <div key={player.id || index} className="player-item">
                  <div className="player-avatar">
                    {player.username?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <span className="player-name">{player.username || 'Unknown'}</span>
                  {index === 0 && <span className="player-badge">Host</span>}
                </div>
              ))}
              
              {/* Empty slots */}
              {Array.from({ length: emptySlots }).map((_, index) => (
                <div key={`empty-${index}`} className="player-item empty">
                  <div className="player-avatar empty">?</div>
                  <span className="player-name">Waiting...</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="time-section">
            <p>Time waiting: <strong>{formatTime(timeWaiting)}</strong></p>
          </div>
        </div>
        
        <div className="waiting-room-footer">
          {/* Admin fill button */}
          {isAdmin && currentPlayerCount < 5 && (
            <button 
              className="fill-button"
              onClick={handleFillWithBots}
              disabled={isFilling}
            >
              {isFilling ? 'Filling...' : `Fill with Bots (${emptySlots} needed)`}
            </button>
          )}
          
          <button 
            className="leave-button"
            onClick={handleLeave}
            disabled={isLeaving || currentPlayerCount === 5}
          >
            {isLeaving ? 'Leaving...' : 'Leave Waiting Room'}
          </button>
          
          {currentPlayerCount === 5 && (
            <p className="starting-message">
              Room is full! Draft will start automatically...
            </p>
          )}
        </div>
      </div>
      
      <div className="waiting-tips">
        <h4>While you wait:</h4>
        <ul>
          <li>Review the contest rules and scoring</li>
          <li>Check out the player pool for this contest</li>
          <li>Plan your draft strategy</li>
          <li>Draft starts automatically when room fills to 5 players</li>
        </ul>
      </div>
    </div>
  );
};

export default WaitingRoom;