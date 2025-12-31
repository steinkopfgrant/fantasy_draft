import axios from 'axios';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL + '/api' : 'http://localhost:5000/api', // Adjust the base URL as needed
});

// Example API call to get data
export const fetchData = async (endpoint) => {
    try {
        const response = await api.get(endpoint);
        return response.data;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
};

// Example API call to post data
export const postData = async (endpoint, data) => {
    try {
        const response = await api.post(endpoint, data);
        return response.data;
    } catch (error) {
        console.error('Error posting data:', error);
        throw error;
    }
};

// Add more API functions as needed

export default {
    fetchData,
    postData,
};