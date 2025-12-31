// frontend/src/utils/axiosConfig.js
import axios from 'axios';
import { store } from '../store/store';
import { logout } from '../store/slices/authSlice';
import { showToast } from '../store/slices/uiSlice';

// Configure axios defaults
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Add auth token to requests
axios.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Handle response errors
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Unauthorized - logout user
      store.dispatch(logout());
      store.dispatch(showToast({ 
        message: 'Session expired. Please login again.', 
        type: 'error' 
      }));
    } else if (error.response?.status === 500) {
      store.dispatch(showToast({ 
        message: 'Server error. Please try again later.', 
        type: 'error' 
      }));
    }
    return Promise.reject(error);
  }
);