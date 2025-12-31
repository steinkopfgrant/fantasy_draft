// backend/src/services/draftPickQueue.js
class DraftPickQueue {
  constructor() {
    this.queues = new Map(); // roomId -> queue
    this.processing = new Map(); // roomId -> isProcessing
  }

  async processPick(roomId, pickData, callback) {
    // Initialize queue for room if needed
    if (!this.queues.has(roomId)) {
      this.queues.set(roomId, []);
      this.processing.set(roomId, false);
    }

    // Add to queue
    return new Promise((resolve, reject) => {
      this.queues.get(roomId).push({
        pickData,
        callback,
        resolve,
        reject,
        timestamp: Date.now()
      });

      // Start processing if not already
      if (!this.processing.get(roomId)) {
        this.processQueue(roomId);
      }
    });
  }

  async processQueue(roomId) {
    const queue = this.queues.get(roomId);
    if (!queue || queue.length === 0) {
      this.processing.set(roomId, false);
      return;
    }

    this.processing.set(roomId, true);

    while (queue.length > 0) {
      const item = queue.shift();
      
      try {
        // Process the pick
        const result = await item.callback(item.pickData);
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }

      // Small delay to ensure state consistency
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.processing.set(roomId, false);
  }

  clearRoom(roomId) {
    this.queues.delete(roomId);
    this.processing.delete(roomId);
  }
}

module.exports = new DraftPickQueue();

// In your socket handler:
const draftPickQueue = require('./draftPickQueue');

socket.on('make-pick', async (data) => {
  const roomId = socket.roomId;
  
  try {
    const result = await draftPickQueue.processPick(roomId, data, async (pickData) => {
      // Validate pick
      const draft = draftManager.getDraft(roomId);
      if (!draft) throw new Error('Draft not found');
      
      // Check state version
      if (pickData.stateVersion < draft.stateVersion) {
        throw new Error('Outdated state - please refresh');
      }
      
      // Check if it's user's turn
      const currentDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
      if (socket.draftPosition !== currentDrafterPosition) {
        throw new Error('Not your turn');
      }
      
      // Check if player is available
      const player = draft.board[pickData.row][pickData.col];
      if (player.drafted) {
        throw new Error('Player already drafted');
      }
      
      // Make the pick
      draft.board[pickData.row][pickData.col].drafted = true;
      draft.board[pickData.row][pickData.col].draftedBy = socket.draftPosition;
      draft.state.currentTurn++;
      draft.stateVersion++;
      
      // Emit to all clients
      io.to(roomId).emit('player-picked', {
        ...pickData,
        roomId,
        success: true,
        stateVersion: draft.stateVersion
      });
      
      // Send fresh state to all
      io.to(roomId).emit('draft-state', {
        ...draft,
        roomId,
        stateVersion: draft.stateVersion
      });
      
      return { success: true };
    });
    
    // Send success to picker
    socket.emit('pick-attempt-result', { success: true });
    
  } catch (error) {
    // Send failure to picker
    socket.emit('pick-attempt-result', { 
      success: false, 
      message: error.message 
    });
  }
});