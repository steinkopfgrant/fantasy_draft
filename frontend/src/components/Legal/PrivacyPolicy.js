import React from 'react';
import './LegalPages.css';

const PrivacyPolicy = () => {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last Updated: February 23, 2026</p>

        <section>
          <h2>1. Introduction</h2>
          <p>
            BidBlitz LLC ("we," "us," or "our") is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information 
            when you use the BidBlitz platform ("the Platform"). Please read this policy carefully.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          
          <h3>Information You Provide</h3>
          <ul>
            <li><strong>Account Information:</strong> Name, email address, username, password, date of birth, and mailing address</li>
            <li><strong>Payment Information:</strong> Credit/debit card details, bank account information, and cryptocurrency wallet addresses (processed securely through our payment providers)</li>
            <li><strong>Identity Verification:</strong> Government-issued ID, Social Security Number (last 4 digits), and other verification documents as required</li>
            <li><strong>Communications:</strong> Messages you send to our support team or other users</li>
          </ul>

          <h3>Information Collected Automatically</h3>
          <ul>
            <li><strong>Device Information:</strong> IP address, browser type, operating system, device identifiers</li>
            <li><strong>Usage Data:</strong> Pages visited, features used, contest participation, draft activity, and interaction patterns</li>
            <li><strong>Location Data:</strong> Approximate location based on IP address (used for eligibility verification)</li>
            <li><strong>Cookies & Tracking:</strong> We use cookies and similar technologies to maintain sessions and improve the Platform experience</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve the Platform</li>
            <li>Process transactions, deposits, and withdrawals</li>
            <li>Verify your identity and eligibility to participate in contests</li>
            <li>Prevent fraud, collusion, and abuse</li>
            <li>Send you contest updates, results, and account notifications</li>
            <li>Respond to your support inquiries</li>
            <li>Comply with legal obligations and regulatory requirements</li>
            <li>Analyze usage patterns to improve features and user experience</li>
            <li>Send marketing communications (with your consent, which you can withdraw at any time)</li>
          </ul>
        </section>

        <section>
          <h2>4. How We Share Your Information</h2>
          <p>We do not sell your personal information. We may share your information with:</p>
          <ul>
            <li><strong>Payment Processors:</strong> Stripe and other payment providers to process transactions</li>
            <li><strong>Service Providers:</strong> Third-party services that help us operate the Platform (hosting, analytics, error monitoring, email delivery)</li>
            <li><strong>Legal Compliance:</strong> Law enforcement, regulators, or other parties when required by law or to protect our rights</li>
            <li><strong>Contest Results:</strong> Usernames and contest standings are visible to other participants</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
          </ul>
        </section>

        <section>
          <h2>5. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your information, including:
          </p>
          <ul>
            <li>Encryption of data in transit (TLS/SSL) and at rest</li>
            <li>Secure password hashing</li>
            <li>Regular security audits and monitoring</li>
            <li>Access controls limiting employee access to personal data</li>
          </ul>
          <p>
            However, no method of transmission over the Internet or electronic storage is 100% secure. 
            We cannot guarantee absolute security of your data.
          </p>
        </section>

        <section>
          <h2>6. Data Retention</h2>
          <p>
            We retain your personal information for as long as your account is active or as needed to 
            provide services. We may retain certain information after account closure as required by law, 
            for fraud prevention, or to resolve disputes. Financial transaction records are retained for 
            a minimum of 7 years for tax and regulatory compliance.
          </p>
        </section>

        <section>
          <h2>7. Your Rights & Choices</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
            <li><strong>Correction:</strong> Request correction of inaccurate personal data</li>
            <li><strong>Deletion:</strong> Request deletion of your personal data (subject to legal retention requirements)</li>
            <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications at any time</li>
            <li><strong>Data Portability:</strong> Request your data in a portable format</li>
          </ul>
          <p>
            To exercise these rights, contact us at{' '}
            <a href="mailto:support@bidblitz.io">support@bidblitz.io</a>.
          </p>
        </section>

        <section>
          <h2>8. Children's Privacy</h2>
          <p>
            The Platform is not intended for anyone under the age of 18. We do not knowingly collect 
            personal information from minors. If we learn that we have collected information from a 
            person under 18, we will delete it immediately.
          </p>
        </section>

        <section>
          <h2>9. Third-Party Links</h2>
          <p>
            The Platform may contain links to third-party websites or services. We are not responsible 
            for the privacy practices of these third parties. We encourage you to review their privacy 
            policies before providing any personal information.
          </p>
        </section>

        <section>
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes 
            via email or in-app notification. Your continued use of the Platform after changes are posted 
            constitutes acceptance of the revised policy.
          </p>
        </section>

        <section>
          <h2>11. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at{' '}
            <a href="mailto:support@bidblitz.io">support@bidblitz.io</a>.
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;