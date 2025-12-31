// backend/src/controllers/authController.js
const jwt = require('jsonwebtoken');
const userService = require('../services/userService');
const { validationResult } = require('express-validator');
const db = require('../models');
const { User, Transaction } = db;
const bcrypt = require('bcrypt');

const generateToken = (userId, username) => {
    return jwt.sign(
        { userId, username },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
};

const register = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(400).json({ 
                error: errors.array()[0].msg || 'Validation failed',
                errors: errors.array()
            });
        }

        const { username, email, password } = req.body;
        
        // Check if all fields are provided
        if (!username || !email || !password) {
            return res.status(400).json({ 
                error: 'Please provide username, email, and password' 
            });
        }
        
        console.log('Registration attempt:', { username, email });
        
        // Check if user already exists
        const existingUser = await User.findOne({
            where: {
                [db.Sequelize.Op.or]: [{ username }, { email }]
            }
        });

        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(400).json({ error: 'Username already taken. Please choose a different username.' });
            }
            if (existingUser.email === email) {
                return res.status(400).json({ error: 'Email already registered. Please login instead.' });
            }
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create the user with starting balance and tickets
        const user = await User.create({
            username,
            email,
            password: hashedPassword,
            balance: 100.00,  // Give new users $100 starting balance
            tickets: 10,      // Give new users 10 tickets to start
            created_at: new Date(),
            updated_at: new Date()
        });

        console.log(`Created user: ${username} with ID: ${user.id}`);

        // Create welcome bonus transaction
        await Transaction.create({
            user_id: user.id,
            type: 'signup_bonus',
            amount: 100.00,
            balance_after: 100.00,
            description: 'Welcome bonus - Start your fantasy draft journey!',
            created_at: new Date()
        });

        // Generate token
        const token = generateToken(user.id, user.username);
        
        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                balance: 100.00,
                tickets: 10
            },
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle specific database errors
        if (error.name === 'SequelizeUniqueConstraintError') {
            if (error.errors[0].path === 'username') {
                return res.status(400).json({ error: 'Username already taken. Please choose a different username.' });
            }
            if (error.errors[0].path === 'email') {
                return res.status(400).json({ error: 'Email already registered. Please login instead.' });
            }
        }
        
        if (error.message.includes('already exists')) {
            return res.status(400).json({ error: error.message });
        }
        
        res.status(500).json({ error: 'Failed to create user. Please try again.' });
    }
};

const login = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(400).json({ 
                error: errors.array()[0].msg || 'Validation failed',
                errors: errors.array()
            });
        }

        const { username, password } = req.body;
        
        // Check if all fields are provided
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Please provide username and password' 
            });
        }
        
        console.log('Login attempt for username:', username);
        
        const user = await userService.authenticateUser(username, password);
        const token = generateToken(user.id, user.username);
        
        // Get current stats
        const stats = await userService.getUserStats(user.id);
        
        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                balance: parseFloat(user.balance) || 0,
                tickets: parseInt(user.tickets) || 0,
                stats: {
                    contestsEntered: stats.contestsEntered,
                    contestsWon: stats.contestsWon,
                    winRate: stats.winRate
                }
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        
        if (error.message === 'Invalid credentials') {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
};

const getMe = async (req, res) => {
    try {
        const user = await userService.getUserById(req.user.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get current stats
        const stats = await userService.getUserStats(user.id);
        
        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                balance: parseFloat(user.balance) || 0,
                tickets: parseInt(user.tickets) || 0,
                createdAt: user.created_at,
                stats: {
                    contestsEntered: stats.contestsEntered,
                    contestsWon: stats.contestsWon,
                    totalWinnings: stats.totalWinnings,
                    winRate: stats.winRate
                }
            }
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { email } = req.body;
        const userId = req.user.userId;
        
        // For now, only allow email updates
        // Add more fields as needed
        
        const updatedUser = await userService.updateUser(userId, { email });
        
        res.json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email
            }
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

const refreshToken = async (req, res) => {
    try {
        // In a production app, you'd verify a refresh token here
        const user = await userService.getUserById(req.user.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const token = generateToken(user.id, user.username);
        
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username
            }
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
};

// Admin function to give bonus to users
const giveBonus = async (req, res) => {
    try {
        const { userId, amount, reason } = req.body;
        
        // Verify admin (you should add proper admin middleware)
        if (req.user.username !== 'GoVikes' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update user balance
        const newBalance = parseFloat(user.balance) + parseFloat(amount);
        await user.update({ balance: newBalance });
        
        // Create transaction record
        await Transaction.create({
            user_id: userId,
            type: 'admin_bonus',
            amount: parseFloat(amount),
            balance_after: newBalance,
            description: reason || 'Admin bonus',
            created_at: new Date()
        });
        
        res.json({
            success: true,
            message: `Gave $${amount} bonus to ${user.username}`,
            newBalance: newBalance
        });
    } catch (error) {
        console.error('Error giving bonus:', error);
        res.status(500).json({ error: 'Failed to give bonus' });
    }
};

module.exports = {
    register,
    login,
    getMe,
    updateProfile,
    refreshToken,
    giveBonus
};