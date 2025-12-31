// frontend/src/components/Effects/LightningTransition.js
import React, { useState, useEffect, useCallback } from 'react';

const LightningTransition = ({ active, onComplete, children }) => {
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    if (active && phase === 'idle') {
      console.log('⚡ LIGHTNING STARTING!');
      setPhase('strike');
      
      // Phase 1: Lightning bolt appears (150ms)
      setTimeout(() => {
        console.log('⚡ FLASH PHASE');
        setPhase('flash');
      }, 150);
      
      // Phase 2: Screen flash (300ms)
      setTimeout(() => {
        console.log('⚡ PEEL PHASE');
        setPhase('peel');
      }, 400);
      
      // Phase 3: Page peels away (800ms total)
      setTimeout(() => {
        console.log('⚡ LIGHTNING COMPLETE!');
        setPhase('done');
        if (onComplete) onComplete();
      }, 1000);
    }
  }, [active, phase, onComplete]);

  useEffect(() => {
    if (!active && phase !== 'idle') {
      setPhase('idle');
    }
  }, [active, phase]);

  const showStrike = phase === 'strike' || phase === 'flash';
  const showFlash = phase === 'flash';
  const showPeel = phase === 'peel';

  console.log('⚡ Current phase:', phase, 'Active:', active);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
      
      {/* Lightning Bolt SVG */}
      {showStrike && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 99999,
            pointerEvents: 'none',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start'
          }}
        >
          <svg
            width="200"
            height="600"
            viewBox="0 0 100 300"
            style={{
              filter: 'drop-shadow(0 0 20px #FFD700) drop-shadow(0 0 40px #FFA500)',
              animation: 'boltDrop 0.2s ease-out forwards'
            }}
          >
            <polygon
              points="50,0 35,100 55,100 30,180 55,180 20,300 80,160 55,160 75,80 50,80 65,0"
              fill="#FFD700"
              stroke="#FFFFFF"
              strokeWidth="3"
            />
          </svg>
        </div>
      )}
      
      {/* Full Screen Yellow/White Flash */}
      {showFlash && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: '#FFD700',
            zIndex: 99998,
            animation: 'flashOut 0.3s ease-out forwards',
            pointerEvents: 'none'
          }}
        />
      )}
      
      {/* Page Peel Effect */}
      {showPeel && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'linear-gradient(135deg, #0a0e1b 0%, #1a1f2e 100%)',
            zIndex: 99997,
            transformOrigin: 'top left',
            animation: 'pagePeelAway 0.6s ease-in forwards',
            pointerEvents: 'none',
            boxShadow: '10px 0 50px rgba(255, 215, 0, 0.5)'
          }}
        />
      )}
      
      <style>
        {`
          @keyframes boltDrop {
            0% {
              transform: translateY(-100vh);
              opacity: 1;
            }
            100% {
              transform: translateY(0);
              opacity: 1;
            }
          }
          
          @keyframes flashOut {
            0% {
              opacity: 1;
            }
            100% {
              opacity: 0;
            }
          }
          
          @keyframes pagePeelAway {
            0% {
              transform: perspective(1500px) rotateY(0deg);
              opacity: 1;
            }
            100% {
              transform: perspective(1500px) rotateY(90deg);
              opacity: 0;
            }
          }
        `}
      </style>
    </div>
  );
};

// Hook to trigger lightning transition
export const useLightningTransition = () => {
  const [isActive, setIsActive] = useState(false);
  const [pendingCallback, setPendingCallback] = useState(null);

  const triggerLightning = useCallback((onCompleteCallback) => {
    console.log('⚡ triggerLightning called!');
    setPendingCallback(() => onCompleteCallback);
    setIsActive(true);
  }, []);

  const handleComplete = useCallback(() => {
    console.log('⚡ handleComplete called!');
    setIsActive(false);
    if (pendingCallback) {
      pendingCallback();
      setPendingCallback(null);
    }
  }, [pendingCallback]);

  return { isActive, triggerLightning, handleComplete };
};

export default LightningTransition;