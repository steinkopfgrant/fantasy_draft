import React, { useState } from 'react';
import './LegalPages.css';

const Support = () => {
  const [expandedFaq, setExpandedFaq] = useState(null);

  const faqs = [
    {
      q: "How do Cash Games work?",
      a: "Cash Games are 5-player winner-take-all auction drafts. Pay a $5 entry fee, draft your team through our unique auction board, and compete against 4 other players. The player with the highest-scoring roster wins the prize pool."
    },
    {
      q: "How does the draft work?",
      a: "Each draft presents a board of players across different price tiers ($1-$5) and positions. Players take turns selecting athletes within a budget. Strategy comes from choosing the right combination of high-priced stars and value picks to build the best possible roster."
    },
    {
      q: "How do I deposit funds?",
      a: "Go to your Dashboard and click 'Deposit'. We accept credit/debit cards and cryptocurrency (Solana). Deposits are processed instantly for cards and within minutes for crypto."
    },
    {
      q: "How do I withdraw my winnings?",
      a: "Navigate to 'Withdraw' from your Dashboard. Select your preferred withdrawal method and enter the amount. Withdrawals are typically processed within 5-10 business days. First-time withdrawals may require identity verification."
    },
    {
      q: "What sports are available?",
      a: "We currently support NBA, NFL, and MLB fantasy contests. More sports will be added over time. Check the lobby for currently active contests."
    },
    {
      q: "How is scoring calculated?",
      a: "Scoring is based on real player statistics from live games. Points are awarded for stats like points, rebounds, assists (NBA), touchdowns, yards (NFL), etc. Full scoring breakdowns are available on our Rules page."
    },
    {
      q: "Is BidBlitz legal?",
      a: "BidBlitz operates as a skill-based fantasy sports platform, which is legal in the majority of U.S. states. However, some states restrict or prohibit paid fantasy sports. It's your responsibility to ensure participation is legal in your jurisdiction."
    },
    {
      q: "What happens if a player in my lineup gets injured?",
      a: "If a player in your drafted roster is ruled out before games lock, our injury swap system may automatically replace them with an eligible substitute to keep your lineup competitive."
    },
    {
      q: "Can I play on mobile?",
      a: "Yes! BidBlitz is fully optimized for mobile browsers. Simply visit bidblitz.io on your phone's browser. You can also add it to your home screen for an app-like experience."
    },
    {
      q: "How do I set deposit limits or self-exclude?",
      a: "Visit our Responsible Gaming page to set deposit limits or request self-exclusion. You can also contact support@bidblitz.io for assistance with responsible gaming tools."
    }
  ];

  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1>Support</h1>
        <p className="legal-subtitle">
          Need help? We're here for you. Find answers below or reach out directly.
        </p>

        <section className="support-contact-section">
          <div className="support-contact-cards">
            <div className="support-contact-card">
              <span className="support-icon">📧</span>
              <h3>Email Support</h3>
              <p>Our team typically responds within 24 hours</p>
              <a href="mailto:support@bidblitz.io" className="support-link">
                support@bidblitz.io
              </a>
            </div>
            <div className="support-contact-card">
              <span className="support-icon">📋</span>
              <h3>Rules & Scoring</h3>
              <p>Full breakdown of contest rules and scoring</p>
              <a href="/rules" className="support-link">
                View Rules
              </a>
            </div>
            <div className="support-contact-card">
              <span className="support-icon">🛡️</span>
              <h3>Responsible Gaming</h3>
              <p>Tools to manage your gaming activity</p>
              <a href="/responsible-gaming" className="support-link">
                Learn More
              </a>
            </div>
          </div>
        </section>

        <section>
          <h2>Frequently Asked Questions</h2>
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className={`faq-item ${expandedFaq === index ? 'faq-expanded' : ''}`}
                onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
              >
                <div className="faq-question">
                  <span>{faq.q}</span>
                  <span className="faq-toggle">{expandedFaq === index ? '−' : '+'}</span>
                </div>
                {expandedFaq === index && (
                  <div className="faq-answer">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>Report a Bug or Issue</h2>
          <p>
            Found something that doesn't look right? We appreciate bug reports — they help us 
            improve the platform for everyone. Please email{' '}
            <a href="mailto:support@bidblitz.io">support@bidblitz.io</a> with:
          </p>
          <ul>
            <li>A description of the issue</li>
            <li>Steps to reproduce it</li>
            <li>Your device/browser information</li>
            <li>Screenshots if possible</li>
          </ul>
        </section>

        <section>
          <h2>Account Issues</h2>
          <p>
            For account-related concerns including password resets, withdrawal issues, 
            identity verification, or account restrictions, contact{' '}
            <a href="mailto:support@bidblitz.io">support@bidblitz.io</a> with your 
            username and a detailed description of the issue.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Support;