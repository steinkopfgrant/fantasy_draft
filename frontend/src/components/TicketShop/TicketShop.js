import React, { useState } from 'react';
import './TicketShop.css';

const TicketShop = ({ user, onBack, updateBalance }) => {
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [purchasing, setPurchasing] = useState(false);

  const ticketPackages = [
    { id: 1, tickets: 10, price: 5, bonus: 0 },
    { id: 2, tickets: 25, price: 10, bonus: 5 },
    { id: 3, tickets: 60, price: 20, bonus: 15 },
    { id: 4, tickets: 150, price: 40, bonus: 50 },
    { id: 5, tickets: 400, price: 80, bonus: 150 }
  ];

  const handlePurchase = async (pkg) => {
    if (user.balance < pkg.price) {
      alert('Insufficient balance!');
      return;
    }

    setPurchasing(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/tickets/purchase`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          quantity: pkg.tickets + pkg.bonus,
          price: pkg.price
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Successfully purchased ${pkg.tickets + pkg.bonus} tickets!`);
        updateBalance(data.newBalance);
        // Update tickets count if your updateBalance doesn't handle it
      } else {
        throw new Error(data.error || 'Purchase failed');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert(error.message);
    } finally {
      setPurchasing(false);
    }
  };

  const calculateValue = (pkg) => {
    const totalTickets = pkg.tickets + pkg.bonus;
    const pricePerTicket = (pkg.price / totalTickets).toFixed(2);
    return pricePerTicket;
  };

  return (
    <div className="ticket-shop-container">
      <div className="shop-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h1>Ticket Shop</h1>
        <div className="balance-display">
          <span>Your Balance: ${user?.balance || 0}</span>
          <span>Your Tickets: {user?.tickets || 0} 🎟️</span>
        </div>
      </div>

      <div className="shop-info">
        <h2>What are tickets?</h2>
        <p>Tickets are used for special features in Market Mover contests:</p>
        <ul>
          <li>Vote for BID UP players (1 ticket)</li>
          <li>Check player ownership percentages (1 ticket)</li>
          <li>Get exclusive contest insights</li>
        </ul>
      </div>

      <div className="packages-grid">
        {ticketPackages.map(pkg => {
          const totalTickets = pkg.tickets + pkg.bonus;
          const isAffordable = user?.balance >= pkg.price;
          
          return (
            <div 
              key={pkg.id} 
              className={`package-card ${selectedPackage?.id === pkg.id ? 'selected' : ''} ${!isAffordable ? 'disabled' : ''}`}
              onClick={() => isAffordable && setSelectedPackage(pkg)}
            >
              {pkg.bonus > 0 && (
                <div className="bonus-banner">
                  +{pkg.bonus} BONUS!
                </div>
              )}
              
              <div className="package-tickets">
                <span className="ticket-count">{totalTickets}</span>
                <span className="ticket-label">Tickets</span>
              </div>
              
              <div className="package-price">
                ${pkg.price}
              </div>
              
              <div className="package-value">
                ${calculateValue(pkg)} per ticket
              </div>
              
              {pkg.id === 3 && <div className="popular-badge">Most Popular</div>}
              {pkg.id === 5 && <div className="best-value-badge">Best Value</div>}
              
              <button 
                className="purchase-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePurchase(pkg);
                }}
                disabled={!isAffordable || purchasing}
              >
                {purchasing ? 'Processing...' : isAffordable ? 'Buy Now' : 'Insufficient Funds'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="shop-footer">
        <p className="disclaimer">
          Tickets have no cash value and cannot be withdrawn or transferred.
        </p>
      </div>
    </div>
  );
};

export default TicketShop;