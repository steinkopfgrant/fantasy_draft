// frontend/src/services/auth.js
export const checkAuth = async () => {
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId');
  
  if (!token || !userId) {
    return null;
  }

  try {
    const response = await fetch(`http://localhost:5000/api/users/${userId}`, {
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