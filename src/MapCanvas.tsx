import { useEffect, useRef, useState } from 'react';
import { Ambulance, Drone, Point, Rover, Simulation, Victim, samePoint } from './sim';

type MapTool = 'select' | 'victim' | 'obstacle';
type Pan = { x: number; y: number };

interface MapCanvasProps {
  simulation: Simulation;
  revision: number;
  selectedId: string;
  zoom: number;
  pan: Pan;
  showCoordinates: boolean;
  tool: MapTool;
  onPan: (pan: Pan) => void;
  onMapPoint: (point: Point) => void;
  onSelect: (id: string) => void;
}

const roverColors = ['#55d6c2', '#65a9f5', '#f3bd63'];

function drawVehicle(ctx: CanvasRenderingContext2D, point: Point, color: string, selected: boolean, cell: number, ambulance = false) {
  const cx = (point.x + 0.5) * cell;
  const cy = (point.y + 0.5) * cell;
  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.46, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.fillStyle = '#111a19';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  const size = cell * (ambulance ? 0.62 : 0.54);
  ctx.beginPath();
  if (ambulance) ctx.roundRect(cx - size / 2, cy - size / 2, size, size, cell * 0.13);
  else ctx.roundRect(cx - size / 2, cy - size / 2, size, size, cell * 0.19);
  ctx.fill();
  ctx.stroke();
  if (ambulance) {
    ctx.fillStyle = '#f28473';
    ctx.fillRect(cx - cell * 0.035, cy - cell * 0.2, cell * 0.07, cell * 0.4);
    ctx.fillRect(cx - cell * 0.2, cy - cell * 0.035, cell * 0.4, cell * 0.07);
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVictim(ctx: CanvasRenderingContext2D, victim: Victim, cell: number) {
  if (victim.state === 'undiscovered' || victim.state === 'transported') return;
  const cx = (victim.position.x + 0.5) * cell;
  const cy = (victim.position.y + 0.5) * cell;
  const color = victim.state === 'assisting' ? '#f1a765' : victim.state === 'ready' ? '#7fce91' : victim.urgent ? '#ff806e' : '#ffd276';
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.31, 0, Math.PI * 2);
  ctx.fillStyle = `${color}35`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#17201f';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  if (victim.urgent) {
    ctx.fillStyle = '#ff806e';
    ctx.font = `700 ${Math.max(8, cell * 0.43)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', cx, cy + 0.5);
  }
}

export function MapCanvas({ simulation, revision, selectedId, zoom, pan, showCoordinates, tool, onPan, onMapPoint, onSelect }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#18211f';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const cell = Math.min((rect.width - 60) / 26, (rect.height - 48) / 18) * zoom;
    const mapWidth = cell * 26;
    const mapHeight = cell * 18;
    const originX = (rect.width - mapWidth) / 2 + pan.x;
    const originY = (rect.height - mapHeight) / 2 + pan.y;
    ctx.save();
    ctx.translate(originX, originY);
    ctx.beginPath();
    ctx.rect(0, 0, mapWidth, mapHeight);
    ctx.clip();

    for (let y = 0; y < 18; y += 1) {
      for (let x = 0; x < 26; x += 1) {
        const terrain = simulation.terrain[y][x];
        const color = terrain === 1 ? '#344440' : terrain === 3 ? '#3a4540' : terrain === 4 ? '#4b4b40' : '#26332f';
        ctx.fillStyle = color;
        ctx.fillRect(x * cell + 0.7, y * cell + 0.7, cell - 1.4, cell - 1.4);
        if (terrain === 1) {
          ctx.strokeStyle = '#86918a32';
          ctx.lineWidth = 0.7;
          ctx.setLineDash([cell * 0.12, cell * 0.12]);
          ctx.beginPath();
          if (x === 5 || x === 12 || x === 19) {
            ctx.moveTo((x + 0.5) * cell, y * cell + cell * 0.12);
            ctx.lineTo((x + 0.5) * cell, (y + 0.88) * cell);
          } else {
            ctx.moveTo(x * cell + cell * 0.12, (y + 0.5) * cell);
            ctx.lineTo((x + 0.88) * cell, (y + 0.5) * cell);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (terrain === 3) {
          ctx.fillStyle = '#65716b55';
          ctx.fillRect(x * cell + cell * 0.12, y * cell + cell * 0.14, cell * 0.76, cell * 0.12);
          ctx.fillStyle = '#252e2b';
          ctx.fillRect(x * cell + cell * 0.12, y * cell + cell * 0.76, cell * 0.76, cell * 0.1);
        } else if (terrain === 4) {
          ctx.fillStyle = '#c0a98472';
          for (let chip = 0; chip < 3; chip += 1) {
            const offset = cell * (0.2 + chip * 0.18);
            ctx.fillRect(x * cell + offset, y * cell + cell * (0.25 + (chip % 2) * 0.23), cell * 0.11, cell * 0.1);
          }
        }
        if (showCoordinates && cell >= 24) {
          ctx.fillStyle = '#a0aaa433';
          ctx.font = `${Math.max(7, cell * 0.2)}px monospace`;
          ctx.fillText(`${x},${y}`, x * cell + 2, y * cell + cell - 2);
        }
      }
    }

    for (const drone of simulation.drones) {
      for (const covered of drone.coverage) {
        const [x, y] = covered.split(',').map(Number);
        ctx.fillStyle = '#50d6c20c';
        ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
      }
    }

    if (simulation.pathsVisible) {
      for (const drone of simulation.drones) {
        ctx.strokeStyle = '#e9be7250';
        ctx.lineWidth = Math.max(1, cell * 0.035);
        ctx.setLineDash([cell * 0.05, cell * 0.12]);
        ctx.beginPath();
        ctx.moveTo((drone.patrol[0].x + 0.5) * cell, (drone.patrol[0].y + 0.5) * cell);
        for (const point of drone.patrol) ctx.lineTo((point.x + 0.5) * cell, (point.y + 0.5) * cell);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      simulation.rovers.forEach((rover, index) => {
        if (!rover.route.length) return;
        ctx.strokeStyle = `${roverColors[index % roverColors.length]}b8`;
        ctx.lineWidth = Math.max(1.4, cell * 0.055);
        ctx.setLineDash([cell * 0.14, cell * 0.1]);
        ctx.beginPath();
        ctx.moveTo((rover.position.x + 0.5) * cell, (rover.position.y + 0.5) * cell);
        for (const point of rover.route) ctx.lineTo((point.x + 0.5) * cell, (point.y + 0.5) * cell);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      for (const ambulance of simulation.ambulances) {
        if (!ambulance.route.length) continue;
        ctx.strokeStyle = '#f2847380';
        ctx.lineWidth = Math.max(1.2, cell * 0.045);
        ctx.setLineDash([cell * 0.08, cell * 0.12]);
        ctx.beginPath();
        ctx.moveTo((ambulance.position.x + 0.5) * cell, (ambulance.position.y + 0.5) * cell);
        for (const point of ambulance.route) ctx.lineTo((point.x + 0.5) * cell, (point.y + 0.5) * cell);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    for (const obstacle of simulation.obstacles) {
      const [x, y] = obstacle.split(',').map(Number);
      ctx.fillStyle = '#2b2624aa';
      ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      ctx.strokeStyle = '#e58f63';
      ctx.lineWidth = Math.max(1.2, cell * 0.06);
      ctx.beginPath();
      ctx.moveTo((x + 0.28) * cell, (y + 0.28) * cell);
      ctx.lineTo((x + 0.72) * cell, (y + 0.72) * cell);
      ctx.moveTo((x + 0.72) * cell, (y + 0.28) * cell);
      ctx.lineTo((x + 0.28) * cell, (y + 0.72) * cell);
      ctx.stroke();
    }

    for (const charger of simulation.chargers) {
      const cx = (charger.x + 0.5) * cell;
      const cy = (charger.y + 0.5) * cell;
      ctx.fillStyle = '#193c39';
      ctx.strokeStyle = '#64d6c2';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(cx - cell * 0.32, cy - cell * 0.32, cell * 0.64, cell * 0.64, cell * 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#7be3d2';
      ctx.font = `700 ${cell * 0.43}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', cx, cy - 1);
    }

    for (const pad of simulation.dronePads) {
      const cx = (pad.x + 0.5) * cell;
      const cy = (pad.y + 0.5) * cell;
      ctx.strokeStyle = '#e9be7268';
      ctx.lineWidth = 1;
      ctx.setLineDash([cell * 0.06, cell * 0.06]);
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const staging = simulation.staging;
    ctx.strokeStyle = '#f2847388';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([cell * 0.05, cell * 0.05]);
    ctx.strokeRect(staging.x * cell + cell * 0.12, staging.y * cell + cell * 0.12, cell * 0.76, cell * 0.76);
    ctx.setLineDash([]);

    const hospital = simulation.hospital;
    ctx.fillStyle = '#513934';
    ctx.strokeStyle = '#f28473';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(hospital.x * cell + cell * 0.16, hospital.y * cell + cell * 0.16, cell * 0.68, cell * 0.68, cell * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd0c6';
    ctx.fillRect((hospital.x + 0.47) * cell, (hospital.y + 0.29) * cell, cell * 0.06, cell * 0.42);
    ctx.fillRect((hospital.x + 0.29) * cell, (hospital.y + 0.47) * cell, cell * 0.42, cell * 0.06);

    for (const victim of simulation.victims) drawVictim(ctx, victim, cell);

    for (const drone of simulation.drones) {
      const cx = (drone.position.x + 0.5) * cell;
      const cy = (drone.position.y + 0.5) * cell;
      ctx.strokeStyle = '#e9be72a0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.31, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#edc777';
      ctx.beginPath();
      ctx.moveTo(cx, cy - cell * 0.2);
      ctx.lineTo(cx + cell * 0.17, cy);
      ctx.lineTo(cx, cy + cell * 0.2);
      ctx.lineTo(cx - cell * 0.17, cy);
      ctx.closePath();
      ctx.fill();
    }

    simulation.rovers.forEach((rover: Rover, index: number) => {
      const color = rover.state === 'failed' ? '#e16d61' : rover.state === 'charging' || rover.state === 'returning' ? '#d9b46a' : roverColors[index % roverColors.length];
      drawVehicle(ctx, rover.position, color, selectedId === rover.id, cell);
      ctx.fillStyle = '#101817';
      ctx.font = `700 ${Math.max(8, cell * 0.2)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(rover.battery)), (rover.position.x + 0.5) * cell, (rover.position.y + 0.85) * cell);
    });

    for (const ambulance of simulation.ambulances) drawVehicle(ctx, ambulance.position, '#f28473', selectedId === ambulance.id, cell, true);

    ctx.restore();
    ctx.strokeStyle = '#79868170';
    ctx.lineWidth = 1;
    ctx.strokeRect(originX, originY, mapWidth, mapHeight);
    if (showCoordinates && cell >= 24) {
      ctx.fillStyle = '#95a19a';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      for (let x = 0; x < 26; x += 1) ctx.fillText(String(x).padStart(2, '0'), originX + (x + 0.5) * cell, originY - 8);
      ctx.textAlign = 'right';
      for (let y = 0; y < 18; y += 1) ctx.fillText(String(y).padStart(2, '0'), originX - 8, originY + (y + 0.58) * cell);
    }
  }, [simulation, revision, selectedId, zoom, pan, showCoordinates, viewportSize]);

  function eventPoint(event: React.PointerEvent<HTMLCanvasElement>): Point | undefined {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    const cell = Math.min((rect.width - 60) / 26, (rect.height - 48) / 18) * zoom;
    const originX = (rect.width - cell * 26) / 2 + pan.x;
    const originY = (rect.height - cell * 18) / 2 + pan.y;
    const x = Math.floor((event.clientX - rect.left - originX) / cell);
    const y = Math.floor((event.clientY - rect.top - originY) / cell);
    return x >= 0 && x < 26 && y >= 0 && y < 18 ? { x, y } : undefined;
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) onPan({ x: drag.panX + dx, y: drag.panY + dy });
  }

  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;
    const point = eventPoint(event);
    if (!point) return;
    if (tool !== 'select') onMapPoint(point);
    else {
      const rover = simulation.rovers.find((unit) => samePoint(unit.position, point));
      const drone = simulation.drones.find((unit: Drone) => samePoint(unit.position, point));
      const ambulance = simulation.ambulances.find((unit: Ambulance) => samePoint(unit.position, point));
      const victim = simulation.victims.find((unit) => unit.state !== 'undiscovered' && unit.state !== 'transported' && samePoint(unit.position, point));
      if (rover) onSelect(rover.id);
      else if (drone) onSelect(drone.id);
      else if (ambulance) onSelect(ambulance.id);
      else if (victim) onSelect(victim.id);
      else onMapPoint(point);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className={`map-canvas ${tool !== 'select' ? 'map-canvas--tool' : ''}`}
      aria-label="Interactive East Ward disaster-response map"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
    />
  );
}