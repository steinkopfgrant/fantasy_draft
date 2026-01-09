// frontend/src/store/slices/contestSlice.js
import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import axios from 'axios';

// Async thunks with cache-busting
export const fetchContests = createAsyncThunk(
  'contest/fetchContests',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get('/api/contests', {
        params: { _t: Date.now() }
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || error.message);
    }
  }
);

export const fetchUserEntries = createAsyncThunk(
  'contest/fetchUserEntries',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get('/api/contests/my-entries', {
        params: { _t: Date.now() }
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || error.message);
    }
  }
);

export const enterContest = createAsyncThunk(
  'contest/enter',
  async ({ contestId, contest }, { dispatch, rejectWithValue }) => {
    try {
      const response = await axios.post(`/api/contests/enter/${contestId}`);
      
      // Optimistically update the contest
      dispatch(updateContest({
        id: contestId,
        currentEntries: (contest.currentEntries || 0) + 1
      }));
      
      return {
        ...response.data,
        contestId,
        contestType: contest.type
      };
    } catch (error) {
      // Revert optimistic update
      dispatch(updateContest({
        id: contestId,
        currentEntries: contest.currentEntries || 0
      }));
      return rejectWithValue(error.response?.data?.error || error.message);
    }
  }
);

export const withdrawFromContest = createAsyncThunk(
  'contest/withdraw',
  async ({ entryId, contestId }, { dispatch, getState, rejectWithValue }) => {
    try {
      const response = await axios.post(`/api/contests/withdraw/${entryId}`);
      
      // Update contest entries count
      const contest = selectContestById(getState(), contestId);
      if (contest) {
        dispatch(updateContest({
          id: contestId,
          currentEntries: Math.max(0, (contest.currentEntries || 0) - 1)
        }));
      }
      
      return { entryId, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || error.message);
    }
  }
);

const contestSlice = createSlice({
  name: 'contest',
  initialState: {
    // Data
    contests: [],
    userEntries: [],
    
    // UI State
    filters: {
      type: 'all',
      status: 'all',
      search: ''
    },
    sortBy: 'created',
    
    // Loading states
    loading: {
      contests: false,
      entries: false,
      entering: null,
      withdrawing: null
    },
    
    // Errors
    errors: {
      contests: null,
      entries: null,
      enter: null,
      withdraw: null
    },
    
    // Metadata
    lastFetch: null,
    stale: false
  },
  reducers: {
    updateContest: (state, action) => {
      const index = state.contests.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.contests[index] = { ...state.contests[index], ...action.payload };
      }
    },
    
    addContest: (state, action) => {
      if (!state.contests.find(c => c.id === action.payload.id)) {
        state.contests.push(action.payload);
      }
    },
    
    removeContest: (state, action) => {
      state.contests = state.contests.filter(c => c.id !== action.payload);
    },
    
    replaceContest: (state, action) => {
      const { oldId, newContest } = action.payload;
      const index = state.contests.findIndex(c => c.id === oldId);
      if (index !== -1) {
        state.contests[index] = newContest;
      }
    },
    
    setFilter: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    
    setSortBy: (state, action) => {
      state.sortBy = action.payload;
    },
    
    clearError: (state, action) => {
      if (action.payload) {
        state.errors[action.payload] = null;
      } else {
        state.errors = {
          contests: null,
          entries: null,
          enter: null,
          withdraw: null
        };
      }
    },
    
    markStale: (state) => {
      state.stale = true;
    },
    
    clearContestData: (state) => {
      state.contests = [];
      state.userEntries = [];
      state.lastFetch = null;
      state.stale = true;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch contests
      .addCase(fetchContests.pending, (state) => {
        state.loading.contests = true;
        state.errors.contests = null;
      })
      .addCase(fetchContests.fulfilled, (state, action) => {
        state.loading.contests = false;
        state.contests = action.payload;
        state.lastFetch = Date.now();
        state.stale = false;
      })
      .addCase(fetchContests.rejected, (state, action) => {
        state.loading.contests = false;
        state.errors.contests = action.payload;
      })
      
      // Fetch user entries
      .addCase(fetchUserEntries.pending, (state) => {
        state.loading.entries = true;
        state.errors.entries = null;
      })
      .addCase(fetchUserEntries.fulfilled, (state, action) => {
        state.loading.entries = false;
        state.userEntries = action.payload;
      })
      .addCase(fetchUserEntries.rejected, (state, action) => {
        state.loading.entries = false;
        state.errors.entries = action.payload;
      })
      
      // Enter contest
      .addCase(enterContest.pending, (state, action) => {
        state.loading.entering = action.meta.arg.contestId;
        state.errors.enter = null;
      })
      .addCase(enterContest.fulfilled, (state, action) => {
        state.loading.entering = null;
        
        const entry = {
          id: action.payload.entry?.id || action.payload.entryId,
          contestId: action.payload.contestId,
          status: 'pending',
          draftRoomId: action.payload.draftRoomId || action.payload.roomId,
          ...action.payload.entry
        };
        
        state.userEntries.push(entry);
      })
      .addCase(enterContest.rejected, (state, action) => {
        state.loading.entering = null;
        state.errors.enter = action.payload;
      })
      
      // Withdraw from contest
      .addCase(withdrawFromContest.pending, (state, action) => {
        state.loading.withdrawing = action.meta.arg.entryId;
        state.errors.withdraw = null;
      })
      .addCase(withdrawFromContest.fulfilled, (state, action) => {
        state.loading.withdrawing = null;
        state.userEntries = state.userEntries.filter(
          e => e.id !== action.payload.entryId
        );
      })
      .addCase(withdrawFromContest.rejected, (state, action) => {
        state.loading.withdrawing = null;
        state.errors.withdraw = action.payload;
      });
  }
});

export const {
  updateContest,
  addContest,
  removeContest,
  replaceContest,
  setFilter,
  setSortBy,
  clearError,
  markStale,
  clearContestData
} = contestSlice.actions;

// Selectors
export const selectContests = (state) => state.contest.contests;
export const selectUserEntries = (state) => state.contest.userEntries;
export const selectContestById = (state, contestId) => 
  state.contest.contests.find(c => c.id === contestId);

export const selectFilteredContests = createSelector(
  [selectContests, selectUserEntries, (state) => state.contest.filters],
  (contests, userEntries, filters) => {
    return contests.filter(contest => {
      if (filters.type !== 'all' && contest.type !== filters.type) {
        return false;
      }
      
      const userEntry = userEntries.find(e => e.contestId === contest.id);
      
      if (filters.status === 'entered' && !userEntry) {
        return false;
      }
      
      if (filters.status === 'open' && (contest.status !== 'open' || userEntry)) {
        return false;
      }
      
      if (filters.search && !contest.name.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }
);

export const selectContestLoading = (state) => state.contest.loading;
export const selectContestErrors = (state) => state.contest.errors;
export const selectIsStale = (state) => state.contest.stale || 
  (Date.now() - state.contest.lastFetch > 60000);

export default contestSlice.reducer;