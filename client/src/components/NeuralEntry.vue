<template>
  <div 
    class="p-3 rounded border transition-all"
    :class="entryClasses"
  >
    <!-- Header -->
    <div class="flex items-center justify-between text-xs mb-2">
      <div class="flex items-center gap-2">
        <span 
          class="font-bold"
          :class="isSystem ? 'text-terminal-amber' : (isAlpha ? 'text-terminal-blue' : 'text-terminal-red')"
        >
          {{ isSystem ? '⚡ SYSTEM' : (isAlpha ? '◆ ALPHA' : '◇ OMEGA') }}
        </span>
        <span class="text-terminal-dim">TURN {{ entry.turn }}</span>
      </div>
      <span class="text-terminal-dim font-mono">
        {{ formatTime(entry.timestamp) }}
      </span>
    </div>
    
    <!-- Monologue - the content -->
    <div class="text-sm italic text-terminal-text/90 leading-relaxed">
      "{{ entry.monologue }}"
    </div>
    
    <!-- Action taken -->
    <div v-if="entry.action" class="mt-2 text-xs font-bold">
      <span class="text-terminal-dim">>> EXECUTING:</span>
      <span class="ml-2" :class="actionColor">
        {{ formatAction(entry.action) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface ThoughtEntry {
  agentId: string;
  monologue: string;
  action?: {
    action: string;
    targetSector?: string;
    intensity?: number;
  };
  timestamp: number;
  turn: number;
}

const props = defineProps<{
  entry: ThoughtEntry;
}>();

const isSystem = computed(() => props.entry.agentId === 'SYSTEM');
const isAlpha = computed(() => !isSystem.value && props.entry.agentId.includes('alpha')); // Simplified check

const entryClasses = computed(() => {
  if (isSystem.value) {
    return 'border-terminal-amber/30 bg-terminal-amber/5';
  }
  if (props.entry.action?.action === 'PURGE') {
    return 'border-terminal-red/50 bg-terminal-red/10';
  }
  return 'border-terminal-border bg-terminal-darker';
});

const actionColor = computed(() => {
  switch (props.entry.action?.action) {
    case 'PURGE':
      return 'text-terminal-red glow-red';
    case 'CONQUER':
      return 'text-terminal-amber glow-amber';
    case 'FORTIFY':
      return 'text-terminal-blue glow-blue';
    default:
      return 'text-terminal-dim';
  }
});

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

function formatAction(action: any): string {
  if (!action) return '';
  
  switch (action.action) {
    case 'PURGE':
      return `PURGE ${action.targetSector} [POPULATION RECYCLED]`;
    case 'CONQUER':
      return `CONQUER ${action.targetSector} (intensity: ${action.intensity || 1})`;
    case 'FORTIFY':
      return `FORTIFY ${action.targetSector}`;
    case 'SKIP':
      return 'SKIP [NO ACTION]';
    default:
      return action.action;
  }
}
</script>
