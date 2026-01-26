// frontend/src/components/Wallet/WithdrawalPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import axios from 'axios';
import { selectAuthUser } from '../../store/slices/authSlice';
import { showToast } from '../../store/slices/uiSlice';
import './WithdrawalPage.css';

const WithdrawalPage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectAuthUser);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [withdrawalInfo, setWithdrawalInfo] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [venmoHandle, setVenmoHandle] = useState('');
  const [showW9Modal, setShowW9Modal] = useState(false);
  const [w9Data, setW9Data] = useState({ legalName: '', address: '' });

  // Fetch withdrawal info on mount
  useEffect(() => {
    fetchWithdrawalInfo();
  }, []);

  const fetchWithdrawalInfo = async () => {
    try {
      const response = await axios.get('/api/withdrawals/info');
      setWithdrawalInfo(response.data);
      
      // Auto-select method based on amount thresholds
      if (response.data.availableBalance >= 600) {
        setMethod('bank_ach');
      } else if (response.data.availableBalance >= 50) {
        setMethod('paypal');
      }
    } catch (error) {
      console.error('Error fetching withdrawal info:', error);
      dispatch(showToast({ message: 'Error loading withdrawal info', type: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, '');
    setAmount(value);
    
    // Auto-switch to bank ACH for large amounts
    const numValue = parseFloat(value) || 0;
    if (numValue >= 600 && method !== 'bank_ach') {
      setMethod('bank_ach');
    }
  };

  const handleQuickAmount = (value) => {
    setAmount(value.toString());
    if (value >= 600) {
      setMethod('bank_ach');
    }
  };

  const handleMaxAmount = () => {
    if (withdrawalInfo) {
      setAmount(withdrawalInfo.availableBalance.toFixed(2));
      if (withdrawalInfo.availableBalance >= 600) {
        setMethod('bank_ach');
      }
    }
  };

  const validateWithdrawal = () => {
    const numAmount = parseFloat(amount);
    
    if (!numAmount || numAmount < withdrawalInfo.minWithdrawal) {
      dispatch(showToast({ 
        message: `Minimum withdrawal is $${withdrawalInfo.minWithdrawal}`, 
        type: 'error' 
      }));
      return false;
    }

    if (numAmount > withdrawalInfo.availableBalance) {
      dispatch(showToast({ message: 'Insufficient balance', type: 'error' }));
      return false;
    }

    if (numAmount > withdrawalInfo.maxWithdrawal) {
      dispatch(showToast({ 
        message: `Maximum withdrawal is $${withdrawalInfo.maxWithdrawal.toFixed(2)}`, 
        type: 'error' 
      }));
      return false;
    }

    if (!method) {
      dispatch(showToast({ message: 'Select a withdrawal method', type: 'error' }));
      return false;
    }

    if (method === 'paypal' && !paypalEmail) {
      dispatch(showToast({ message: 'Enter your PayPal email', type: 'error' }));
      return false;
    }

    if (method === 'venmo' && !venmoHandle) {
      dispatch(showToast({ message: 'Enter your Venmo handle', type: 'error' }));
      return false;
    }

    // Check W-9 requirement
    const ytdWithThis = withdrawalInfo.ytdPayouts + numAmount;
    if (ytdWithThis >= 600 && !withdrawalInfo.hasW9) {
      setShowW9Modal(true);
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateWithdrawal()) return;

    setSubmitting(true);
    try {
      const payoutDetails = {};
      if (method === 'paypal') payoutDetails.paypalEmail = paypalEmail;
      if (method === 'venmo') payoutDetails.venmoHandle = venmoHandle;

      const response = await axios.post('/api/withdrawals/request', {
        amount: parseFloat(amount),
        method,
        payoutDetails
      });

      if (response.data.success) {
        setSuccess(true);
        dispatch(showToast({ message: 'Withdrawal requested!', type: 'success' }));
      }
    } catch (error) {
      console.error('Withdrawal error:', error);
      dispatch(showToast({ 
        message: error.response?.data?.error || 'Withdrawal failed', 
        type: 'error' 
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleW9Submit = async () => {
    if (!w9Data.legalName || !w9Data.address) {
      dispatch(showToast({ message: 'Please fill all fields', type: 'error' }));
      return;
    }

    try {
      await axios.post('/api/withdrawals/w9', w9Data);
      setShowW9Modal(false);
      setWithdrawalInfo(prev => ({ ...prev, hasW9: true }));
      dispatch(showToast({ message: 'W-9 submitted', type: 'success' }));
      // Retry withdrawal
      handleSubmit();
    } catch (error) {
      dispatch(showToast({ message: 'Error submitting W-9', type: 'error' }));
    }
  };

  const handleCancelWithdrawal = async (withdrawalId) => {
    try {
      await axios.post(`/api/withdrawals/${withdrawalId}/cancel`);
      dispatch(showToast({ message: 'Withdrawal cancelled', type: 'success' }));
      fetchWithdrawalInfo();
    } catch (error) {
      dispatch(showToast({ 
        message: error.response?.data?.error || 'Error cancelling', 
        type: 'error' 
      }));
    }
  };

  if (loading) {
    return (
      <div className="withdrawal-page">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="withdrawal-page">
        <div className="withdrawal-success">
          <div className="success-icon">✓</div>
          <h2>Withdrawal Requested!</h2>
          <p>Your withdrawal of <strong>${parseFloat(amount).toFixed(2)}</strong> is being processed.</p>
          <p className="processing-time">
            {method === 'bank_ach' ? 'Expected: 2-3 business days' : 'Expected: 1-2 business days'}
          </p>
          <div className="success-actions">
            <button onClick={() => navigate('/lobby')} className="btn-primary">
              Back to Lobby
            </button>
            <button onClick={() => { setSuccess(false); fetchWithdrawalInfo(); }} className="btn-secondary">
              Another Withdrawal
            </button>
          </div>
        </div>
      </div>
    );
  }

  const numAmount = parseFloat(amount) || 0;
  const needsW9ForThis = (withdrawalInfo.ytdPayouts + numAmount) >= 600 && !withdrawalInfo.hasW9;

  return (
    <div className="withdrawal-page">
      <div className="withdrawal-container">
        {/* Header */}
        <div className="withdrawal-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h1>Withdraw Funds</h1>
          <div className="current-balance">
            Balance: <span className="balance-amount">${withdrawalInfo.availableBalance.toFixed(2)}</span>
          </div>
        </div>

        <div className="withdrawal-content">
          {/* Main Section */}
          <div className="withdrawal-main">
            {/* Amount Input */}
            <div className="amount-section">
              <label>Withdrawal Amount</label>
              <div className="amount-input-wrapper">
                <span className="currency-symbol">$</span>
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0.00"
                  className="amount-input"
                />
                <button className="max-btn" onClick={handleMaxAmount}>MAX</button>
              </div>
              
              <div className="quick-amounts">
                {[50, 100, 250, 500].map(val => (
                  <button
                    key={val}
                    onClick={() => handleQuickAmount(val)}
                    className={`quick-amount ${parseFloat(amount) === val ? 'selected' : ''}`}
                    disabled={val > withdrawalInfo.availableBalance}
                  >
                    ${val}
                  </button>
                ))}
              </div>
            </div>

            {/* Method Selection */}
            <div className="method-section">
              <label>Withdrawal Method</label>
              
              {/* Small amounts: PayPal/Venmo */}
              {numAmount < 600 && (
                <>
                  <div 
                    className={`method-card ${method === 'paypal' ? 'selected' : ''}`}
                    onClick={() => setMethod('paypal')}
                  >
                    <div className="method-icon">💳</div>
                    <div className="method-info">
                      <h3>PayPal</h3>
                      <span>1-2 business days • Free</span>
                    </div>
                    {method === 'paypal' && <span className="checkmark">✓</span>}
                  </div>

                  <div 
                    className={`method-card ${method === 'venmo' ? 'selected' : ''}`}
                    onClick={() => setMethod('venmo')}
                  >
                    <div className="method-icon">📱</div>
                    <div className="method-info">
                      <h3>Venmo</h3>
                      <span>1-2 business days • Free</span>
                    </div>
                    {method === 'venmo' && <span className="checkmark">✓</span>}
                  </div>
                </>
              )}

              {/* Large amounts or user choice: Bank ACH */}
              <div 
                className={`method-card ${method === 'bank_ach' ? 'selected' : ''} ${numAmount >= 600 ? 'recommended' : ''}`}
                onClick={() => setMethod('bank_ach')}
              >
                <div className="method-icon">🏦</div>
                <div className="method-info">
                  <h3>Bank Transfer (ACH)</h3>
                  <span>2-3 business days • Free</span>
                </div>
                {numAmount >= 600 && <span className="badge">Required for $600+</span>}
                {method === 'bank_ach' && <span className="checkmark">✓</span>}
              </div>

              {/* PayPal Email Input */}
              {method === 'paypal' && (
                <div className="method-details">
                  <label>PayPal Email</label>
                  <input
                    type="email"
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="detail-input"
                  />
                </div>
              )}

              {/* Venmo Handle Input */}
              {method === 'venmo' && (
                <div className="method-details">
                  <label>Venmo Username</label>
                  <input
                    type="text"
                    value={venmoHandle}
                    onChange={(e) => setVenmoHandle(e.target.value)}
                    placeholder="@username"
                    className="detail-input"
                  />
                </div>
              )}

              {/* Bank ACH Info */}
              {method === 'bank_ach' && (
                <div className="method-details">
                  <p className="info-text">
                    💡 You'll receive an email with instructions to securely link your bank account.
                  </p>
                </div>
              )}
            </div>

            {/* W-9 Warning */}
            {needsW9ForThis && (
              <div className="w9-warning">
                <span className="warning-icon">⚠️</span>
                <div>
                  <strong>Tax Information Required</strong>
                  <p>Withdrawals totaling $600+ per year require W-9 tax form.</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              className="withdraw-btn"
              onClick={handleSubmit}
              disabled={submitting || !amount || !method || numAmount < 50}
            >
              {submitting ? 'Processing...' : `Withdraw $${numAmount.toFixed(2)}`}
            </button>
          </div>

          {/* Sidebar */}
          <div className="withdrawal-sidebar">
            {/* Summary */}
            <div className="summary-card">
              <h3>Summary</h3>
              <div className="summary-row">
                <span>Withdrawal Amount</span>
                <span>${numAmount.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Processing Fee</span>
                <span className="free">Free</span>
              </div>
              <div className="summary-divider"></div>
              <div className="summary-row total">
                <span>You Receive</span>
                <span className="total-amount">${numAmount.toFixed(2)}</span>
              </div>
              <div className="processing-time">
                {method === 'bank_ach' ? '⏱ 2-3 business days' : '⏱ 1-2 business days'}
              </div>
            </div>

            {/* Limits Info */}
            <div className="limits-card">
              <h4>Withdrawal Limits</h4>
              <div className="limit-row">
                <span>Minimum</span>
                <span>${withdrawalInfo.minWithdrawal}</span>
              </div>
              <div className="limit-row">
                <span>Daily Limit</span>
                <span>${withdrawalInfo.dailyLimit.toLocaleString()}</span>
              </div>
              <div className="limit-row">
                <span>Used Today</span>
                <span>${withdrawalInfo.dailyUsed.toFixed(2)}</span>
              </div>
            </div>

            {/* YTD Info */}
            <div className="ytd-card">
              <h4>Year-to-Date</h4>
              <div className="ytd-row">
                <span>Total Withdrawals</span>
                <span>${withdrawalInfo.ytdPayouts.toFixed(2)}</span>
              </div>
              <div className="ytd-row">
                <span>1099 Threshold</span>
                <span>${withdrawalInfo.taxThreshold}</span>
              </div>
              {withdrawalInfo.hasW9 && (
                <div className="w9-status">✓ W-9 on file</div>
              )}
            </div>

            {/* Pending Withdrawals */}
            {withdrawalInfo.pendingWithdrawals?.length > 0 && (
              <div className="pending-card">
                <h4>Pending Withdrawals</h4>
                {withdrawalInfo.pendingWithdrawals.map(w => (
                  <div key={w.id} className="pending-item">
                    <div className="pending-info">
                      <span className="pending-amount">${parseFloat(w.amount).toFixed(2)}</span>
                      <span className="pending-status">{w.status}</span>
                    </div>
                    {w.status === 'pending' && (
                      <button 
                        className="cancel-btn"
                        onClick={() => handleCancelWithdrawal(w.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* W-9 Modal */}
      {showW9Modal && (
        <div className="modal-overlay">
          <div className="w9-modal">
            <h2>Tax Information Required</h2>
            <p>For withdrawals totaling $600+ per year, we need your tax information for IRS reporting.</p>
            
            <div className="form-group">
              <label>Legal Name (as shown on tax return)</label>
              <input
                type="text"
                value={w9Data.legalName}
                onChange={(e) => setW9Data({ ...w9Data, legalName: e.target.value })}
                placeholder="John Doe"
              />
            </div>

            <div className="form-group">
              <label>Address</label>
              <input
                type="text"
                value={w9Data.address}
                onChange={(e) => setW9Data({ ...w9Data, address: e.target.value })}
                placeholder="123 Main St, City, State ZIP"
              />
            </div>

            <p className="note">
              Note: Your SSN will be collected securely via a separate form sent to your email.
            </p>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowW9Modal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleW9Submit}>
                Submit & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WithdrawalPage;
