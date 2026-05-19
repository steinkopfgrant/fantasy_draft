import React from 'react';

const PrizeBreakdownModal = ({ contest, onClose }) => {
  if (!contest) return null;

  const prizes = contest.prizes || [];
  const totalPaid = prizes.reduce((a, b) => a + Number(b), 0);
  const entryFee = contest.entryFee || 0;
  const maxEntries = contest.maxEntries || contest.max_entries || 0;
  const grossPool = entryFee * maxEntries;
  const rake = grossPool - totalPaid;

  // Collapse consecutive equal payouts into ranges (e.g. "6-10: $15")
  const rows = [];
  let i = 0;
  while (i < prizes.length) {
    const amount = Number(prizes[i]);
    let j = i;
    while (j + 1 < prizes.length && Number(prizes[j + 1]) === amount) j++;
    rows.push({
      place: i === j ? `${i + 1}` : `${i + 1}-${j + 1}`,
      count: j - i + 1,
      amount,
      total: amount * (j - i + 1)
    });
    i = j + 1;
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a202c', borderRadius: '12px', padding: '24px',
          maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: '20px' }}>{contest.name}</h2>
            <div style={{ color: '#a0aec0', fontSize: '13px', marginTop: '4px' }}>Prize Breakdown</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#a0aec0', fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ background: 'rgba(72,187,120,0.08)', border: '1px solid rgba(72,187,120,0.25)', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
          <div><span style={{ color: '#a0aec0' }}>Entry:</span> <span style={{ color: '#fff', fontWeight: '600' }}>${entryFee}</span></div>
          <div><span style={{ color: '#a0aec0' }}>Field:</span> <span style={{ color: '#fff', fontWeight: '600' }}>{maxEntries.toLocaleString()}</span></div>
          <div><span style={{ color: '#a0aec0' }}>Prize Pool:</span> <span style={{ color: '#48bb78', fontWeight: '600' }}>${totalPaid.toLocaleString()}</span></div>
          <div><span style={{ color: '#a0aec0' }}>Paid Places:</span> <span style={{ color: '#fff', fontWeight: '600' }}>{prizes.length}</span></div>
        </div>

        {prizes.length === 0 ? (
          <div style={{ color: '#a0aec0', textAlign: 'center', padding: '20px' }}>
            Prize structure not yet defined for this contest.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#a0aec0', fontSize: '12px', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px' }}>Place</th>
                <th style={{ textAlign: 'right', padding: '8px 4px' }}>Prize</th>
                <th style={{ textAlign: 'right', padding: '8px 4px' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 4px', color: '#fff', fontWeight: idx === 0 ? '700' : '500' }}>
                    {idx === 0 && '🏆 '}{row.place}
                  </td>
                  <td style={{ padding: '10px 4px', textAlign: 'right', color: idx === 0 ? '#fbbf24' : '#48bb78', fontWeight: '600' }}>
                    ${row.amount.toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 4px', textAlign: 'right', color: '#a0aec0' }}>
                    {row.count > 1 ? `$${row.total.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)' }}>
                <td style={{ padding: '12px 4px', color: '#a0aec0', fontSize: '12px' }}>TOTAL PAYOUTS</td>
                <td colSpan={2} style={{ padding: '12px 4px', textAlign: 'right', color: '#48bb78', fontWeight: '700', fontSize: '15px' }}>
                  ${totalPaid.toFixed(2)}
                </td>
              </tr>
              {rake > 0 && (
                <tr>
                  <td style={{ padding: '4px', color: '#718096', fontSize: '11px' }}>Rake</td>
                  <td colSpan={2} style={{ padding: '4px', textAlign: 'right', color: '#718096', fontSize: '11px' }}>
                    ${rake.toFixed(2)} ({((rake/grossPool)*100).toFixed(1)}%)
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
};

export default PrizeBreakdownModal;