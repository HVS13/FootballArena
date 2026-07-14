import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LineupSlot } from '../domain/teamSetupTypes';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const parseHexColor = (value: string) => {
  const hex = value.replace('#', '').trim();
  if (hex.length === 3) {
    const [r, g, b] = hex.split('');
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16)
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  return null;
};

const getReadableTextColor = (value: string) => {
  const rgb = parseHexColor(value);
  if (!rgb) return '#0f172a';
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.6 ? '#0f172a' : '#f8fafc';
};

type FormationPitchProps = {
  slots: LineupSlot[];
  playersById: Record<string, { name: string; shirtNo?: number | null }>;
  primaryColor: string;
  secondaryColor: string;
  interactive?: boolean;
  onPositionChange?: (slotId: string, x: number, y: number) => void;
};

type DragState = {
  slotId: string;
};

const FormationPitch = ({
  slots,
  playersById,
  primaryColor,
  secondaryColor,
  interactive = true,
  onPositionChange
}: FormationPitchProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const isInteractive = interactive && typeof onPositionChange === 'function';
  const tokenTextColor = getReadableTextColor(primaryColor);
  const arcLeftId = useId();
  const arcRightId = useId();

  const labels = useMemo(
    () =>
      slots.map((slot) => {
        const player = slot.playerId ? playersById[slot.playerId] : null;
        const initials = player?.name
          ? player.name
              .split(' ')
              .filter(Boolean)
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
          : slot.label;
        const tokenText = player?.shirtNo ? String(player.shirtNo) : initials;
        const labelText = player?.name ?? slot.label;
        return { tokenText, labelText };
      }),
    [slots, playersById]
  );

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!dragging || !containerRef.current || !onPositionChange) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0.04, 0.96);
      const y = clamp((event.clientY - rect.top) / rect.height, 0.04, 0.96);
      onPositionChange(dragging.slotId, x, y);
    };

    const handleUp = () => {
      if (!dragging) return;
      setDragging(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragging, onPositionChange]);

  return (
    <div className="formation-pitch" ref={containerRef}>
      <div className="pitch-lines" aria-hidden="true">
        <svg viewBox="0 0 105 68" preserveAspectRatio="none">
          <defs>
            <clipPath id={arcLeftId}>
              <rect x="16.5" y="0" width="88.5" height="68" />
            </clipPath>
            <clipPath id={arcRightId}>
              <rect x="0" y="0" width="88.5" height="68" />
            </clipPath>
          </defs>
          <rect className="pitch-outline" x="0" y="0" width="105" height="68" />
          <line className="pitch-half" x1="52.5" y1="0" x2="52.5" y2="68" />
          <circle className="pitch-center-circle" cx="52.5" cy="34" r="9.15" />
          <circle className="pitch-spot" cx="52.5" cy="34" r="0.35" />
          <rect className="pitch-box" x="0" y="13.84" width="16.5" height="40.32" />
          <rect className="pitch-box" x="88.5" y="13.84" width="16.5" height="40.32" />
          <rect className="pitch-six" x="0" y="24.84" width="5.5" height="18.32" />
          <rect className="pitch-six" x="99.5" y="24.84" width="5.5" height="18.32" />
          <circle className="pitch-spot" cx="11" cy="34" r="0.35" />
          <circle className="pitch-spot" cx="94" cy="34" r="0.35" />
          <circle className="pitch-arc" cx="11" cy="34" r="9.15" clipPath={`url(#${arcLeftId})`} />
          <circle className="pitch-arc" cx="94" cy="34" r="9.15" clipPath={`url(#${arcRightId})`} />
          <path className="pitch-corner" d="M 0 1 A 1 1 0 0 1 1 0" />
          <path className="pitch-corner" d="M 104 0 A 1 1 0 0 1 105 1" />
          <path className="pitch-corner" d="M 0 67 A 1 1 0 0 0 1 68" />
          <path className="pitch-corner" d="M 104 68 A 1 1 0 0 0 105 67" />
        </svg>
      </div>
      {slots.map((slot, index) => (
        <div
          key={slot.id}
          className="player-token-wrap"
          style={
            {
              left: `${slot.position.x * 100}%`,
              top: `${slot.position.y * 100}%`
            } as CSSProperties
          }
        >
          <button
            type="button"
            className="player-token"
            style={
            {
              cursor: isInteractive ? 'grab' : 'default',
              ['--token-primary' as string]: primaryColor,
              ['--token-secondary' as string]: secondaryColor,
              ['--token-text' as string]: tokenTextColor
            } as CSSProperties
          }
            onPointerDown={
              isInteractive
                ? (event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragging({ slotId: slot.id });
                  }
                : undefined
            }
            aria-label={labels[index]?.labelText ?? slot.label}
          >
            <span>{labels[index]?.tokenText ?? slot.label}</span>
          </button>
          <div className="player-token-label">{labels[index]?.labelText ?? slot.label}</div>
        </div>
      ))}
    </div>
  );
};

export default FormationPitch;
