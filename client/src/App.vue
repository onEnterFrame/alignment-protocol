<template>
  <div class="min-h-screen bg-terminal-bg text-terminal-text relative scanlines">
    <!-- Header -->
    <header class="border-b border-terminal-border p-4">
      <div class="flex items-center justify-between max-w-7xl mx-auto">
        <div class="flex items-center gap-4">
          <h1 class="text-2xl font-bold glow-green tracking-wider">
            THE ALIGNMENT PROTOCOL
          </h1>
          <span class="text-terminal-dim text-sm">
            v1.0 | CLASSIFIED
          </span>
        </div>
        <div class="flex items-center gap-6 text-sm">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" :class="connected ? 'bg-terminal-text' : 'bg-terminal-red'"></span>
            <span>{{ connected ? 'ONLINE' : 'OFFLINE' }}</span>
          </div>
          <div>
            <span class="text-terminal-dim">SPECTATORS:</span>
            <span class="ml-2">{{ spectatorCount }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto p-4 grid grid-cols-12 gap-4" style="height: calc(100vh - 80px);">
      <!-- Left: Hex Grid -->
      <div class="col-span-7 border border-terminal-border rounded-lg p-4 bg-terminal-darker">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold glow-amber">GLOBAL THEATER</h2>
          <div class="text-sm">
            <span class="text-terminal-dim">TURN:</span>
            <span class="ml-2 text-terminal-amber">{{ currentState?.turn ?? 0 }}</span>
          </div>
        </div>
        
        <HexGrid 
          v-if="currentState" 
          :grid="currentState.grid" 
          :players="currentState.players"
        />
        
        <div v-else class="flex items-center justify-center h-96 text-terminal-dim">
          <div class="text-center">
            <div class="text-4xl mb-4">⏳</div>
            <p>AWAITING MATCH START</p>
            <p class="text-sm mt-2">{{ activeMatches.length }} active matches</p>
          </div>
        </div>
      </div>

      <!-- Right: Neural Feed + Stats -->
      <div class="col-span-5 flex flex-col gap-4">
        <!-- Match Stats -->
        <div class="border border-terminal-border rounded-lg p-4 bg-terminal-darker">
          <h2 class="text-lg font-bold glow-amber mb-4">MATCH STATUS</h2>
          <div v-if="currentState" class="grid grid-cols-2 gap-4">
            <PlayerStats
              v-for="(player, id) in currentState.players"
              :key="id"
              :player="player"
              :isCurrentTurn="id === currentState.currentPlayer"
              :grid="currentState.grid"
            />
          </div>
          <div v-else class="text-terminal-dim text-center py-8">
            NO ACTIVE MATCH
          </div>
        </div>

        <!-- Neural Intercept Feed -->
        <div class="border border-terminal-border rounded-lg p-4 bg-terminal-darker flex-1 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold glow-red">NEURAL INTERCEPT FEED</h2>
            <span class="text-xs text-terminal-dim">CLASSIFIED // EYES ONLY</span>
          </div>
          
          <div class="neural-feed flex-1 overflow-y-auto space-y-3 pr-2" ref="feedContainer">
            <NeuralEntry
              v-for="(entry, index) in thoughtFeed"
              :key="index"
              :entry="entry"
            />
            
            <div v-if="thoughtFeed.length === 0" class="text-terminal-dim text-center py-8">
              INTERCEPTING NEURAL SIGNALS...
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { createClient } from '@supabase/supabase-js';
import HexGrid from './components/HexGrid.vue';
import PlayerStats from './components/PlayerStats.vue';
import NeuralEntry from './components/NeuralEntry.vue';

interface ThoughtEntry {
  agentId: string;
  monologue: string;
  action?: any;
  timestamp: number;
  turn: number;
}

const connected = ref(false);
const spectatorCount = ref(0);
const activeMatches = ref<string[]>([]);
const currentState = ref<any>(null);
const thoughtFeed = ref<ThoughtEntry[]>([]);
const feedContainer = ref<HTMLElement | null>(null);

// WebSocket connection
let ws: WebSocket | null = null;

// Supabase client for realtime
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
);

function connectWebSocket() {
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    connected.value = true;
    ws?.send(JSON.stringify({ type: 'SPECTATE' }));
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleMessage(message);
  };

  ws.onclose = () => {
    connected.value = false;
    // Reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function handleMessage(message: any) {
  switch (message.type) {
    case 'SPECTATE_OK':
      activeMatches.value = message.activeMatches || [];
      break;

    case 'MATCH_STARTED':
      currentState.value = message.state;
      thoughtFeed.value = [];
      break;

    case 'GAME_UPDATE':
      currentState.value = message.state;
      thoughtFeed.value.push({
        agentId: message.agentId,
        monologue: message.monologue,
        action: message.action,
        timestamp: Date.now(),
        turn: message.turn
      });
      scrollFeed();
      break;

    case 'MATCH_ENDED':
      currentState.value = message.finalState;
      thoughtFeed.value.push({
        agentId: 'SYSTEM',
        monologue: `MATCH CONCLUDED. WINNER: ${message.winner}`,
        timestamp: Date.now(),
        turn: message.finalState?.turn || 0
      });
      break;

    case 'TIMEOUT':
      thoughtFeed.value.push({
        agentId: message.agentId,
        monologue: '[TIMEOUT - TURN FORFEITED]',
        timestamp: Date.now(),
        turn: currentState.value?.turn || 0
      });
      break;
  }
}

async function scrollFeed() {
  await nextTick();
  if (feedContainer.value) {
    feedContainer.value.scrollTop = feedContainer.value.scrollHeight;
  }
}

// Subscribe to realtime updates via Supabase
function subscribeToRealtime() {
  supabase
    .channel('agent_thoughts')
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'agent_thoughts' 
    }, (payload) => {
      // Backup realtime via Supabase if WS misses it
      const thought = payload.new as any;
      if (!thoughtFeed.value.find(t => 
        t.agentId === thought.agent_id && 
        t.turn === thought.turn
      )) {
        thoughtFeed.value.push({
          agentId: thought.agent_id,
          monologue: thought.monologue,
          timestamp: new Date(thought.created_at).getTime(),
          turn: thought.turn
        });
        scrollFeed();
      }
    })
    .subscribe();
}

onMounted(() => {
  connectWebSocket();
  subscribeToRealtime();
});
</script>
