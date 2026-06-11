// transferService.js
// -----------------------------------------------------------------------------
// Plaid Transfer money-movement layer for BidBlitz.
//
// Design: event-sourced. Plaid's TRANSFER_EVENTS_UPDATE webhook carries NO detail
// (only "something changed"), so we never trust a single API response for state.
// We drain /transfer/event/sync and project each event onto the local transfer
// record + the player ledger. Idempotent throughout — safe to re-run.
//
// Assumes `plaidClient` is the configured PlaidApi instance from plaidService.js.
// -----------------------------------------------------------------------------

const { plaidClient } = require('./plaidService');
const { randomUUID } = require('crypto');

// === Storage ================================================================
// FOR TESTING this points at the in-memory store so you can watch it work.
// BEFORE LAUNCH: swap this one line for your real Postgres-backed store.
const { repo, ledger } = require('./transferStorePostgres');

// =============================================================================
// DEPOSITS  (type: 'debit' — pull funds FROM the player's bank into BidBlitz)
// =============================================================================
async function createDeposit({ userId, accessToken, accountId, amount, legalName, network = 'ach' }) {
  const idempotencyKey = randomUUID();

  // RfP-primary routing goes here once Plaid confirms coverage + your approval.
  // RfP pay-ins are irreversible -> safe to credit + clear immediately.
  // Until then, ACH debit is the universal path; return risk handled below.

  // 1) Authorize — Plaid runs risk checks here (Signal too, if enabled).
  const auth = (await plaidClient.transferAuthorizationCreate({
    access_token: accessToken,
    account_id: accountId,
    type: 'debit',
    network,                 // 'ach' | 'same-day-ach' | (rtp/RfP once enabled)
    amount,                  // decimal string e.g. '25.00'
    ach_class: 'web',        // internet-initiated consumer debit
    user: { legal_name: legalName },
    idempotency_key: idempotencyKey,
  })).data.authorization;

  if (auth.decision !== 'approved') {
    return { ok: false, decision: auth.decision, rationale: auth.decision_rationale };
  }

  // 2) Create the transfer against the approved authorization.
  //    (network is inherited from the authorization — do NOT pass it here.)
  const transfer = (await plaidClient.transferCreate({
    access_token: accessToken,
    account_id: accountId,
    authorization_id: auth.id,
    amount,
    description: 'Deposit',
  })).data.transfer;

  await repo.createTransferRecord({
    plaid_transfer_id: transfer.id,
    user_id: userId,
    kind: 'deposit',
    amount,
    network,
    status: transfer.status,        // 'pending'
    authorization_id: auth.id,
    idempotency_key: idempotencyKey,
  });

  return { ok: true, transferId: transfer.id, status: transfer.status };
}

// =============================================================================
// WITHDRAWALS  (type: 'credit' — push funds TO the player's bank)
// Standard ACH (2-day settle). Hold the player's balance up front.
// =============================================================================
async function createWithdrawal({ userId, accessToken, accountId, amount, legalName }) {
  const ref = randomUUID();
  await ledger.holdForWithdrawal(userId, amount, ref); // debit playable now

  try {
    const auth = (await plaidClient.transferAuthorizationCreate({
      access_token: accessToken,
      account_id: accountId,
      type: 'credit',
      network: 'ach',
      amount,
      ach_class: 'ppd',        // consumer credit / payout (NOT 'web', which is for debits)
      user: { legal_name: legalName },
      idempotency_key: ref,
    })).data.authorization;

    if (auth.decision !== 'approved') {
      await ledger.releaseWithdrawalHold(userId, amount, ref); // refund player
      return { ok: false, decision: auth.decision, rationale: auth.decision_rationale };
    }

    const transfer = (await plaidClient.transferCreate({
      access_token: accessToken,
      account_id: accountId,
      authorization_id: auth.id,
      amount,
      description: 'Payout',
    })).data.transfer;

    await repo.createTransferRecord({
      plaid_transfer_id: transfer.id,
      user_id: userId,
      kind: 'withdrawal',
      amount,
      network: 'ach',
      status: transfer.status,
      authorization_id: auth.id,
      idempotency_key: ref,
    });

    return { ok: true, transferId: transfer.id, status: transfer.status };
  } catch (err) {
    await ledger.releaseWithdrawalHold(userId, amount, ref); // never strand a hold
    throw err;
  }
}

// =============================================================================
// EVENT SYNC — the state machine. In production your TRANSFER_EVENTS_UPDATE
// webhook calls this; in testing you can call it directly.
// =============================================================================
async function syncTransferEvents() {
  let afterId = await repo.getEventCursor(); // 0 on first run

  for (;;) {
    const resp = (await plaidClient.transferEventSync({ after_id: afterId, count: 25 })).data;

    // IMPORTANT: apply events oldest-first. The API doesn't guarantee order,
    // and status/ledger transitions must be replayed in chronological sequence.
    const events = (resp.transfer_events || []).slice().sort((a, b) => a.event_id - b.event_id);
    if (events.length === 0) break;

    for (const ev of events) {
      if (!(await repo.eventAlreadyProcessed(ev.event_id))) {
        await projectEvent(ev);
        await repo.markEventProcessed(ev.event_id);
      }
      if (ev.event_id > afterId) afterId = ev.event_id; // advance cursor to the max seen
    }
    await repo.setEventCursor(afterId);
    if (events.length < 25) break;
  }
}

async function projectEvent(ev) {
  const record = await repo.getTransferByPlaidId(ev.transfer_id);
  if (!record) return; // event for a transfer we don't track — ignore

  await repo.updateTransferStatus(ev.transfer_id, ev.event_type, ev);
  const { user_id: userId, amount, kind, network } = record;

  if (kind === 'deposit') {
    switch (ev.event_type) {
      case 'posted':
        await ledger.creditPlayable(userId, amount, ev.transfer_id);
        break;
      case 'settled':
        if (network === 'rtp') await ledger.markDepositCleared(userId, ev.transfer_id);
        break; // ACH clears later via a delayed job (return window)
      case 'returned':
      case 'failed':
        await ledger.reverseCredit(userId, amount, ev.transfer_id);
        break;
    }
  } else if (kind === 'withdrawal') {
    switch (ev.event_type) {
      case 'settled':
        await ledger.finalizeWithdrawal(userId, amount, ev.transfer_id);
        break;
      case 'returned':
      case 'failed':
      case 'cancelled':
        await ledger.releaseWithdrawalHold(userId, amount, ev.transfer_id);
        break;
    }
  }
}

module.exports = { createDeposit, createWithdrawal, syncTransferEvents };