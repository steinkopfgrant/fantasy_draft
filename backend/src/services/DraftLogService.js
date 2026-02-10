// backend/src/services/DraftLogService.js
// Immutable audit trail for all draft events - for dispute resolution

const { DraftLog } = require('../models');

class DraftLogService {
  
  /**
   * Log when a draft room is created and board is generated
   * @param {string} contestId
   * @param {Array} board - The player board
   * @param {Array} participants - Array of { userId, username }
   */
  static async logDraftStarted(contestId, board, participants) {
    try {
      await DraftLog.create({
        contest_id: contestId,
        event_type: 'draft_started',
        board_snapshot: board,
        draft_order_snapshot: participants.map((p, index) => ({
          position: index + 1,
          userId: p.userId,
          username: p.username || 'Unknown'
        }))
      });
      console.log(`📝 Draft log: draft_started for contest ${contestId}`);
    } catch (error) {
      console.error('Error logging draft start:', error);
      // Don't throw - logging should not break the draft
    }
  }

  /**
   * Log when board is generated (can be separate from draft start)
   */
  static async logBoardGenerated(contestId, board) {
    try {
      await DraftLog.create({
        contest_id: contestId,
        event_type: 'board_generated',
        board_snapshot: board
      });
      console.log(`📝 Draft log: board_generated for contest ${contestId}`);
    } catch (error) {
      console.error('Error logging board generated:', error);
    }
  }

  /**
   * Log a player pick
   */
  static async logPick({ 
    contestId, 
    userId, 
    username, 
    pickNumber, 
    turnNumber,
    player, 
    row, 
    col, 
    rosterAfterPick,
    timeRemaining,
    wasAutoPick = false,
    ipAddress = null 
  }) {
    try {
      await DraftLog.create({
        contest_id: contestId,
        event_type: wasAutoPick ? 'auto_pick' : 'pick',
        user_id: userId,
        username: username,
        pick_number: pickNumber,
        turn_number: turnNumber,
        player_name: player?.name,
        player_team: player?.team,
        player_position: player?.position || player?.originalPosition,
        player_price: player?.price,
        board_row: row,
        board_col: col,
        roster_snapshot: rosterAfterPick,
        time_remaining: timeRemaining,
        was_auto_pick: wasAutoPick,
        ip_address: ipAddress
      });
      console.log(`📝 Draft log: ${wasAutoPick ? 'auto_pick' : 'pick'} - ${username} picked ${player?.name} ($${player?.price})`);
    } catch (error) {
      console.error('Error logging pick:', error);
    }
  }

  /**
   * Log a skip (timeout or no valid picks)
   */
  static async logSkip({ 
    contestId, 
    userId, 
    username, 
    pickNumber,
    turnNumber,
    reason,
    timeRemaining,
    ipAddress = null 
  }) {
    try {
      await DraftLog.create({
        contest_id: contestId,
        event_type: 'skip',
        user_id: userId,
        username: username,
        pick_number: pickNumber,
        turn_number: turnNumber,
        time_remaining: timeRemaining,
        ip_address: ipAddress
      });
      console.log(`📝 Draft log: skip - ${username} skipped (${reason})`);
    } catch (error) {
      console.error('Error logging skip:', error);
    }
  }

  /**
   * Log draft completion with final rosters
   * @param {string} contestId
   * @param {Array} finalRosters - Array of { userId, username, roster, totalSpent }
   */
  static async logDraftComplete(contestId, finalRosters) {
    try {
      await DraftLog.create({
        contest_id: contestId,
        event_type: 'draft_complete',
        roster_snapshot: finalRosters
      });
      console.log(`📝 Draft log: draft_complete for contest ${contestId}`);
    } catch (error) {
      console.error('Error logging draft complete:', error);
    }
  }

  /**
   * Retrieve full draft history for a contest (for disputes)
   */
  static async getDraftHistory(contestId) {
    try {
      const logs = await DraftLog.findAll({
        where: { contest_id: contestId },
        order: [['pick_number', 'ASC'], ['created_at', 'ASC']]
      });
      return logs;
    } catch (error) {
      console.error('Error retrieving draft history:', error);
      throw error;
    }
  }

  /**
   * Get initial board state for a contest
   */
  static async getInitialBoard(contestId) {
    try {
      const log = await DraftLog.findOne({
        where: { 
          contest_id: contestId,
          event_type: ['draft_started', 'board_generated']
        },
        order: [['created_at', 'ASC']]
      });
      return log?.board_snapshot || null;
    } catch (error) {
      console.error('Error retrieving initial board:', error);
      throw error;
    }
  }

  /**
   * Get all picks for a specific user in a contest
   */
  static async getUserPicks(contestId, userId) {
    try {
      const logs = await DraftLog.findAll({
        where: { 
          contest_id: contestId,
          user_id: userId,
          event_type: ['pick', 'auto_pick', 'skip']
        },
        order: [['pick_number', 'ASC']]
      });
      return logs;
    } catch (error) {
      console.error('Error retrieving user picks:', error);
      throw error;
    }
  }

  /**
   * Get final rosters from draft completion
   */
  static async getFinalRosters(contestId) {
    try {
      const log = await DraftLog.findOne({
        where: { 
          contest_id: contestId,
          event_type: 'draft_complete'
        }
      });
      return log?.roster_snapshot || null;
    } catch (error) {
      console.error('Error retrieving final rosters:', error);
      throw error;
    }
  }

  /**
   * Generate a human-readable draft recap
   */
  static async generateDraftRecap(contestId) {
    try {
      const logs = await this.getDraftHistory(contestId);
      
      const recap = {
        contestId,
        totalPicks: 0,
        totalSkips: 0,
        autoPicks: 0,
        draftOrder: null,
        initialBoard: null,
        picks: [],
        finalRosters: null
      };

      for (const log of logs) {
        switch (log.event_type) {
          case 'draft_started':
            recap.draftOrder = log.draft_order_snapshot;
            recap.initialBoard = log.board_snapshot;
            break;
          case 'board_generated':
            if (!recap.initialBoard) {
              recap.initialBoard = log.board_snapshot;
            }
            break;
          case 'pick':
            recap.totalPicks++;
            recap.picks.push({
              pickNumber: log.pick_number,
              username: log.username,
              player: `${log.player_name} (${log.player_position}) $${log.player_price}`,
              position: `Row ${log.board_row}, Col ${log.board_col}`,
              timeRemaining: log.time_remaining,
              timestamp: log.created_at
            });
            break;
          case 'auto_pick':
            recap.totalPicks++;
            recap.autoPicks++;
            recap.picks.push({
              pickNumber: log.pick_number,
              username: log.username,
              player: `${log.player_name} (${log.player_position}) $${log.player_price}`,
              position: `Row ${log.board_row}, Col ${log.board_col}`,
              wasAutoPick: true,
              timestamp: log.created_at
            });
            break;
          case 'skip':
            recap.totalSkips++;
            recap.picks.push({
              pickNumber: log.pick_number,
              username: log.username,
              action: 'SKIPPED',
              timestamp: log.created_at
            });
            break;
          case 'draft_complete':
            recap.finalRosters = log.roster_snapshot;
            break;
        }
      }

      return recap;
    } catch (error) {
      console.error('Error generating draft recap:', error);
      throw error;
    }
  }
}

module.exports = DraftLogService;