// frontend/src/store/store.js
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import contestReducer from './slices/contestSlice';
import draftReducer from './slices/draftSlice';
import socketReducer from './slices/socketSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    contest: contestReducer,
    draft: draftReducer,
    socket: socketReducer,
    ui: uiReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore socket instance in state
        ignoredPaths: ['socket.instance'],
        ignoredActions: ['socket/setInstance'],
      },
    }),
});