// frontend/src/components/Cosmetics/CosmeticsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { selectAuthUser } from '../../store/slices/authSlice';
import axios from 'axios';

// ============================================
// STAMP DEFINITIONS
// ============================================
const STAMPS = [
  {
    id: null,
    name: 'Default',
    description: 'The classic BidBlitz drafted card. Clean and simple.',
    unlockMethod: 'Available to all players',
    alwaysUnlocked: true,
    color: '#00d4ff',
    glow: 'rgba(0, 212, 255, 0.3)',
  },
  {
    id: 'beta_tester',
    name: 'Matrix',
    description: 'Green rain cascading through the digital void. OG status.',
    unlockMethod: 'Awarded to beta testers',
    alwaysUnlocked: false,
    color: '#00ff41',
    glow: 'rgba(0, 255, 65, 0.3)',
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'The ultimate flex. Shimmer and floating particles mark true dominance.',
    unlockMethod: 'Most Cash Game wins per season, or 1st place in Market Mover tournament',
    alwaysUnlocked: false,
    color: '#ffd700',
    glow: 'rgba(255, 215, 0, 0.3)',
  },
];

// ============================================
// MINI STAMP PREVIEW COMPONENTS
// ============================================

const DefaultPreview = ({ isSelected }) => (
  <div style={{
    width: '100%',
    height: '100%',
    background: '#2a3040',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    border: isSelected ? '2px solid #00d4ff' : '2px solid #3a3f4e',
    transition: 'border-color 0.3s',
    padding: '12px 10px',
  }}>
    {/* Position badge top-right */}
    <div style={{ 
      position: 'absolute', 
      top: '6px', 
      right: '6px', 
      background: '#44cc44', 
      color: '#fff', 
      fontSize: '8px', 
      fontWeight: '800', 
      padding: '2px 5px', 
      borderRadius: '4px' 
    }}>
      QB
    </div>
    
    {/* Player name */}
    <div style={{ 
      color: '#ccd6f6', 
      fontWeight: '600', 
      fontSize: '13px', 
      marginTop: '4px',
      textAlign: 'center',
    }}>
      Josh Allen
    </div>
    
    {/* Drafted overlay */}
    <div style={{ 
      color: '#8892b0', 
      fontSize: '10px', 
      letterSpacing: '2px',
      fontWeight: '700',
      opacity: 0.6,
    }}>
      DRAFTED
    </div>
    
    {/* Team info */}
    <div style={{ color: '#8892b0', fontSize: '10px' }}>
      BUF - $5
    </div>
  </div>
);

const MatrixPreview = ({ isSelected }) => {
  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  const columns = 8;
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#0a0a0a',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      overflow: 'hidden',
      border: isSelected ? '2px solid #00ff41' : '2px solid #0a3d0a',
      transition: 'border-color 0.3s',
    }}>
      {Array.from({ length: columns }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: '-20px',
            left: `${(i / columns) * 100}%`,
            width: `${100 / columns}%`,
            height: '140%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            animation: `matrixFall ${2 + Math.random() * 3}s linear infinite`,
            animationDelay: `${-Math.random() * 5}s`,
            opacity: 0.25 + Math.random() * 0.15,
            fontSize: '9px',
            color: '#00ff41',
            lineHeight: '12px',
            pointerEvents: 'none',
          }}
        >
          {Array.from({ length: 12 }).map((_, j) => (
            <span key={j}>{chars[Math.floor(Math.random() * chars.length)]}</span>
          ))}
        </div>
      ))}
      
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <div style={{ color: '#00ff41', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px', textShadow: '0 0 8px rgba(0,255,65,0.6)' }}>
          Josh Allen
        </div>
        <div style={{ 
          color: '#00ff41', 
          fontSize: '11px', 
          letterSpacing: '3px',
          fontWeight: '800',
          textShadow: '0 0 10px rgba(0,255,65,0.8)',
        }}>
          DRAFTED
        </div>
        <div style={{ color: '#00ff41', fontSize: '10px', marginTop: '6px', opacity: 0.8 }}>
          BUF - $5
        </div>
      </div>
    </div>
  );
};

const GoldPreview = ({ isSelected }) => (
  <div style={{
    width: '100%',
    height: '100%',
    background: 'linear-gradient(145deg, #1a1400 0%, #2a1f00 40%, #1a1400 100%)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    border: isSelected ? '2px solid #ffd700' : '2px solid #4a3800',
    transition: 'border-color 0.3s',
  }}>
    <div style={{
      position: 'absolute',
      top: 0,
      left: '-100%',
      width: '60%',
      height: '100%',
      background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.08), transparent)',
      animation: 'goldShimmer 3s ease-in-out infinite',
      pointerEvents: 'none',
    }} />
    
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        style={{
          position: 'absolute',
          width: '3px',
          height: '3px',
          borderRadius: '50%',
          background: '#ffd700',
          opacity: 0.4,
          left: `${15 + Math.random() * 70}%`,
          bottom: '-5px',
          animation: `goldFloat ${3 + Math.random() * 2}s ease-in-out infinite`,
          animationDelay: `${-Math.random() * 4}s`,
          pointerEvents: 'none',
        }}
      />
    ))}
    
    <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
      <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px', textShadow: '0 0 8px rgba(255,215,0,0.5)' }}>
        Josh Allen
      </div>
      <div style={{ 
        color: '#ffd700', 
        fontSize: '11px', 
        letterSpacing: '3px',
        fontWeight: '800',
        textShadow: '0 0 10px rgba(255,215,0,0.7)',
      }}>
        DRAFTED
      </div>
      <div style={{ color: '#ffd700', fontSize: '10px', marginTop: '6px', opacity: 0.8 }}>
        BUF - $5
      </div>
    </div>
  </div>
);

const PREVIEW_MAP = {
  null: DefaultPreview,
  'beta_tester': MatrixPreview,
  'gold': GoldPreview,
};

// ============================================
// STAMP CARD COMPONENT
// ============================================
const StampCard = ({ stamp, isEquipped, isUnlocked, onEquip, saving }) => {
  const [hovered, setHovered] = useState(false);
  const PreviewComponent = PREVIEW_MAP[stamp.id] || DefaultPreview;
  
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: isEquipped 
          ? `linear-gradient(135deg, ${stamp.color}14 0%, #1a1f2e 100%)`
          : '#1a1f2e',
        border: isEquipped 
          ? `2px solid ${stamp.color}` 
          : `2px solid ${hovered && isUnlocked ? '#3a3f4e' : '#2a2f3e'}`,
        borderRadius: '16px',
        padding: '20px',
        transition: 'all 0.3s ease',
        transform: hovered && isUnlocked ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: isEquipped
          ? `0 0 20px ${stamp.glow}, 0 8px 32px rgba(0,0,0,0.3)`
          : hovered && isUnlocked
            ? '0 8px 24px rgba(0,0,0,0.3)'
            : '0 2px 8px rgba(0,0,0,0.2)',
        opacity: isUnlocked ? 1 : 0.5,
        cursor: isUnlocked ? 'pointer' : 'not-allowed',
        filter: isUnlocked ? 'none' : 'grayscale(0.6)',
      }}
      onClick={() => isUnlocked && !saving && onEquip(stamp.id)}
    >
      {/* Equipped badge */}
      {isEquipped && (
        <div style={{
          position: 'absolute',
          top: '-10px',
          right: '-10px',
          background: stamp.color,
          color: '#0a0e1b',
          fontSize: '10px',
          fontWeight: '800',
          padding: '4px 10px',
          borderRadius: '20px',
          letterSpacing: '1px',
          boxShadow: `0 2px 10px ${stamp.glow}`,
          zIndex: 5,
        }}>
          EQUIPPED
        </div>
      )}

      {/* Lock icon */}
      {!isUnlocked && (
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          fontSize: '18px',
          zIndex: 5,
        }}>
          🔒
        </div>
      )}

      {/* Preview area */}
      <div style={{
        width: '100%',
        height: '120px',
        marginBottom: '16px',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        <PreviewComponent isSelected={isEquipped} />
      </div>

      {/* Stamp name */}
      <h3 style={{ 
        color: isUnlocked ? '#ccd6f6' : '#556677',
        margin: '0 0 8px 0', 
        fontSize: '16px', 
        fontWeight: '700',
      }}>
        {stamp.name}
      </h3>
      
      {/* Description */}
      <p style={{ 
        color: isUnlocked ? '#8892b0' : '#445566',
        margin: '0 0 4px 0', 
        fontSize: '12px', 
        lineHeight: '1.5',
      }}>
        {stamp.description}
      </p>

      {/* Unlock method - always shown for non-default stamps */}
      {stamp.id !== null && (
        <p style={{ 
          color: isUnlocked ? '#667788' : '#445566',
          margin: '4px 0 0 0', 
          fontSize: '11px', 
          lineHeight: '1.4',
          fontStyle: 'italic',
        }}>
          {stamp.unlockMethod}
        </p>
      )}

      {/* Equip button (for unlocked, non-equipped stamps) */}
      {isUnlocked && !isEquipped && (
        <button
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            onEquip(stamp.id);
          }}
          style={{
            width: '100%',
            marginTop: '12px',
            padding: '8px',
            background: `${stamp.color}18`,
            color: stamp.color,
            border: `1px solid ${stamp.color}50`,
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '12px',
            cursor: saving ? 'wait' : 'pointer',
            transition: 'all 0.2s',
            opacity: saving ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!saving) {
              e.target.style.background = `${stamp.color}30`;
              e.target.style.borderColor = `${stamp.color}90`;
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.background = `${stamp.color}18`;
            e.target.style.borderColor = `${stamp.color}50`;
          }}
        >
          {saving ? 'Saving...' : 'Equip'}
        </button>
      )}
    </div>
  );
};

