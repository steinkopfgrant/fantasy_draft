// backend/src/routes/plaidRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../models');
const plaidService = require('../services/plaidService');

// POST /api/plaid/link-token
// Frontend calls this first; returns a link_token used to open Plaid Link.
router.post('/link-token', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const data = await plaidService.createLinkToken(userId);
    res.json({ success: true, link_token: data.link_token, expiration: data.expiration });
  } catch (error) {
    console.error('Error creating Plaid link token:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to create link token' });
  }
});

// POST /api/plaid/exchange
// Frontend posts the public_token from Link's onSuccess. We exchange it for a
// permanent access_token, fetch account details, and persist a PlaidItem.
router.post('/exchange', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { public_token } = req.body;

    if (!public_token) {
      return res.status(400).json({ success: false, error: 'public_token is required' });
    }

    // 1. Exchange for access_token + item_id
    const { access_token, item_id } = await plaidService.exchangePublicToken(public_token);

    // 2. Pull account + institution detail for display / funding selection
    let institutionId = null;
    let institutionName = null;
    let account = null;
    try {
      const acctData = await plaidService.getItemAccounts(access_token);
      institutionId = acctData.item?.institution_id || null;
      // Prefer a depository (checking/savings) account for funding
      account = (acctData.accounts || []).find(a => a.type === 'depository')
                || (acctData.accounts || [])[0]
                || null;
    } catch (acctErr) {
      console.error('Plaid accountsGet failed (continuing, will backfill later):', acctErr.response?.data || acctErr.message);
    }

    // 3. Persist. access_token passes through encrypt hook (no-op in sandbox).
    const item = await db.PlaidItem.create({
      user_id: userId,
      item_id,
      access_token: plaidService.encryptAccessToken(access_token),
      institution_id: institutionId,
      institution_name: institutionName,
      account_id: account?.account_id || null,
      account_mask: account?.mask || null,
      account_name: account?.name || null,
      account_subtype: account?.subtype || null,
      status: 'active'
    });

    res.json({
      success: true,
      item: {
        id: item.id,
        institutionName: item.institution_name,
        accountMask: item.account_mask,
        accountName: item.account_name,
        status: item.status
      }
    });
  } catch (error) {
    console.error('Error exchanging Plaid public token:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to link bank account' });
  }
});

// GET /api/plaid/items
// List the user's linked banks (never returns access_token).
router.get('/items', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const items = await db.PlaidItem.findAll({
      where: { user_id: userId, status: 'active' },
      attributes: ['id', 'institution_name', 'account_name', 'account_mask', 'account_subtype', 'status', 'created_at'],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, items });
  } catch (error) {
    console.error('Error listing Plaid items:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list linked accounts' });
  }
});

// GET /api/plaid/items/:id/balance
// Real-time balance check for a linked account (call at deposit time).
router.get('/items/:id/balance', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const item = await db.PlaidItem.findOne({
      where: { id: req.params.id, user_id: userId, status: 'active' }
    });
    if (!item) {
      return res.status(404).json({ success: false, error: 'Linked account not found' });
    }
    const accessToken = plaidService.decryptAccessToken(item.access_token);
    const data = await plaidService.getBalances(accessToken);
    res.json({ success: true, accounts: data.accounts });
  } catch (error) {
    console.error('Error fetching Plaid balance:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch balance' });
  }
});

module.exports = router;