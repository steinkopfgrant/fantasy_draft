// frontend/src/components/Auth/Register.js
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { register, clearError, selectAuthLoading, selectAuthError } from '../../store/slices/authSlice';

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

const BLOCKED_STATES = ['MT', 'ID', 'LA', 'NV', 'WA'];

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    state: '',
    tosAccepted: false
  });
  const [localError, setLocalError] = useState('');
  
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  const loading = useSelector(selectAuthLoading);
  const authError = useSelector(selectAuthError);
  
  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);
  
  useEffect(() => {
    if (authError) {
      setLocalError(authError);
    }
  }, [authError]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });

    // Clear error when user changes state selection
    if (name === 'state' && localError.includes('state')) {
      setLocalError('');
    }
  };

  const calculateAge = (dob) => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const isBlockedState = formData.state && BLOCKED_STATES.includes(formData.state);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    // State validation
    if (!formData.state) {
      setLocalError('Please select your state of residence');
      return;
    }

    if (BLOCKED_STATES.includes(formData.state)) {
      setLocalError('Paid fantasy sports contests are not currently available in your state.');
      return;
    }

    // Age verification
    if (!formData.dateOfBirth) {
      setLocalError('Date of birth is required');
      return;
    }

    const age = calculateAge(formData.dateOfBirth);
    if (age < 18) {
      setLocalError('You must be at least 18 years old to use BidBlitz');
      return;
    }

    // ToS acceptance
    if (!formData.tosAccepted) {
      setLocalError('You must accept the Terms of Service and Privacy Policy');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }

    try {
      const resultAction = await dispatch(register({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        state: formData.state,
        dateOfBirth: formData.dateOfBirth,
        tosAcceptedAt: new Date().toISOString()
      }));
      
      if (register.fulfilled.match(resultAction)) {
        console.log('Registration successful');
      } else {
        setLocalError(resultAction.payload || 'Registration failed');
      }
    } catch (err) {
      setLocalError('Registration failed. Please try again.');
    }
  };

  const styles = {
    container: {
      maxWidth: '420px',
      margin: '2rem auto',
      padding: '2rem',
    },
    title: {
      color: '#e6f1ff',
      fontSize: '1.8rem',
      fontWeight: 700,
      marginBottom: '1.5rem',
    },
    error: {
      color: '#e74c3c',
      backgroundColor: 'rgba(231, 76, 60, 0.1)',
      border: '1px solid rgba(231, 76, 60, 0.3)',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '1rem',
      fontSize: '0.9rem',
    },
    fieldGroup: {
      marginBottom: '1rem',
    },
    label: {
      display: 'block',
      color: '#8892b0',
      fontSize: '0.9rem',
      marginBottom: '0.4rem',
      fontWeight: 500,
    },
    input: {
      display: 'block',
      width: '100%',
      padding: '10px 12px',
      backgroundColor: '#112240',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '6px',
      color: '#ccd6f6',
      fontSize: '0.95rem',
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s',
    },
    select: {
      display: 'block',
      width: '100%',
      padding: '10px 12px',
      backgroundColor: '#112240',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '6px',
      color: '#ccd6f6',
      fontSize: '0.95rem',
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s',
      cursor: 'pointer',
      appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238892b0' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      paddingRight: '32px',
    },
    blockedWarning: {
      color: '#e74c3c',
      backgroundColor: 'rgba(231, 76, 60, 0.1)',
      border: '1px solid rgba(231, 76, 60, 0.3)',
      borderRadius: '6px',
      padding: '10px 12px',
      marginTop: '0.4rem',
      fontSize: '0.8rem',
      lineHeight: 1.4,
    },
    stateNote: {
      color: '#8892b0',
      fontSize: '0.8rem',
      marginTop: '0.3rem',
      fontStyle: 'italic',
    },
    inputFocus: {
      borderColor: '#00d4aa',
    },
    checkboxRow: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.5rem',
      marginBottom: '1.25rem',
      marginTop: '0.5rem',
    },
    checkbox: {
      marginTop: '3px',
      accentColor: '#00d4aa',
      width: '16px',
      height: '16px',
      cursor: 'pointer',
      flexShrink: 0,
    },
    checkboxLabel: {
      color: '#a8b2d1',
      fontSize: '0.85rem',
      lineHeight: 1.5,
    },
    tosLink: {
      color: '#00d4aa',
      textDecoration: 'none',
    },
    button: {
      width: '100%',
      padding: '12px',
      backgroundColor: (loading || isBlockedState) ? '#1a3a5c' : '#00d4aa',
      color: (loading || isBlockedState) ? '#8892b0' : '#0a192f',
      border: 'none',
      borderRadius: '8px',
      cursor: (loading || isBlockedState) ? 'not-allowed' : 'pointer',
      fontSize: '1rem',
      fontWeight: 600,
      transition: 'background-color 0.2s',
      marginTop: '0.5rem',
    },
    footer: {
      marginTop: '1.25rem',
      textAlign: 'center',
      color: '#8892b0',
      fontSize: '0.9rem',
    },
    footerLink: {
      color: '#00d4aa',
      textDecoration: 'none',
    },
    dobNote: {
      color: '#8892b0',
      fontSize: '0.8rem',
      marginTop: '0.3rem',
      fontStyle: 'italic',
    },
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Create Account</h2>
      
      {localError && (
        <div style={styles.error}>{localError}</div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Username</label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
            autoComplete="username"
            placeholder="Choose a username"
            style={styles.input}
            onFocus={(e) => e.target.style.borderColor = '#00d4aa'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
          />
        </div>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            autoComplete="email"
            placeholder="your@email.com"
            style={styles.input}
            onFocus={(e) => e.target.style.borderColor = '#00d4aa'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>State of Residence</label>
          <select
            name="state"
            value={formData.state}
            onChange={handleChange}
            required
            style={{
              ...styles.select,
              borderColor: isBlockedState ? '#e74c3c' : 'rgba(255, 255, 255, 0.1)',
            }}
            onFocus={(e) => e.target.style.borderColor = isBlockedState ? '#e74c3c' : '#00d4aa'}
            onBlur={(e) => e.target.style.borderColor = isBlockedState ? '#e74c3c' : 'rgba(255, 255, 255, 0.1)'}
          >
            <option value="">Select your state</option>
            {US_STATES.map(s => (
              <option key={s.code} value={s.code}>
                {s.name}{BLOCKED_STATES.includes(s.code) ? ' (unavailable)' : ''}
              </option>
            ))}
          </select>
          {isBlockedState ? (
            <div style={styles.blockedWarning}>
              Paid fantasy sports contests are not currently available in {US_STATES.find(s => s.code === formData.state)?.name}. This is required by state law.
            </div>
          ) : (
            <p style={styles.stateNote}>Required for legal compliance</p>
          )}
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Date of Birth</label>
          <input
            type="date"
            name="dateOfBirth"
            value={formData.dateOfBirth}
            onChange={handleChange}
            required
            style={{
              ...styles.input,
              colorScheme: 'dark',
            }}
            onFocus={(e) => e.target.style.borderColor = '#00d4aa'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
          />
          <p style={styles.dobNote}>You must be 18 or older to participate</p>
        </div>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            autoComplete="new-password"
            minLength="6"
            placeholder="Minimum 6 characters"
            style={styles.input}
            onFocus={(e) => e.target.style.borderColor = '#00d4aa'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
          />
        </div>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Confirm Password</label>
          <input
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            autoComplete="new-password"
            placeholder="Re-enter password"
            style={styles.input}
            onFocus={(e) => e.target.style.borderColor = '#00d4aa'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
          />
        </div>

        <div style={styles.checkboxRow}>
          <input
            type="checkbox"
            name="tosAccepted"
            checked={formData.tosAccepted}
            onChange={handleChange}
            style={styles.checkbox}
            id="tos-checkbox"
          />
          <label htmlFor="tos-checkbox" style={styles.checkboxLabel}>
            I am at least 18 years old and agree to the{' '}
            <Link to="/terms" target="_blank" style={styles.tosLink}>Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" target="_blank" style={styles.tosLink}>Privacy Policy</Link>.
            I understand that BidBlitz involves real-money contests.
          </label>
        </div>
        
        <button 
          type="submit" 
          disabled={loading || isBlockedState}
          style={styles.button}
          onMouseOver={(e) => { if (!loading && !isBlockedState) e.target.style.backgroundColor = '#00ffcc'; }}
          onMouseOut={(e) => { if (!loading && !isBlockedState) e.target.style.backgroundColor = '#00d4aa'; }}
        >
          {loading ? 'Creating account...' : isBlockedState ? 'Unavailable in Your State' : 'Create Account'}
        </button>
      </form>
      
      <p style={styles.footer}>
        Already have an account?{' '}
        <Link to="/login" style={styles.footerLink}>Login</Link>
      </p>
    </div>
  );
};

export default Register;