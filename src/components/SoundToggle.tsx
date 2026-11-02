import { useEffect, useState } from 'react';
import { isMuted, onMuted, setMuted, unlockAudio } from '../audio/sound';

/** 🔊 SOUND / 🔇 MUTED (remembered on this device) */
export function SoundToggle({ compact }: { compact?: boolean }) {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMuted(setM), []);
  return (
    <button
      className={`sound-toggle ${m ? 'off' : ''} ${compact ? 'compact' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        unlockAudio();
        setMuted(!m);
      }}
      aria-pressed={!m}
      data-testid="sound-toggle"
    >
      {m ? '🔇' : '🔊'}
      {!compact && <span>{m ? 'MUTED' : 'SOUND'}</span>}
    </button>
  );
}
