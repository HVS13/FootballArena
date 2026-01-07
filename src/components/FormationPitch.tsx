import { useEffect, useRef, useState } from 'react';
import { LineupSlot } from '../domain/teamSetupTypes';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type FormationPitchProps = {
  slots: LineupSlot[];
  color: string;
  onPositionChange: (slotId: string, x: number, y: number) => void;
};

type DragState = {
  slotId: string;
};

const FormationPitch = ({ slots, color, onPositionChange }: FormationPitchProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0.04, 0.96);
      const y = clamp((event.clientY - rect.top) / rect.height, 0.04, 0.96);
      onPositionChange(dragging.slotId, x, y);
    };

    const handleUp = () => {
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
      <div className="pitch-lines" />
      {slots.map((slot) => (
        <button
          key={slot.id}
          type="button"
          className="player-token"
          style={{
            left: `${slot.position.x * 100}%`,
            top: `${slot.position.y * 100}%`,
            backgroundColor: color
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging({ slotId: slot.id });
          }}
        >
          <span>{slot.label}</span>
        </button>
      ))}
    </div>
  );
};

export default FormationPitch;
