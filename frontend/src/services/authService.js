// frontend/src/services/authService.js
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const login = async (username, password) => {
  try {
    console.log('=== FRONTEND LOGIN ATTEMPT ===');
    console.log('Username:', username);
    console.log('Timestamp:', new Date().toISOString());
    
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // CRITICAL: STORE THE TOKEN AND USER DATA!
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Debug logging
      console.log('✅ Login successful for:', username);
      console.log('User ID:', data.user.id || data.user.userId);
      console.log('Token stored (first 20 chars):', data.token.substring(0, 20));
      console.log('Verification - Token in storage:', localStorage.getItem('token').substring(0, 20));
      console.log('Verification - User in storage:', localStorage.getItem('user'));
    } else {
      console.error('❌ No token received from server!');
    }

    return data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

export const register = async (username, email, password) => {
  try {
    console.log('=== FRONTEND REGISTER ATTEMPT ===');
    console.log('Username:', username);
    
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    // STORE TOKEN AFTER REGISTRATION TOO!
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      console.log('✅ Registration successful for:', username);
      console.log('Token stored (first 20 chars):', data.token.substring(0, 20));
    }

    return data;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

export const getMe = async () => {
  try {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    console.log('=== GET ME ===');
    console.log('Token exists:', !!token);
    console.log('Stored user:', storedUser);
    
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // If unauthorized, clear storage
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      throw new Error(data.error || 'Failed to get user data');
    }

    return data;
  } catch (error) {
    console.error('Get user error:', error);
    throw error;
  }
};

export const updateProfile = async (updates) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update profile');
    }

    // Update stored user data
    if (data.user) {
      localStorage.setItem('user', JSON.stringify(data.user));
    }

    return data;
  } catch (error) {
    console.error('Update profile error:', error);
    throw error;
  }
};

export const logout = () => {
  console.log('=== LOGOUT ===');
  console.log('Clearing storage for user:', JSON.parse(localStorage.getItem('user') || '{}').username);
  
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.clear();
};

// Debug helper function
export const debugAuth = () => {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  console.log('=== AUTH DEBUG ===');
  console.log('Token exists:', !!token);
  console.log('Token (first 20):', token ? token.substring(0, 20) : 'NO TOKEN');
  console.log('User:', user);
  
  if (token) {
    // Decode token without verification (for debug only)
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      console.log('Token payload:', payload);
    } catch (e) {
      console.log('Could not decode token');
    }
  }
  
  return { token, user: user ? JSON.parse(user) : null };
};