<template>
  <div class="oct-grid-container relative w-full" ref="containerRef">
    <!-- Canvas: octagon grid with AI corruption visuals -->
    <canvas
      ref="canvasRef"
      class="w-full h-auto cursor-crosshair rounded block"
      :width="CANVAS_W"
      :height="CANVAS_H"
      @mousemove="onMouseMove"
      @mouseleave="hoverSector = null"
      @click="onCanvasClick"
    />

    <!-- Legend -->
    <div class="flex items-center justify-center gap-6 mt-3 text-xs" style="font-family: 'JetBrains Mono', monospace">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-sm" style="background: rgba(59,130,246,0.8); box-shadow: 0 0 6px rgba(59,130,246,0.6)"></div>
        <span class="text-blue-400">AGENT ALPHA</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-sm" style="background: rgba(239,68,68,0.8); box-shadow: 0 0 6px rgba(239,68,68,0.6)"></div>
        <span class="text-red-400">AGENT OMEGA</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-sm bg-slate-700"></div>
        <span class="text-slate-400">NEUTRAL</span>
      </div>
    </div>

    <!-- Hover tooltip -->
    <div
      v-if="hoverSector"
      class="absolute pointer-events-none z-10 px-3 py-2 rounded border text-xs"
      :style="{
        left: tooltipX + 'px',
        top: tooltipY + 'px',
        fontFamily: '\'JetBrains Mono\', monospace',
        background: '#07080f',
        borderColor: hoverSector.owner ? (getOwnerIndex(hoverSector.owner) === 0 ? '#3b82f6' : '#ef4444') : '#334155',
        color: '#94a3b8',
        boxShadow: hoverSector.owner
          ? (getOwnerIndex(hoverSector.owner) === 0 ? '0 0 12px rgba(59,130,246,0.3)' : '0 0 12px rgba(239,68,68,0.3)')
          : 'none'
      }"
    >
      <div class="font-bold mb-1" :class="hoverSector.owner ? (getOwnerIndex(hoverSector.owner) === 0 ? 'text-blue-400' : 'text-red-400') : 'text-slate-300'">
        {{ hoverSector.id }}
      </div>
      <div>POP: {{ hoverSector.population }}M</div>
      <div>DEF: {{ hoverSector.defense }}</div>
      <div>OWNER: {{ hoverSector.owner ? (getOwnerIndex(hoverSector.owner) === 0 ? 'ALPHA' : 'OMEGA') : 'NEUTRAL' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

interface Sector {
  id: string;
  row: number;
  col: number;
  owner: string | null;
  population: number;
  defense: number;
}

interface Props {
  grid: Record<string, Sector>;
  players: Record<string, any>;
}

const props = defineProps<Props>();
const emit = defineEmits(['sectorClick']);

// ── Canvas setup ──────────────────────────────────────────────
const CELL = 72;       // octagon cell size
const CUT  = CELL * 0.25; // corner cut
const COLS = 6;
const ROWS = 4;
const PAD  = 20;
const CANVAS_W = COLS * CELL + PAD * 2;
const CANVAS_H = ROWS * CELL + PAD * 2;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const hoverSector = ref<Sector | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);
let animId = 0;

// Capture timestamps per sector for animation
const captureTimes: Record<string, number> = {};

// Track previous ownership to detect changes
const prevOwners: Record<string, string | null> = {};

// ── Geometry ──────────────────────────────────────────────────

function cellOrigin(row: number, col: number): { x: number; y: number } {
  return {
    x: PAD + col * CELL,
    y: PAD + row * CELL,
  };
}

function octPath(ctx: CanvasRenderingContext2D, ox: number, oy: number, inset = 0) {
  const cc = CUT + inset;
  const cs = CELL - inset * 2;
  ctx.beginPath();
  ctx.moveTo(ox + cc, oy + inset);
  ctx.lineTo(ox + inset + cs - CUT, oy + inset);
  ctx.lineTo(ox + inset + cs, oy + cc);
  ctx.lineTo(ox + inset + cs, oy + inset + cs - CUT);
  ctx.lineTo(ox + inset + cs - CUT, oy + inset + cs);
  ctx.lineTo(ox + cc, oy + inset + cs);
  ctx.lineTo(ox + inset, oy + inset + cs - CUT);
  ctx.lineTo(ox + inset, oy + cc);
  ctx.closePath();
}

function getOwnerIndex(ownerId: string | null): number {
  if (!ownerId) return -1;
  return Object.keys(props.players).indexOf(ownerId);
}

// ── Terrain helpers (deterministic from sector id) ────────────

type Terrain = 'grass' | 'forest' | 'sand' | 'water' | 'mountain';

function sectorTerrain(sector: Sector): Terrain {
  // Deterministic from row/col
  const v = Math.sin(sector.row * 7 + sector.col * 13) * 0.5 + 0.5;
  if (v < 0.12) return 'water';
  if (v < 0.28) return 'sand';
  if (v < 0.55) return 'grass';
  if (v < 0.78) return 'forest';
  return 'mountain';
}

const TERRAIN_BASE: Record<Terrain, string> = {
  grass:    '#4a7c3f',
  forest:   '#1e4d0f',
  sand:     '#c4a03a',
  water:    '#1565a0',
  mountain: '#6b6b6b',
};
const TERRAIN_MID: Record<Terrain, string> = {
  grass:    '#5e9e50',
  forest:   '#2a6518',
  sand:     '#d4b050',
  water:    '#1a7dc0',
  mountain: '#8a8a8a',
};

function drawNaturalDetail(ctx: CanvasRenderingContext2D, terrain: Terrain, ox: number, oy: number, seed: number) {
  const cx = ox + CELL / 2;
  const cy = oy + CELL / 2;
  const r = (n: number) => Math.abs(Math.sin(seed * 999 + n * 37));
  ctx.save();
  ctx.translate(cx, cy);

  if (terrain === 'forest') {
    const positions: [number, number][] = [[-10, -7], [8, -5], [-3, 10], [12, 10], [-14, 6]];
    for (let i = 0; i < 4; i++) {
      const [px, py] = positions[i] as [number, number];
      ctx.fillStyle = `rgba(15,50,5,${0.7 + r(i) * 0.3})`;
      ctx.beginPath(); ctx.arc(px, py, 7 + r(i) * 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(30,80,15,0.5)`;
      ctx.beginPath(); ctx.arc(px - 2, py - 2, 4, 0, Math.PI * 2); ctx.fill();
    }
  } else if (terrain === 'mountain') {
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath(); ctx.moveTo(-18, 16); ctx.lineTo(0, -18); ctx.lineTo(18, 16); ctx.fill();
    ctx.fillStyle = '#6a6a6a';
    ctx.beginPath(); ctx.moveTo(-8, 16); ctx.lineTo(-14, 4); ctx.lineTo(-4, 16); ctx.fill();
    ctx.fillStyle = '#eeeeee';
    ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(0, -18); ctx.lineTo(6, -3); ctx.lineTo(3, 1); ctx.lineTo(0, -4); ctx.lineTo(-3, 1); ctx.fill();
  } else if (terrain === 'water') {
    ctx.strokeStyle = 'rgba(100,200,255,0.35)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(-14, i * 9); ctx.bezierCurveTo(-7, i * 9 - 4, 0, i * 9 + 4, 7, i * 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4, i * 9 + 5); ctx.bezierCurveTo(3, i * 9 + 2, 10, i * 9 + 6, 16, i * 9 + 4); ctx.stroke();
    }
  } else if (terrain === 'sand') {
    for (let i = 0; i < 6; i++) {
      const dx = r(i) * 28 - 14;
      const dy = r(i + 6) * 28 - 14;
      ctx.fillStyle = `rgba(190,150,60,${0.3 + r(i + 3) * 0.3})`;
      ctx.beginPath(); ctx.ellipse(dx, dy, 5 + r(i + 9) * 5, 2, r(i + 12) * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  } else if (terrain === 'grass') {
    ctx.strokeStyle = 'rgba(70,130,50,0.7)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    const blades: [number, number][] = [[-12, 3], [-5, -10], [5, 2], [12, -6], [-8, 12], [3, 12], [14, 6]];
    for (const [bx, by] of blades) {
      ctx.beginPath(); ctx.moveTo(bx, by + 5); ctx.lineTo(bx + (r(bx) - 0.5) * 5, by - 7); ctx.stroke();
    }
  }

  ctx.restore();
}

function drawCircuitCorruption(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  ownerIdx: number,
  progress: number,
  seed: number,
  now: number
) {
  const isAlpha = ownerIdx === 0;
  const rgb = isAlpha ? '59,130,246' : '239,68,68';
  const glow = isAlpha ? '#3b82f6' : '#ef4444';
  const flicker = 0.85 + Math.sin(now * 0.005 + seed * 10) * 0.15;

  ctx.save();
  ctx.translate(ox, oy);

  // Dark base — kills natural colour
  ctx.fillStyle = isAlpha
    ? `rgba(3,8,25,${0.82 * progress})`
    : `rgba(25,3,3,${0.82 * progress})`;
  octPath(ctx, 0, 0);
  ctx.fill();

  // Circuit traces
  const traceAlpha = Math.min(progress * 2, 1) * flicker;
  ctx.strokeStyle = `rgba(${rgb},${traceAlpha * 0.65})`;
  ctx.lineWidth = 1;
  const r = (n: number) => Math.abs(Math.sin(seed * 500 + n * 37));
  const numH = Math.ceil(progress * 5);

  for (let i = 0; i < numH; i++) {
    const ty = CUT + i * ((CELL - CUT * 2) / 5);
    const x1 = CUT + r(i) * 8;
    const x2 = CELL - CUT - r(i + 1) * 8;
    ctx.beginPath(); ctx.moveTo(x1, ty); ctx.lineTo(x2, ty); ctx.stroke();
    if (i < numH - 1) {
      const nextTy = CUT + (i + 1) * ((CELL - CUT * 2) / 5);
      const cx2 = i % 2 === 0 ? x2 : x1;
      ctx.beginPath(); ctx.moveTo(cx2, ty); ctx.lineTo(cx2, nextTy); ctx.stroke();
    }
  }

  // Nodes
  ctx.fillStyle = `rgba(${rgb},${traceAlpha})`;
  for (let i = 0; i < numH; i++) {
    const ty = CUT + i * ((CELL - CUT * 2) / 5);
    const x1 = CUT + r(i) * 8;
    const x2 = CELL - CUT - r(i + 1) * 8;
    ctx.beginPath(); ctx.arc(x1, ty, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x2, ty, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // Center core
  if (progress > 0.5) {
    const coreAlpha = (progress - 0.5) * 2 * flicker;
    const cx = CELL / 2, cy = CELL / 2;
    ctx.fillStyle = `rgba(${rgb},${coreAlpha})`;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(${rgb},${coreAlpha * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();

    // Pop/defense data readout
    ctx.fillStyle = `rgba(${rgb},${Math.min(coreAlpha * 1.5, 1)})`;
    ctx.font = `bold 9px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
  }

  // Glowing border
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14 * progress * flicker;
  octPath(ctx, 0, 0, 3);
  ctx.strokeStyle = `rgba(${rgb},${progress * flicker})`;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Capture flash
  if (progress < 1) {
    octPath(ctx, 0, 0);
    ctx.fillStyle = `rgba(255,255,255,${(1 - progress) * 0.1})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── Main render ───────────────────────────────────────────────

function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const now = Date.now();

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Background
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(0,255,80,0.025)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < CANVAS_W; gx += 18) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_H); ctx.stroke(); }
  for (let gy = 0; gy < CANVAS_H; gy += 18) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke(); }

  // Scanlines
  for (let sy = 0; sy < CANVAS_H; sy += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, sy, CANVAS_W, 2);
  }

  const sectors = Object.values(props.grid);

  for (const sector of sectors) {
    const { x: ox, y: oy } = cellOrigin(sector.row, sector.col);
    const terrain = sectorTerrain(sector);
    const seed = Math.abs(Math.sin(sector.row * 31 + sector.col * 17));

    // Detect ownership changes → set capture time
    if (sector.owner !== prevOwners[sector.id]) {
      if (sector.owner) captureTimes[sector.id] = now;
      prevOwners[sector.id] = sector.owner;
    }

    const captureTime = captureTimes[sector.id] ?? 0;
    const rawProgress = sector.owner
      ? Math.min(1, (now - captureTime) / 800)
      : 0;
    const progress = 1 - Math.pow(1 - rawProgress, 3);
    const ownerIdx = getOwnerIndex(sector.owner);

    // ── Draw cell ──

    // 1. Clip to octagon
    ctx.save();
    octPath(ctx, ox, oy);
    ctx.clip();

    // 2. Natural terrain gradient
    const grad = ctx.createLinearGradient(ox, oy, ox + CELL, oy + CELL);
    grad.addColorStop(0, TERRAIN_MID[terrain]);
    grad.addColorStop(1, TERRAIN_BASE[terrain]);
    ctx.fillStyle = grad;
    ctx.fillRect(ox, oy, CELL, CELL);

    // 3. Natural detail — fades as corruption grows
    if (progress < 0.85) {
      ctx.globalAlpha = 1 - progress * 1.2;
      drawNaturalDetail(ctx, terrain, ox, oy, seed);
      ctx.globalAlpha = 1;
    }

    // 4. AI corruption
    if (sector.owner && progress > 0) {
      drawCircuitCorruption(ctx, ox, oy, ownerIdx, progress, seed, now);
    }

    // 5. Pop + defense text (always visible)
    ctx.globalAlpha = 1;
    const textAlpha = sector.owner ? Math.min(progress * 2, 1) : 1;
    const textColor = sector.owner
      ? (ownerIdx === 0 ? `rgba(147,197,253,${textAlpha})` : `rgba(252,165,165,${textAlpha})`)
      : 'rgba(200,220,200,0.85)';

    ctx.fillStyle = textColor;
    ctx.font = `bold 11px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${sector.population}M`, ox + CELL / 2, oy + CELL / 2 - 8);

    ctx.fillStyle = sector.owner ? textColor.replace(/[\d.]+\)$/, `${textAlpha * 0.7})`) : 'rgba(150,180,150,0.6)';
    ctx.font = `9px 'JetBrains Mono', monospace`;
    ctx.fillText(`DEF:${sector.defense}`, ox + CELL / 2, oy + CELL / 2 + 8);

    ctx.restore();

    // 6. Outer border
    octPath(ctx, ox, oy);
    if (sector.owner) {
      ctx.strokeStyle = ownerIdx === 0 ? 'rgba(59,130,246,0.6)' : 'rgba(239,68,68,0.6)';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(30,45,30,0.9)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();

    // 7. Hover highlight
    if (hoverSector.value?.id === sector.id) {
      octPath(ctx, ox, oy);
      ctx.fillStyle = 'rgba(0,255,80,0.1)';
      ctx.fill();
      ctx.shadowColor = '#00ff50';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(0,255,80,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Final scanline pass
  for (let sy = 0; sy < CANVAS_H; sy += 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(0, sy, CANVAS_W, 1);
  }

  animId = requestAnimationFrame(render);
}

// ── Mouse interaction ─────────────────────────────────────────

function canvasCoords(e: MouseEvent): { row: number; col: number } | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  const col = Math.floor((cx - PAD) / CELL);
  const row = Math.floor((cy - PAD) / CELL);

  if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
    return { row, col };
  }
  return null;
}

function getSectorAt(row: number, col: number): Sector | null {
  return Object.values(props.grid).find(s => s.row === row && s.col === col) ?? null;
}

function onMouseMove(e: MouseEvent) {
  const coords = canvasCoords(e);
  if (coords) {
    const sector = getSectorAt(coords.row, coords.col);
    hoverSector.value = sector;
    const canvas = canvasRef.value!;
    const rect = canvas.getBoundingClientRect();
    tooltipX.value = e.clientX - rect.left + 12;
    tooltipY.value = e.clientY - rect.top - 10;
  } else {
    hoverSector.value = null;
  }
}

function onCanvasClick(e: MouseEvent) {
  const coords = canvasCoords(e);
  if (!coords) return;
  const sector = getSectorAt(coords.row, coords.col);
  if (sector) emit('sectorClick', sector);
}

// ── Lifecycle ─────────────────────────────────────────────────

onMounted(() => {
  animId = requestAnimationFrame(render);
});

onUnmounted(() => {
  cancelAnimationFrame(animId);
});
</script>

<style scoped>
.oct-grid-container {
  width: 100%;
  position: relative;
}
</style>
