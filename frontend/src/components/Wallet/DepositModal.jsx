import React, { useState, useEffect } from 'react';
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
import './DepositModal.css';

const stripePromise = loadStripe(
  process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'
);

const CARD_OPTIONS = {
  style: {
    base: {
      color: '#ccd6f6',
      fontFamily: '"Segoe UI", Roboto, sans-serif',
      fontSize: '16px',
      '::placeholder': { color: '#8892b0' },
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

const DepositModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const user = useSelector(selectAuthUser);
  
  const [method, setMethod] = useState('solana');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [solanaInfo, setSolanaInfo] = useState(null);
  const [txSignature, setTxSignature] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSolanaInfo();
    }
  }, [isOpen]);

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
      console.log('Solana deposits not configured yet');
    }
  };

  const handleClose = () => {
    setAmount('');
    setError(null);
    setSuccess(false);
    setTxSignature('');
    setCopied(false);
    onClose();
  };

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

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

  if (!isOpen) return null;

  return (
    <div className="deposit-overlay" onClick={handleClose}>
      <div className="deposit-modal" onClick={e => e.stopPropagation()}>
        <div className="deposit-header">
          <h2>💰 Add Funds</h2>
          <button className="deposit-close-btn" onClick={handleClose}>×</button>
        </div>

        {success ? (
          <div className="deposit-success">
            <div className="success-checkmark">✓</div>
            <h3>Deposit {method === 'ach' ? 'Initiated' : 'Successful'}!</h3>
            <p className="success-amount">${netAmount.toFixed(2)}</p>
            {bonusTickets > 0 && (
              <p className="success-bonus">+{bonusTickets} bonus tickets 🎟️</p>
            )}
            {method === 'ach' && (
              <p className="success-note">Funds will arrive in 3-5 business days</p>
            )}
            <button className="success-done-btn" onClick={handleClose}>Done</button>
          </div>
        ) : (
          <div className="deposit-content">
            <div className="deposit-tabs">
              <button
                className={`deposit-tab ${method === 'solana' ? 'active' : ''}`}
                onClick={() => setMethod('solana')}
              >
                <span className="tab-icon">💎</span>
                <span className="tab-text">Crypto</span>
                <span className="tab-badge">BEST</span>
              </button>
              <button
                className={`deposit-tab ${method === 'ach' ? 'active' : ''}`}
                onClick={() => setMethod('ach')}
              >
                <span className="tab-icon">🏦</span>
                <span className="tab-text">Bank</span>
              </button>
              <button
                className={`deposit-tab ${method === 'card' ? 'active' : ''}`}
                onClick={() => setMethod('card')}
              >
                <span className="tab-icon">💳</span>
                <span className="tab-text">Card</span>
                <span className="tab-fee">1% fee</span>
              </button>
            </div>

            <div className={`deposit-banner ${method}`}>
              {method === 'solana' && '🎟️ Zero fees + bonus tickets on every deposit!'}
              {method === 'ach' && '✓ Free deposits • 3-5 business days'}
              {method === 'card' && '⚡ Instant • 1% processing fee'}
            </div>

            <div className="deposit-amount-section">
              <label className="deposit-label">Amount</label>
              <div className="deposit-amount-wrapper">
                <span className="deposit-currency">$</span>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^0-9.]/g, ''));
                    setError(null);
                  }}
                  placeholder="0.00"
                  className="deposit-amount-input"
                  disabled={loading || verifying}
                />
              </div>

              <div className="deposit-quick-amounts">
                {QUICK_AMOUNTS.map(qa => (
                  <button
                    key={qa}
                    className={`quick-amount-btn ${amount === qa.toString() ? 'active' : ''}`}
                    onClick={() => setAmount(qa.toString())}
                    disabled={loading || verifying}
                  >
                    ${qa}
                  </button>
                ))}
              </div>

              {numAmount >= 10 && (
                <div className="deposit-summary">
                  <div className="summary-line">
                    <span>Deposit</span>
                    <span>${numAmount.toFixed(2)}</span>
                  </div>
                  {cardFee > 0 && (
                    <div className="summary-line fee">
                      <span>Processing fee (1%)</span>
                      <span>-${cardFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="summary-line total">
                    <span>You receive</span>
                    <span>${netAmount.toFixed(2)}</span>
                  </div>
                  {bonusTickets > 0 && (
                    <div className="summary-line bonus">
                      <span>🎟️ Bonus tickets</span>
                      <span>+{bonusTickets}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {method === 'solana' && (
              <div className="deposit-method-content">
                {solanaInfo ? (
                  <>
                    <div className="solana-wallet-section">
                      <label className="deposit-label">Send USDC or USDT to:</label>
                      <div className="wallet-address-row">
                        <code className="wallet-address">{solanaInfo.wallet}</code>
                        <button className="copy-btn" onClick={copyAddress}>
                          {copied ? '✓ Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="network-note">
                        <span className="solana-badge">Solana Network</span>
                        Supports USDC and USDT
                      </p>
                    </div>

                    <div className="solana-verify-section">
                      <label className="deposit-label">
                        After sending, paste your transaction signature:
                      </label>
                      <input
                        type="text"
                        value={txSignature}
                        onChange={(e) => setTxSignature(e.target.value)}
                        placeholder="e.g., 5K7Hj..."
                        className="tx-signature-input"
                        disabled={verifying}
                      />
                      <button
                        className="verify-btn"
                        onClick={handleVerifySolana}
                        disabled={verifying || !txSignature.trim()}
                      >
                        {verifying ? 'Verifying...' : 'Verify & Credit'}
                      </button>
                    </div>

                    <div className="bonus-tiers-section">
                      <label className="deposit-label">🎟️ Bonus Ticket Tiers</label>
                      <div className="bonus-tiers-grid">
                        {BONUS_TIERS.map((tier, i) => (
                          <div
                            key={i}
                            className={`bonus-tier ${numAmount >= tier.min && numAmount <= tier.max ? 'active' : ''}`}
                          >
                            <span className="tier-range">
                              ${tier.min}{tier.max === Infinity ? '+' : `-$${tier.max}`}
                            </span>
                            <span className="tier-reward">+{tier.tickets} 🎟️</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="coming-soon">Crypto deposits coming soon...</p>
                )}
              </div>
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

            {error && <div className="deposit-error">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
};

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
    <div className="deposit-method-content">
      <p className="method-description">
        Link your bank account for free deposits. Funds typically arrive in 3-5 business days.
      </p>
      <button
        className="deposit-submit-btn ach"
        onClick={handleSubmit}
        disabled={loading || amount < 10 || !stripe}
      >
        {loading ? 'Connecting...' : `Link Bank & Deposit $${amount || '0'}`}
      </button>
      <p className="security-note">🔒 Secured by Stripe Financial Connections</p>
    </div>
  );
};

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
    <div className="deposit-method-content">
      <div className="card-element-container">
        <CardElement
          options={CARD_OPTIONS}
          onChange={(e) => setCardComplete(e.complete)}
        />
      </div>
      <button
        className="deposit-submit-btn card"
        onClick={handleSubmit}
        disabled={loading || amount < 10 || !stripe || !cardComplete}
      >
        {loading ? 'Processing...' : `Deposit $${amount || '0'} (receive $${netAmount.toFixed(2)})`}
      </button>
      <p className="security-note">🔒 Card payments secured by Stripe</p>
    </div>
  );
};

export default DepositModal;
