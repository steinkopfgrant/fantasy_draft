// frontend/src/services/auth.js
export const checkAuth = async () => {
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId');
  
  if (!token || !userId) {
    return null;
  }

  try {
    const response = await fetch(`${process.env.REACT_APP_API_URL}/api/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const userData = await response.json();
      return userData;
    }
  } catch (error) {
    console.error('Auth check failed:', error);
  }

  return null;
};