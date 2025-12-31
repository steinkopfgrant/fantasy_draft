import express from 'express';
import { getUsers, createUser } from '../controllers/index.js';

const router = express.Router();

// Define routes
router.get('/users', getUsers);
router.post('/users', createUser);

// Export the router
export default router;