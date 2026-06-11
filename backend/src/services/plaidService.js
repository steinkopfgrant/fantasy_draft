// backend/src/services/plaidService.js
//
// Plaid client wrapper for BidBlitz.
// Sandbox-first: set PLAID_ENV=sandbox. Auth + Identity + Balance are the
// verify-and-link foundation for deposits/withdrawals. (Add 'transfer' to the
// products array later if you want Plaid to move the ACH funds itself.)
//
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');

const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// ---------------------------------------------------------------------------
// SECURITY HOOKS — access_token is a live bank credential.
// In Sandbox these are intentional no-ops so you can build fast. BEFORE
// PRODUCTION, implement real symmetric encryption here (AES-256-GCM with a key
// from your secrets manager / KMS) and the model will store ciphertext.
// ---------------------------------------------------------------------------
function encryptAccessToken(plaintext) {
  // TODO(before production): encrypt with a KMS-held key. e.g. AES-256-GCM.
  return plaintext;
}

function decryptAccessToken(stored) {
  // TODO(before production): mirror encryptAccessToken().
  return stored;
}

// Create a link_token to initialize Plaid Link on the client.
// `userId` ties the Link session to your user (required by Plaid).
async function createLinkToken(userId) {
  const request = {
    user: { client_user_id: String(userId) },
    client_name: 'BidBlitz',
    products: [Products.Auth, Products.Identity], // Balance is queryable without being a link product
    country_codes: [CountryCode.Us],
    language: 'en',
    // webhook: process.env.PLAID_WEBHOOK_URL, // wire this up when you add webhooks
  };

  const response = await plaidClient.linkTokenCreate(request);
  return response.data; // { link_token, expiration, request_id }
}

// Exchange the public_token (from Link onSuccess) for a permanent access_token.
async function exchangePublicToken(publicToken) {
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });
  return response.data; // { access_token, item_id, request_id }
}

// Pull accounts + institution for an access_token, so we can store the funding
// account details (name/mask) and show them to the user.
async function getItemAccounts(accessToken) {
  const accountsResp = await plaidClient.accountsGet({ access_token: accessToken });
  return accountsResp.data; // { accounts: [...], item: {...}, request_id }
}

// Real-time balance check — call this at deposit time to confirm funds.
async function getBalances(accessToken) {
  const resp = await plaidClient.accountsBalanceGet({ access_token: accessToken });
  return resp.data;
}

module.exports = {
  plaidClient,
  PLAID_ENV,
  createLinkToken,
  exchangePublicToken,
  getItemAccounts,
  getBalances,
  encryptAccessToken,
  decryptAccessToken,
};