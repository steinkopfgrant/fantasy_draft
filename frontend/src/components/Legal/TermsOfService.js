import React from 'react';
import './LegalPages.css';

const TermsOfService = () => {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last Updated: February 23, 2026</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using BidBlitz ("the Platform"), operated by BidBlitz LLC ("we," "us," or "our"), 
            you agree to be bound by these Terms of Service. If you do not agree to these terms, 
            do not use the Platform.
          </p>
        </section>

        <section>
          <h2>2. Eligibility</h2>
          <p>
            You must be at least 18 years of age (or the minimum legal age in your jurisdiction) to use BidBlitz. 
            By creating an account, you represent and warrant that you meet this age requirement. 
            BidBlitz is a paid fantasy sports platform and may not be available in all jurisdictions. 
            It is your responsibility to ensure that your use of the Platform complies with all applicable 
            laws in your location.
          </p>
          <p>
            The following U.S. states currently prohibit or restrict paid fantasy sports contests: 
            participation from restricted jurisdictions is not permitted. We reserve the right to 
            verify your identity and location at any time.
          </p>
        </section>

        <section>
          <h2>3. Account Registration</h2>
          <p>
            To use certain features of the Platform, you must register for an account. You agree to:
          </p>
          <ul>
            <li>Provide accurate, current, and complete information during registration</li>
            <li>Maintain and promptly update your account information</li>
            <li>Maintain the security of your password and account</li>
            <li>Accept responsibility for all activities that occur under your account</li>
            <li>Notify us immediately of any unauthorized use of your account</li>
          </ul>
          <p>
            Each person may only maintain one (1) account. Multiple accounts per individual are strictly 
            prohibited and may result in account termination and forfeiture of funds.
          </p>
        </section>

        <section>
          <h2>4. Fantasy Sports Contests</h2>
          <p>
            BidBlitz offers skill-based fantasy sports contests including but not limited to Cash Games 
            and other contest formats. All contests on the Platform are games of skill where outcomes are 
            determined predominantly by the knowledge and skill of participants.
          </p>
          <p>
            <strong>Entry Fees & Prizes:</strong> Contest entry fees and prize structures are displayed 
            before you enter any contest. By entering a contest, you agree to pay the listed entry fee. 
            Prizes are awarded based on contest rules and final standings.
          </p>
          <p>
            <strong>Platform Fee:</strong> BidBlitz retains a platform fee (rake) from each contest's 
            prize pool. The fee amount is disclosed in the contest details.
          </p>
        </section>

        <section>
          <h2>5. Deposits & Withdrawals</h2>
          <p>
            You may deposit funds into your BidBlitz account using approved payment methods. 
            All deposits are final and non-refundable except as required by law or at our discretion.
          </p>
          <p>
            Withdrawal requests are processed according to our withdrawal policy. We may require 
            identity verification before processing withdrawals. Processing times vary by payment method 
            and may take up to 5-10 business days.
          </p>
          <p>
            We reserve the right to withhold funds if we suspect fraud, collusion, abuse of promotions, 
            or violation of these terms.
          </p>
        </section>

        <section>
          <h2>6. Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use automated systems, bots, scripts, or third-party tools to interact with the Platform</li>
            <li>Collude with other users to gain an unfair advantage</li>
            <li>Create multiple accounts or use another person's account</li>
            <li>Engage in any form of fraud, money laundering, or illegal activity</li>
            <li>Attempt to manipulate contest outcomes or exploit bugs</li>
            <li>Harass, threaten, or abuse other users</li>
            <li>Share insider or non-public information to gain competitive advantage</li>
            <li>Circumvent any security features or access restrictions</li>
          </ul>
          <p>
            Violation of these rules may result in immediate account suspension, forfeiture of funds, 
            and permanent ban from the Platform.
          </p>
        </section>

        <section>
          <h2>7. Intellectual Property</h2>
          <p>
            All content, features, and functionality of the Platform — including but not limited to 
            text, graphics, logos, icons, software, and the BidBlitz name — are the exclusive property 
            of BidBlitz LLC and are protected by copyright, trademark, and other intellectual property laws.
          </p>
        </section>

        <section>
          <h2>8. Disclaimer of Warranties</h2>
          <p>
            THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, 
            EITHER EXPRESS OR IMPLIED. WE DO NOT GUARANTEE THAT THE PLATFORM WILL BE UNINTERRUPTED, 
            ERROR-FREE, OR SECURE. YOU USE THE PLATFORM AT YOUR OWN RISK.
          </p>
        </section>

        <section>
          <h2>9. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, BIDBLITZ LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, 
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO 
            LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF YOUR USE OF THE PLATFORM.
          </p>
          <p>
            OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT OF FUNDS IN YOUR ACCOUNT AT THE TIME 
            OF THE CLAIM OR $100, WHICHEVER IS GREATER.
          </p>
        </section>

        <section>
          <h2>10. Dispute Resolution</h2>
          <p>
            Any disputes arising from these Terms or your use of the Platform shall be resolved through 
            binding arbitration in accordance with the rules of the American Arbitration Association. 
            You agree to waive your right to a jury trial and to participate in a class action lawsuit.
          </p>
        </section>

        <section>
          <h2>11. Account Termination</h2>
          <p>
            We may suspend or terminate your account at any time for violation of these Terms or for 
            any other reason at our sole discretion. Upon termination, you may request withdrawal of 
            any undisputed balance in your account, subject to our verification procedures.
          </p>
        </section>

        <section>
          <h2>12. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Material changes will be communicated 
            via email or in-app notification. Your continued use of the Platform after changes are posted 
            constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2>13. Contact Us</h2>
          <p>
            If you have questions about these Terms of Service, please contact us at{' '}
            <a href="mailto:support@bidblitz.io">support@bidblitz.io</a>.
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsOfService;