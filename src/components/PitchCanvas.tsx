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

    const margin = 24;
    const pitchWidth = canvas.width - margin * 2;
    const pitchHeight = canvas.height - margin * 2;
    const scaleX = pitchWidth / DEFAULT_PITCH.width;
    const scaleY = pitchHeight / DEFAULT_PITCH.height;

    const project = (x: number, y: number) => ({
      x: margin + x * scaleX,
      y: margin + y * scaleY
    });

    const grassDark = '#1f6b3f';
    const grassLight = '#2a7f48';
    const pitchLine = '#e6f4ea';
    const background = '#0b2c1c';

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = grassDark;
    ctx.fillRect(margin, margin, pitchWidth, pitchHeight);

    const stripeCount = 8;
    const stripeWidth = pitchWidth / stripeCount;
    for (let i = 0; i < stripeCount; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? grassLight : grassDark;
      ctx.fillRect(margin + i * stripeWidth, margin, stripeWidth, pitchHeight);
    }

    ctx.strokeStyle = pitchLine;
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, margin, pitchWidth, pitchHeight);

    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, margin);
    ctx.lineTo(canvas.width / 2, canvas.height - margin);
    ctx.stroke();

    const center = project(DEFAULT_PITCH.width / 2, DEFAULT_PITCH.height / 2);
    ctx.beginPath();
    ctx.arc(center.x, center.y, 9.15 * scaleX, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center.x, center.y, 0.8 * scaleX, 0, Math.PI * 2);
    ctx.fillStyle = pitchLine;
    ctx.fill();

    const drawBox = (boxWidth: number, boxHeight: number, leftX: number, topY: number) => {
      ctx.strokeRect(
        margin + leftX * scaleX,
        margin + topY * scaleY,
        boxWidth * scaleX,
        boxHeight * scaleY
      );
    };

    const boxHeight = 40.32;
    const boxTop = (DEFAULT_PITCH.height - boxHeight) / 2;
    drawBox(16.5, boxHeight, 0, boxTop);
    drawBox(16.5, boxHeight, DEFAULT_PITCH.width - 16.5, boxTop);

    const sixHeight = 18.32;
    const sixTop = (DEFAULT_PITCH.height - sixHeight) / 2;
    drawBox(5.5, sixHeight, 0, sixTop);
    drawBox(5.5, sixHeight, DEFAULT_PITCH.width - 5.5, sixTop);

    const leftPenalty = project(11, DEFAULT_PITCH.height / 2);
    const rightPenalty = project(DEFAULT_PITCH.width - 11, DEFAULT_PITCH.height / 2);
    ctx.beginPath();
    ctx.arc(leftPenalty.x, leftPenalty.y, 0.6 * scaleX, 0, Math.PI * 2);
    ctx.arc(rightPenalty.x, rightPenalty.y, 0.6 * scaleX, 0, Math.PI * 2);
    ctx.fillStyle = pitchLine;
    ctx.fill();

    const drawPenaltyArc = (isLeft: boolean) => {
      const radius = 9.15 * scaleX;
      const spotX = isLeft ? 11 : DEFAULT_PITCH.width - 11;
      const boxX = isLeft ? 16.5 : DEFAULT_PITCH.width - 16.5;
      const angle = Math.acos((boxX - spotX) / 9.15);
      const startAngle = isLeft ? -angle : Math.PI - angle;
      const endAngle = isLeft ? angle : Math.PI + angle;
      const spot = project(spotX, DEFAULT_PITCH.height / 2);
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, radius, startAngle, endAngle);
      ctx.stroke();
    };

    drawPenaltyArc(true);
    drawPenaltyArc(false);

    if (!renderState) return;

    const teamColors = new Map(
      renderState.teams.map((team) => [team.id, { primary: team.primaryColor, secondary: team.secondaryColor }])
    );

    for (const player of renderState.players) {
      const pos = project(player.position.x, player.position.y);
      const radius = player.radius * scaleX;
      const colors = teamColors.get(player.teamId) ?? { primary: '#f8fafc', secondary: '#0f172a' };
      ctx.fillStyle = colors.primary;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      const velLength = Math.hypot(player.velocity.x, player.velocity.y);
      const directionX = velLength > 0.2 ? player.velocity.x / velLength : 0;
      const directionY = velLength > 0.2 ? player.velocity.y / velLength : 1;
      const footOffsetX = directionX * radius * 0.6;
      const footOffsetY = directionY * radius * 0.6;
      ctx.strokeStyle = colors.secondary;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius - 1, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = colors.secondary;
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
