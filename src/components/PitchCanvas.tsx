import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PITCH, RenderState } from '../domain/simulationTypes';

type PitchCanvasProps = {
  renderState: RenderState | null;
};

const PITCH_RATIO = DEFAULT_PITCH.width / DEFAULT_PITCH.height;

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

const PitchCanvas = ({ renderState }: PitchCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 622 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const handleResize = () => {
      const width = parent.clientWidth;
      if (!width) return;
      const height = Math.max(280, width / PITCH_RATIO);
      setCanvasSize((prev) => {
        if (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) return prev;
        return { width, height };
      });
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.round(canvasSize.width * dpr);
    const nextHeight = Math.round(canvasSize.height * dpr);
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    if (canvas.style.width !== `${canvasSize.width}px`) {
      canvas.style.width = `${canvasSize.width}px`;
    }
    if (canvas.style.height !== `${canvasSize.height}px`) {
      canvas.style.height = `${canvasSize.height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = canvasSize.width;
    const height = canvasSize.height;
    ctx.clearRect(0, 0, width, height);

    const outerPadding = Math.max(10, Math.min(20, width * 0.02));
    const runoffPadding = Math.max(12, Math.min(26, width * 0.03));
    const margin = outerPadding + runoffPadding;
    const pitchWidth = width - margin * 2;
    const pitchHeight = height - margin * 2;
    const scaleX = pitchWidth / DEFAULT_PITCH.width;
    const scaleY = pitchHeight / DEFAULT_PITCH.height;
    const scale = Math.min(scaleX, scaleY);

    const project = (x: number, y: number) => ({
      x: margin + x * scaleX,
      y: margin + y * scaleY
    });

    const pitchLine = '#e6f4ea';
    const grassDark = '#1f6b3f';
    const grassLight = '#2a7f48';

    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0a1c13');
    bgGradient.addColorStop(1, '#0b2518');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#0f2f1f';
    ctx.fillRect(outerPadding, outerPadding, width - outerPadding * 2, height - outerPadding * 2);

    ctx.fillStyle = grassDark;
    ctx.fillRect(margin, margin, pitchWidth, pitchHeight);

    const stripeCount = 12;
    const stripeHeight = pitchHeight / stripeCount;
    for (let i = 0; i < stripeCount; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? grassLight : grassDark;
      ctx.fillRect(margin, margin + i * stripeHeight, pitchWidth, stripeHeight);
    }

    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      pitchWidth * 0.15,
      width / 2,
      height / 2,
      pitchWidth * 0.65
    );
    vignette.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = vignette;
    ctx.fillRect(margin, margin, pitchWidth, pitchHeight);

    const lineWidth = Math.max(1.4, Math.min(2.4, scale * 0.22));
    ctx.strokeStyle = pitchLine;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(margin, margin, pitchWidth, pitchHeight);

    ctx.beginPath();
    ctx.moveTo(width / 2, margin);
    ctx.lineTo(width / 2, height - margin);
    ctx.stroke();

    const center = project(DEFAULT_PITCH.width / 2, DEFAULT_PITCH.height / 2);
    ctx.beginPath();
    ctx.arc(center.x, center.y, 9.15 * scale, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center.x, center.y, 0.8 * scale, 0, Math.PI * 2);
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
    ctx.arc(leftPenalty.x, leftPenalty.y, 0.6 * scale, 0, Math.PI * 2);
    ctx.arc(rightPenalty.x, rightPenalty.y, 0.6 * scale, 0, Math.PI * 2);
    ctx.fillStyle = pitchLine;
    ctx.fill();

    const drawPenaltyArc = (isLeft: boolean) => {
      const radius = 9.15 * scale;
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

    const cornerRadius = 1 * scale;
    const drawCornerArc = (x: number, y: number, start: number, end: number) => {
      const corner = project(x, y);
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, cornerRadius, start, end);
      ctx.stroke();
    };

    drawCornerArc(0, 0, 0, Math.PI / 2);
    drawCornerArc(DEFAULT_PITCH.width, 0, Math.PI / 2, Math.PI);
    drawCornerArc(0, DEFAULT_PITCH.height, -Math.PI / 2, 0);
    drawCornerArc(DEFAULT_PITCH.width, DEFAULT_PITCH.height, Math.PI, Math.PI * 1.5);

    const goalDepth = 2;
    const goalHalf = 3.66;
    const drawGoal = (x: number, y: number) => {
      const goal = project(x, y);
      ctx.strokeRect(goal.x, goal.y, goalDepth * scaleX, goalHalf * 2 * scaleY);
    };
    ctx.strokeStyle = 'rgba(230, 244, 234, 0.85)';
    ctx.lineWidth = Math.max(1.1, lineWidth * 0.7);
    drawGoal(-goalDepth, DEFAULT_PITCH.height / 2 - goalHalf);
    drawGoal(DEFAULT_PITCH.width, DEFAULT_PITCH.height / 2 - goalHalf);

    if (!renderState) return;

    const teamColors = new Map(
      renderState.teams.map((team) => [team.id, { primary: team.primaryColor, secondary: team.secondaryColor }])
    );

    const drawPentagon = (x: number, y: number, radius: number, rotation = -Math.PI / 2) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const angle = rotation + (Math.PI * 2 * i) / 5;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
    };

    for (const player of renderState.players) {
      const pos = project(player.position.x, player.position.y);
      const radius = player.radius * scale;
      const colors = teamColors.get(player.teamId) ?? { primary: '#f8fafc', secondary: '#0f172a' };
      const textColor = getReadableTextColor(colors.primary);

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = radius * 0.9;
      ctx.shadowOffsetY = radius * 0.4;

      ctx.fillStyle = colors.primary;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-radius * 0.35, -radius * 0.35, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = colors.secondary;
      ctx.lineWidth = Math.max(1.4, radius * 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = Math.max(1, radius * 0.12);
      ctx.beginPath();
      ctx.arc(0, 0, radius - ctx.lineWidth, 0, Math.PI * 2);
      ctx.stroke();

      const velLength = Math.hypot(player.velocity.x, player.velocity.y);
      const directionX = velLength > 0.2 ? player.velocity.x / velLength : 0;
      const directionY = velLength > 0.2 ? player.velocity.y / velLength : 1;
      ctx.fillStyle = colors.secondary;
      ctx.beginPath();
      ctx.arc(directionX * radius * 0.72, directionY * radius * 0.72, radius * 0.2, 0, Math.PI * 2);
      ctx.fill();

      if (player.shirtNo != null) {
        ctx.fillStyle = textColor;
        ctx.font = `600 ${Math.max(8, radius * 1.15)}px "Space Grotesk", "Trebuchet MS", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(player.shirtNo), 0, 0);
      }
      ctx.restore();
    }

    for (const official of renderState.officials) {
      const pos = project(official.position.x, official.position.y);
      ctx.fillStyle = official.role === 'referee' ? '#fbbf24' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const ballPos = project(renderState.ball.position.x, renderState.ball.position.y);
    const ballRadius = renderState.ball.radius * scale;
    ctx.save();
    ctx.translate(ballPos.x, ballPos.y);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = ballRadius * 0.6;
    ctx.shadowOffsetY = ballRadius * 0.3;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = Math.max(0.8, ballRadius * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#111827';
    drawPentagon(0, 0, ballRadius * 0.36);
    const ringRadius = ballRadius * 0.62;
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
      drawPentagon(
        Math.cos(angle) * ringRadius,
        Math.sin(angle) * ringRadius,
        ballRadius * 0.2,
        angle
      );
    }

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-ballRadius * 0.35, -ballRadius * 0.35, ballRadius * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [renderState, canvasSize]);

  return <canvas ref={canvasRef} className="pitch-canvas" />;
};

export default PitchCanvas;
