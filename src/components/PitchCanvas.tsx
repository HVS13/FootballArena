import { useEffect, useRef } from 'react';
import { DEFAULT_PITCH, RenderState } from '../domain/simulationTypes';

type PitchCanvasProps = {
  renderState: RenderState | null;
};

const PitchCanvas = ({ renderState }: PitchCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1f8f4a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const margin = 24;
    const pitchWidth = canvas.width - margin * 2;
    const pitchHeight = canvas.height - margin * 2;
    const scaleX = pitchWidth / DEFAULT_PITCH.width;
    const scaleY = pitchHeight / DEFAULT_PITCH.height;

    const project = (x: number, y: number) => ({
      x: margin + x * scaleX,
      y: margin + y * scaleY
    });

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, margin, pitchWidth, pitchHeight);

    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, margin);
    ctx.lineTo(canvas.width / 2, canvas.height - margin);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 60, 0, Math.PI * 2);
    ctx.stroke();

    if (!renderState) return;

    const teamColors = new Map(renderState.teams.map((team) => [team.id, team.color]));

    for (const player of renderState.players) {
      const pos = project(player.position.x, player.position.y);
      const radius = player.radius * scaleX;
      ctx.fillStyle = teamColors.get(player.teamId) ?? '#ffffff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      const velLength = Math.hypot(player.velocity.x, player.velocity.y) || 1;
      const footOffsetX = (player.velocity.x / velLength) * radius * 0.6;
      const footOffsetY = (player.velocity.y / velLength) * radius * 0.6;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(pos.x + footOffsetX, pos.y + footOffsetY, radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const official of renderState.officials) {
      const pos = project(official.position.x, official.position.y);
      ctx.fillStyle = official.role === 'referee' ? '#fbbf24' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const ballPos = project(renderState.ball.position.x, renderState.ball.position.y);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(ballPos.x, ballPos.y, renderState.ball.radius * scaleX, 0, Math.PI * 2);
    ctx.fill();
  }, [renderState]);

  return <canvas ref={canvasRef} width={960} height={540} className="pitch-canvas" />;
};

export default PitchCanvas;
