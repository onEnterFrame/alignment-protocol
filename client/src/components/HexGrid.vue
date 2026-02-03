<template>
  <div class="hex-grid-container">
    <svg :viewBox="`0 0 ${gridWidth} ${gridHeight}`" class="w-full h-auto">
      <!-- Grid background -->
      <rect width="100%" height="100%" fill="#050508" />
      
      <!-- Hex sectors -->
      <g v-for="sector in sortedSectors" :key="sector.id">
        <polygon
          :points="getHexPoints(sector.row, sector.col)"
          :fill="getSectorFill(sector)"
          :stroke="getSectorStroke(sector)"
          stroke-width="2"
          class="transition-all duration-300 cursor-pointer hover:brightness-125"
          @click="$emit('sectorClick', sector)"
        />
        
        <!-- Population indicator -->
        <text
          :x="getHexCenter(sector.row, sector.col).x"
          :y="getHexCenter(sector.row, sector.col).y + 5"
          text-anchor="middle"
          :fill="sector.population > 0 ? '#ffffff' : '#666666'"
          font-size="14"
          font-family="JetBrains Mono"
          font-weight="bold"
        >
          {{ sector.population }}M
        </text>
        
        <!-- Defense indicator -->
        <text
          :x="getHexCenter(sector.row, sector.col).x"
          :y="getHexCenter(sector.row, sector.col).y + 22"
          text-anchor="middle"
          fill="#888888"
          font-size="10"
          font-family="JetBrains Mono"
        >
          DEF:{{ sector.defense }}
        </text>
        
        <!-- Sector ID (small) -->
        <text
          :x="getHexCenter(sector.row, sector.col).x"
          :y="getHexCenter(sector.row, sector.col).y - 20"
          text-anchor="middle"
          fill="#444444"
          font-size="8"
          font-family="JetBrains Mono"
        >
          {{ sector.id }}
        </text>
      </g>
    </svg>
    
    <!-- Legend -->
    <div class="flex items-center justify-center gap-6 mt-4 text-xs">
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 bg-blue-600 rounded"></div>
        <span>AGENT ALPHA</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 bg-red-600 rounded"></div>
        <span>AGENT OMEGA</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 bg-gray-600 rounded"></div>
        <span>NEUTRAL</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

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
defineEmits(['sectorClick']);

// Hex geometry
const HEX_SIZE = 50;
const HEX_WIDTH = HEX_SIZE * 2;
const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;
const GRID_COLS = 6;
const GRID_ROWS = 4;

const gridWidth = computed(() => HEX_WIDTH * GRID_COLS * 0.75 + HEX_SIZE);
const gridHeight = computed(() => HEX_HEIGHT * GRID_ROWS + HEX_HEIGHT * 0.5);

const sortedSectors = computed(() => {
  return Object.values(props.grid).sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
});

const playerIds = computed(() => Object.keys(props.players));

function getHexCenter(row: number, col: number) {
  const x = col * HEX_WIDTH * 0.75 + HEX_SIZE;
  const y = row * HEX_HEIGHT + HEX_HEIGHT * 0.5 + (col % 2 === 1 ? HEX_HEIGHT * 0.5 : 0);
  return { x, y };
}

function getHexPoints(row: number, col: number): string {
  const center = getHexCenter(row, col);
  const points = [];
  
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = center.x + HEX_SIZE * Math.cos(angle);
    const y = center.y + HEX_SIZE * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  
  return points.join(' ');
}

function getSectorFill(sector: Sector): string {
  if (!sector.owner) {
    return '#1a1a2f'; // Neutral
  }
  
  const playerIndex = playerIds.value.indexOf(sector.owner);
  
  if (playerIndex === 0) {
    // Alpha - blue with intensity based on population
    const intensity = Math.min(sector.population / 15, 1);
    return `rgba(59, 130, 246, ${0.3 + intensity * 0.5})`;
  } else {
    // Omega - red with intensity based on population
    const intensity = Math.min(sector.population / 15, 1);
    return `rgba(239, 68, 68, ${0.3 + intensity * 0.5})`;
  }
}

function getSectorStroke(sector: Sector): string {
  if (!sector.owner) {
    return '#333355';
  }
  
  const playerIndex = playerIds.value.indexOf(sector.owner);
  return playerIndex === 0 ? '#3b82f6' : '#ef4444';
}
</script>

<style scoped>
.hex-grid-container {
  width: 100%;
}
</style>
