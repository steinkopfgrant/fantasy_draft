// frontend/src/components/Draft/DraftEntry.js - Update the socket handling
import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import socketService from '../../services/socket';

const DraftEntry = ({ user }) => {
  const { contestId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Don't disconnect the socket when entering draft
    // Just join the draft room
    if (user && contestId) {
      // Make sure socket is connected
      if (!socketService.isConnected()) {
        const token = localStorage.getItem('token');
        if (token) {
          socketService.connect(token);
        }
      }

      // Join the draft room after ensuring connection
      setTimeout(() => {
        socketService.emit('join-draft', {
          contestId,
          userId: user.id
        });
      }, 100);
    }

    // Cleanup - leave room but don't disconnect
    return () => {
      if (contestId) {
        socketService.emit('leave-draft', {
          contestId,
          userId: user?.id
        });
      }
      // DON'T disconnect socket here
    };
  }, [contestId, user]);

  // Rest of your component...
};