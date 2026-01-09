import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LineupSlot } from '../domain/teamSetupTypes';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
      <div className="pitch-lines">
        <div className="pitch-penalty left" />
        <div className="pitch-penalty right" />
        <div className="pitch-six left" />
        <div className="pitch-six right" />
        <div className="pitch-spot center" />
        <div className="pitch-spot left" />
        <div className="pitch-spot right" />
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
                backgroundColor: primaryColor,
                borderColor: secondaryColor,
                color: secondaryColor,
                cursor: isInteractive ? 'grab' : 'default',
                ['--token-secondary' as string]: secondaryColor
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
