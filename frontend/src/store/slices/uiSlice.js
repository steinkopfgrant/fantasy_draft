// frontend/src/store/slices/uiSlice.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  toasts: []
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showToast: (state, action) => {
      const { message, type = 'info' } = action.payload;
      state.toasts.push({
        id: Date.now(),
        message,
        type,
        timestamp: new Date().toISOString()
      });
    },
    removeToast: (state, action) => {
      state.toasts = state.toasts.filter(toast => toast.id !== action.payload);
    },
    clearToasts: (state) => {
      state.toasts = [];
    }
  }
});

export const { showToast, removeToast, clearToasts } = uiSlice.actions;

// Selectors
export const selectToasts = (state) => state.ui.toasts;

export default uiSlice.reducer;