// ============================================
// MAIN COSMETICS PAGE
// ============================================
const CosmeticsPage = () => {
  const user = useSelector(selectAuthUser);
  const navigate = useNavigate();
  const [equippedStamp, setEquippedStamp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [unlockedStamps, setUnlockedStamps] = useState(new Set([null]));

  const handleEquip = useCallback(async (stampId) => {
    if (saving) return;
    setSaving(true);
    setToast(null);

    try {
      const res = await axios.put('/api/users/cosmetics', { equipped_stamp: stampId });

      if (res.data) {
        setEquippedStamp(res.data.equipped_stamp || null);
        
        const stampName = STAMPS.find(s => s.id === stampId)?.name || 'Default';
        setToast({ type: 'success', message: `${stampName} stamp equipped!` });
      }
    } catch (err) {
      console.error('Failed to equip stamp:', err);
      const message = err.response?.data?.error || 'Network error. Please try again.';
      setToast({ type: 'error', message });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [saving]);

  useEffect(() => {
    const fetchUnlocked = async () => {
      try {
        const res = await axios.get('/api/users/cosmetics');
        const data = res.data;
        const set = new Set([null]); // Default always unlocked
        if (data.unlocked_stamps) {
          data.unlocked_stamps.forEach(s => set.add(s));
        }
        // Also add equipped (it must be unlocked if equipped)
        if (data.equipped_stamp) set.add(data.equipped_stamp);
        setUnlockedStamps(set);
        setEquippedStamp(data.equipped_stamp || null);
      } catch (err) {
        console.error('Failed to fetch unlocked stamps:', err);
      }
    };
    if (user) fetchUnlocked();
  }, [user?.id]);

  return (
    <div style={{ 
      minHeight: '100vh',
      padding: '2rem',
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      {/* CSS Animations */}
      <style>{`
        @keyframes matrixFall {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes goldShimmer {
          0% { left: -100%; }
          50% { left: 150%; }
          100% { left: 150%; }
        }
        @keyframes goldFloat {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          20% { opacity: 0.6; }
          80% { opacity: 0.3; }
          100% { transform: translateY(-80px) scale(0.5); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '2rem', animation: 'fadeIn 0.4s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'none',
              border: 'none',
              color: '#8892b0',
              fontSize: '14px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.color = '#00d4ff'}
            onMouseLeave={(e) => e.target.style.color = '#8892b0'}
          >
            ← Dashboard
          </button>
        </div>
        <h1 style={{ 
          color: '#ccd6f6',
          margin: '0 0 8px 0',
          fontSize: '28px',
          fontWeight: '700',
        }}>
          Cosmetics
        </h1>
        <p style={{ 
          color: '#8892b0',
          margin: 0,
          fontSize: '14px',
        }}>
          Customize how your drafted players appear on the board.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '24px',
          padding: '12px 20px',
          borderRadius: '10px',
          background: toast.type === 'success' ? 'rgba(0, 255, 65, 0.15)' : 'rgba(255, 68, 68, 0.15)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(0, 255, 65, 0.3)' : 'rgba(255, 68, 68, 0.3)'}`,
          color: toast.type === 'success' ? '#00ff41' : '#ff4444',
          fontSize: '13px',
          fontWeight: '600',
          zIndex: 1000,
          animation: 'fadeIn 0.3s ease',
          backdropFilter: 'blur(8px)',
        }}>
          {toast.message}
        </div>
      )}

      {/* Section: Draft Stamps */}
      <div style={{ marginBottom: '3rem', animation: 'fadeIn 0.5s ease 0.1s both' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          marginBottom: '20px',
        }}>
          <h2 style={{ color: '#ccd6f6', margin: 0, fontSize: '18px', fontWeight: '600' }}>
            Draft Stamps
          </h2>
          <span style={{ 
            fontSize: '11px', 
            color: '#8892b0', 
            background: '#2a2f3e', 
            padding: '3px 10px', 
            borderRadius: '20px' 
          }}>
            {unlockedStamps.size} / {STAMPS.length} unlocked
          </span>
        </div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '20px',
        }}>
          {STAMPS.map((stamp, index) => (
            <div key={stamp.id || 'default'} style={{ animation: `fadeIn 0.4s ease ${0.15 + index * 0.08}s both` }}>
              <StampCard
                stamp={stamp}
                isEquipped={equippedStamp === stamp.id}
                isUnlocked={stamp.alwaysUnlocked || unlockedStamps.has(stamp.id)}
                onEquip={handleEquip}
                saving={saving}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Section: Coming Soon */}
      <div style={{ animation: 'fadeIn 0.5s ease 0.4s both' }}>
        <h2 style={{ color: '#ccd6f6', margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
          Coming Soon
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '20px',
        }}>
          <div style={{
            background: '#1a1f2e',
            border: '2px dashed #2a2f3e',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center',
            opacity: 0.6,
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>👤</div>
            <h3 style={{ color: '#556677', margin: '0 0 4px 0', fontSize: '14px' }}>Draft Avatars</h3>
            <p style={{ color: '#445566', margin: 0, fontSize: '12px' }}>
              Custom profile pictures for the live draft tracker
            </p>
          </div>
          
          <div style={{
            background: '#1a1f2e',
            border: '2px dashed #2a2f3e',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center',
            opacity: 0.6,
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>💬</div>
            <h3 style={{ color: '#556677', margin: '0 0 4px 0', fontSize: '14px' }}>Draft Emotes</h3>
            <p style={{ color: '#445566', margin: 0, fontSize: '12px' }}>
              React in real-time during live drafts
            </p>
          </div>
          
          <div style={{
            background: '#1a1f2e',
            border: '2px dashed #2a2f3e',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center',
            opacity: 0.6,
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎨</div>
            <h3 style={{ color: '#556677', margin: '0 0 4px 0', fontSize: '14px' }}>Board Themes</h3>
            <p style={{ color: '#445566', margin: 0, fontSize: '12px' }}>
              Custom color schemes for your draft board
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CosmeticsPage;