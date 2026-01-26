// frontend/src/components/Wallet/DepositPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import axios from 'axios';
import { selectAuthUser } from '../../store/slices/authSlice';
import { showToast } from '../../store/slices/uiSlice';
import './DepositPage.css';

const stripePromise = loadStripe(
  process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'
);

const CARD_OPTIONS = {
  style: {
    base: {
      color: '#ccd6f6',
      fontFamily: '"Segoe UI", Roboto, sans-serif',
      fontSize: '18px',
      '::placeholder': { color: '#5a6a8a' },
      backgroundColor: 'transparent'
    },
    invalid: { color: '#ff6b6b', iconColor: '#ff6b6b' }
  },
  hidePostalCode: false
};

const QUICK_AMOUNTS = [10, 25, 50, 100, 250, 500];

const BONUS_TIERS = [
  { min: 10, max: 49.99, tickets: 1 },
  { min: 50, max: 99.99, tickets: 2 },
  { min: 100, max: 249.99, tickets: 3 },
  { min: 250, max: 499.99, tickets: 5 },
  { min: 500, max: Infinity, tickets: 10 }
];

const DepositPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectAuthUser);
  
  const [method, setMethod] = useState('card');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState(0);
  
  // Solana state
  const [solanaInfo, setSolanaInfo] = useState(null);
  const [txSignature, setTxSignature] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchBalance();
    fetchSolanaInfo();
  }, []);

  const fetchBalance = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/users/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.user) {
        setBalance(response.data.user.balance || 0);
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    }
  };

  const fetchSolanaInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/payments/solana/deposit-info', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success !== false) {
        setSolanaInfo(response.data);
      }
    } catch (err) {
      console.log('Solana deposits not configured');
    }
  };

  const numAmount = parseFloat(amount) || 0;
  const cardFee = method === 'card' ? numAmount * 0.01 : 0;
  const netAmount = numAmount - cardFee;
  
  const bonusTickets = method === 'solana' 
    ? (BONUS_TIERS.find(t => numAmount >= t.min && numAmount <= t.max)?.tickets || 0)
    : 0;

  const copyAddress = () => {
    if (solanaInfo?.wallet) {
      navigator.clipboard.writeText(solanaInfo.wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerifySolana = async () => {
    if (!txSignature.trim()) {
      setError('Please enter the transaction signature');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/payments/solana/verify',
        { signature: txSignature.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        dispatch(showToast({
          message: `Deposited $${response.data.amount} + ${response.data.bonusTickets} bonus tickets!`,
          type: 'success'
        }));
        setSuccess(true);
      } else {
        setError(response.data.error || 'Verification failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to verify transaction');
    } finally {
      setVerifying(false);
    }
  };

  // Success View
  if (success) {
    return (
      <div className="deposit-page">
        <div className="deposit-container">
          <div className="deposit-success-view">
            <div className="success-icon">✓</div>
            <h2>Deposit {method === 'ach' ? 'Initiated' : 'Successful'}!</h2>
            <p className="success-amount">${netAmount.toFixed(2)}</p>
            {bonusTickets > 0 && (
              <p className="success-bonus">+{bonusTickets} bonus tickets 🎟️</p>
            )}
            {method === 'ach' && (
              <p className="success-note">Funds will arrive in 3-5 business days</p>
            )}
            <div className="success-actions">
              <button className="btn-primary" onClick={() => navigate('/lobby')}>
                Go to Lobby
              </button>
              <button className="btn-secondary" onClick={() => {
                setSuccess(false);
                setAmount('');
              }}>
                Make Another Deposit
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="deposit-page">
      <div className="deposit-container">
        {/* Header */}
        <div className="deposit-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <div className="header-center">
            <h1>Add Funds</h1>
            <button className="withdraw-link" onClick={() => navigate('/withdraw')}>
              Need to withdraw? →
            </button>
          </div>
          <div className="current-balance">
            Balance: <span className="balance-amount">${Number(balance).toFixed(2)}</span>
          </div>
        </div>

        <div className="deposit-layout">
          {/* Left: Amount & Method Selection */}
          <div className="deposit-main">
            {/* Amount Input */}
            <div className="deposit-section">
              <label className="section-label">Deposit Amount</label>
              <div className="amount-input-container">
                <span className="currency-symbol">$</span>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^0-9.]/g, ''));
                    setError(null);
                  }}
                  placeholder="0.00"
                  className="amount-input"
                  disabled={loading || verifying}
                />
              </div>
              
              <div className="quick-amounts">
                {QUICK_AMOUNTS.map(qa => (
                  <button
                    key={qa}
                    className={`quick-btn ${amount === qa.toString() ? 'active' : ''}`}
                    onClick={() => setAmount(qa.toString())}
                    disabled={loading || verifying}
                  >
                    ${qa}
                  </button>
                ))}
              </div>
            </div>

            {/* Method Selection */}
            <div className="deposit-section">
              <label className="section-label">Payment Method</label>
              <div className="method-cards">
                {/* Credit/Debit Card */}
                <button
                  className={`method-card ${method === 'card' ? 'active' : ''}`}
                  onClick={() => setMethod('card')}
                >
                  <div className="method-icon">💳</div>
                  <div className="method-info">
                    <span className="method-name">Credit/Debit Card</span>
                    <span className="method-detail">Instant • 1% fee</span>
                  </div>
                </button>
                
                {/* Bank Transfer */}
                <button
                  className={`method-card ${method === 'ach' ? 'active' : ''}`}
                  onClick={() => setMethod('ach')}
                >
                  <div className="method-icon">🏦</div>
                  <div className="method-info">
                    <span className="method-name">Bank Transfer</span>
                    <span className="method-detail">3-5 days • Free</span>
                  </div>
                </button>
                
                {/* Crypto */}
                <button
                  className={`method-card ${method === 'solana' ? 'active' : ''}`}
                  onClick={() => setMethod('solana')}
                >
                  <div className="method-icon">💎</div>
                  <div className="method-info">
                    <span className="method-name">Crypto (USDC/USDT)</span>
                    <span className="method-detail">Instant • Free + Bonus 🎟️</span>
                  </div>
                  <span className="best-value-badge">BEST VALUE</span>
                </button>
              </div>
            </div>

            {/* Method-specific Forms */}
            <div className="deposit-section">
              {method === 'card' && (
                <Elements stripe={stripePromise}>
                  <CardDepositForm
                    amount={numAmount}
                    netAmount={netAmount}
                    loading={loading}
                    setLoading={setLoading}
                    setSuccess={setSuccess}
                    setError={setError}
                    dispatch={dispatch}
                  />
                </Elements>
              )}

              {method === 'ach' && (
                <Elements stripe={stripePromise}>
                  <ACHDepositForm
                    amount={numAmount}
                    loading={loading}
                    setLoading={setLoading}
                    setSuccess={setSuccess}
                    setError={setError}
                    dispatch={dispatch}
                  />
                </Elements>
              )}

              {method === 'solana' && (
                <SolanaDepositForm
                  solanaInfo={solanaInfo}
                  txSignature={txSignature}
                  setTxSignature={setTxSignature}
                  verifying={verifying}
                  numAmount={numAmount}
                  copied={copied}
                  copyAddress={copyAddress}
                  handleVerifySolana={handleVerifySolana}
                />
              )}
            </div>

            {error && <div className="error-banner">{error}</div>}
          </div>

          {/* Right: Summary Sidebar */}
          <div className="deposit-sidebar">
            <div className="summary-card">
              <h3>Summary</h3>
              
              <div className="summary-row">
                <span>Deposit Amount</span>
                <span>${numAmount.toFixed(2)}</span>
              </div>
              
              {cardFee > 0 && (
                <div className="summary-row fee">
                  <span>Processing Fee (1%)</span>
                  <span>-${cardFee.toFixed(2)}</span>
                </div>
              )}
              
              <div className="summary-divider"></div>
              
              <div className="summary-row total">
                <span>You Receive</span>
                <span className="total-amount">${netAmount.toFixed(2)}</span>
              </div>
              
              {bonusTickets > 0 && (
                <div className="summary-row bonus">
                  <span>Bonus Tickets</span>
                  <span className="bonus-amount">+{bonusTickets} 🎟️</span>
                </div>
              )}

              <div className="summary-note">
                {method === 'card' && '⚡ Instant deposit'}
                {method === 'ach' && '🕐 3-5 business days'}
                {method === 'solana' && '⚡ Instant after verification'}
              </div>
            </div>

            <div className="trust-badges">
              <div className="trust-badge">🔒 Secure payments by Stripe</div>
              <div className="trust-badge">💰 $10 minimum deposit</div>
              <div className="trust-badge">⚡ Instant play credit</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// CARD DEPOSIT FORM
// ============================================
const CardDepositForm = ({ amount, netAmount, loading, setLoading, setSuccess, setError, dispatch }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardComplete, setCardComplete] = useState(false);

  const handleSubmit = async () => {
    if (amount < 10) {
      setError('Minimum deposit is $10');
      return;
    }
    if (!cardComplete) {
      setError('Please complete your card details');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const intentResponse = await axios.post(
        '/api/payments/card/create-intent',
        { amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const { clientSecret } = intentResponse.data;

      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) }
      });

      if (stripeError) {
        setError(stripeError.message);
      } else if (paymentIntent.status === 'succeeded') {
        dispatch(showToast({
          message: `Deposited $${netAmount.toFixed(2)}!`,
          type: 'success'
        }));
        setSuccess(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-form">
      <label className="input-label">Card Details</label>
      <div className="card-element-wrapper">
        <CardElement
          options={CARD_OPTIONS}
          onChange={(e) => setCardComplete(e.complete)}
        />
      </div>
      <button
        className="submit-btn"
        onClick={handleSubmit}
        disabled={loading || amount < 10 || !stripe || !cardComplete}
      >
        {loading ? 'Processing...' : `Deposit $${amount || '0'}`}
      </button>
    </div>
  );
};

// ============================================
// ACH DEPOSIT FORM
// ============================================
const ACHDepositForm = ({ amount, loading, setLoading, setSuccess, setError, dispatch }) => {
  const stripe = useStripe();

  const handleSubmit = async () => {
    if (amount < 10) {
      setError('Minimum deposit is $10');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const intentResponse = await axios.post(
        '/api/payments/ach/create-intent',
        { amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const { clientSecret } = intentResponse.data;

      const { error: collectError } = await stripe.collectBankAccountForPayment({
        clientSecret,
        params: {
          payment_method_type: 'us_bank_account',
          payment_method_data: {
            billing_details: { name: 'Account Holder' }
          }
        },
        expand: ['payment_method']
      });

      if (collectError) {
        setError(collectError.message);
        return;
      }

      const { error: confirmError, paymentIntent } = await stripe.confirmUsBankAccountPayment(clientSecret);

      if (confirmError) {
        setError(confirmError.message);
      } else if (paymentIntent.status === 'processing') {
        dispatch(showToast({
          message: 'Bank transfer initiated! Funds arrive in 3-5 business days.',
          type: 'success'
        }));
        setSuccess(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Bank connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ach-form">
      <p className="ach-description">
        Link your bank account for free deposits. We'll use Stripe's secure bank connection 
        to verify your account. Funds typically arrive in 3-5 business days.
      </p>
      <button
        className="submit-btn"
        onClick={handleSubmit}
        disabled={loading || amount < 10 || !stripe}
      >
        {loading ? 'Connecting...' : `Connect Bank & Deposit $${amount || '0'}`}
      </button>
    </div>
  );
};

// ============================================
// SOLANA DEPOSIT FORM
// ============================================
const SolanaDepositForm = ({ 
  solanaInfo, 
  txSignature, 
  setTxSignature, 
  verifying, 
  numAmount,
  copied,
  copyAddress,
  handleVerifySolana 
}) => {
  if (!solanaInfo) {
    return (
      <div className="coming-soon">
        <p>Crypto deposits coming soon!</p>
        <p className="subtext">We're setting up our Solana wallet. Check back shortly.</p>
      </div>
    );
  }

  return (
    <div className="solana-form">
      {/* Wallet Address */}
      <div className="solana-wallet">
        <label className="input-label">Send USDC or USDT (Solana) to:</label>
        <div className="wallet-row">
          <code className="wallet-address">{solanaInfo.wallet}</code>
          <button className="copy-btn" onClick={copyAddress}>
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
        <span className="solana-badge">Solana Network Only</span>
      </div>

      {/* Transaction Verification */}
      <div className="solana-verify">
        <label className="input-label">After sending, paste transaction signature:</label>
        <input
          type="text"
          value={txSignature}
          onChange={(e) => setTxSignature(e.target.value)}
          placeholder="e.g., 5K7Hj..."
          className="tx-input"
          disabled={verifying}
        />
        <button
          className="submit-btn"
          onClick={handleVerifySolana}
          disabled={verifying || !txSignature.trim()}
        >
          {verifying ? 'Verifying...' : 'Verify & Credit Balance'}
        </button>
      </div>

      {/* Bonus Tiers */}
      <div className="bonus-tiers">
        <label className="input-label">🎟️ Bonus Ticket Tiers</label>
        <div className="tiers-grid">
          {BONUS_TIERS.map((tier, i) => (
            <div
              key={i}
              className={`tier ${numAmount >= tier.min && numAmount <= tier.max ? 'active' : ''}`}
            >
              <span className="tier-range">
                ${tier.min}{tier.max === Infinity ? '+' : `-$${tier.max}`}
              </span>
              <span className="tier-reward">+{tier.tickets} 🎟️</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DepositPage;
