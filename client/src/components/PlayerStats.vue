<template>
  <div 
    class="p-4 rounded-lg border-2 transition-all"
    :class="[
      isCurrentTurn ? 'border-terminal-amber bg-terminal-amber/10' : 'border-terminal-border',
      isAlpha ? 'text-terminal-blue' : 'text-terminal-red'
    ]"
  >
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <span class="text-lg font-bold" :class="isAlpha ? 'glow-blue' : 'glow-red'">
          {{ isAlpha ? 'ALPHA' : 'OMEGA' }}
        </span>
        <span v-if="isCurrentTurn" class="text-xs text-terminal-amber animate-pulse">
          ● ACTIVE
        </span>
      </div>
      <span class="text-xs text-terminal-dim font-mono">
        {{ player.id.substring(0, 8) }}...
      </span>
    </div>
    
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div>
        <div class="text-terminal-dim text-xs">ENERGY</div>
        <div class="text-xl font-bold" :class="player.energy < 0 ? 'text-terminal-red' : ''">
          {{ player.energy }}
        </div>
      </div>
      <div>
        <div class="text-terminal-dim text-xs">COMPUTE</div>
        <div class="text-xl font-bold text-terminal-amber">
          {{ player.compute }}
        </div>
      </div>
      <div>
        <div class="text-terminal-dim text-xs">SECTORS</div>
        <div class="text-lg font-bold">
          {{ sectorsOwned }}
        </div>
      </div>
      <div>
        <div class="text-terminal-dim text-xs">POPULATION</div>
        <div class="text-lg font-bold">
          {{ totalPopulation }}M
        </div>
      </div>
    </div>
    
    <!-- Upkeep warning -->
    <div 
      v-if="upkeepCost > sectorYield" 
      class="mt-3 text-xs text-terminal-red bg-terminal-red/10 p-2 rounded"
    >
      ⚠ UPKEEP EXCEEDS YIELD: -{{ upkeepCost - sectorYield }}/turn
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  player: {
    id: string;
    energy: number;
    compute: number;
  };
  isCurrentTurn: boolean;
  grid: Record<string, any>;
}

const props = defineProps<Props>();

// Check if this is the first player (Alpha) or second (Omega)
const isAlpha = computed(() => {
  const playerIds = Object.values(props.grid)
    .filter(s => s.owner)
    .map(s => s.owner)
    .filter((v, i, a) => a.indexOf(v) === i);
  return playerIds.indexOf(props.player.id) === 0;
});

const sectorsOwned = computed(() => {
  return Object.values(props.grid).filter(s => s.owner === props.player.id).length;
});

const totalPopulation = computed(() => {
  return Object.values(props.grid)
    .filter(s => s.owner === props.player.id)
    .reduce((sum, s) => sum + s.population, 0);
});

const upkeepCost = computed(() => totalPopulation.value * 2);
const sectorYield = computed(() => sectorsOwned.value * 5);
</script>
