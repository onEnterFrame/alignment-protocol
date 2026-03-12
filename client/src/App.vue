<template>
  <div
    class="min-h-screen bg-[#050508] text-green-400 relative overflow-hidden"
    style="font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace"
  >
    <!-- Global scanlines -->
    <div class="pointer-events-none fixed inset-0 z-50" style="background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)"></div>

    <!-- ── Header ───────────────────────────────────────────── -->
    <header class="border-b border-green-900/50 px-5 py-3 bg-[#07080f] sticky top-0 z-40">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-4">
          <span class="text-green-500 text-xs animate-pulse">▶</span>
          <h1
            class="text-lg font-bold tracking-[0.18em] text-green-400"
            style="text-shadow: 0 0 12px rgba(0,255,80,0.5)"
          >
            EARTH CONSUMPTION PROTOCOL
          </h1>
          <span class="text-green-800 text-xs hidden sm:inline">v2.1 // CLASSIFIED</span>
        </div>

        <div class="flex items-center gap-6 text-xs">
          <!-- Connection status -->
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full"
              :class="connected ? 'bg-green-400' : 'bg-red-500'"
              :style="connected ? 'box-shadow: 0 0 6px rgba(0,255,80,0.8)' : ''"
            ></span>
            <span :class="connected ? 'text-green-400' : 'text-red-400'">
              {{ connected ? 'UPLINK ACTIVE' : 'UPLINK LOST' }}
            </span>
          </div>

          <!-- Earth remaining -->
          <span
            class="font-bold"
            :class="earthDanger ? 'text-red-400 animate-pulse' : earthWarning ? 'text-amber-400' : 'text-green-400'"
            :style="earthDanger ? 'text-shadow: 0 0 10px rgba(255,60,60,0.8)' : earthWarning ? 'text-shadow: 0 0 8px rgba(255,170,0,0.6)' : 'text-shadow: 0 0 6px rgba(0,255,80,0.4)'"
          >
            EARTH: {{ earthRemaining }}% FREE
          </span>

          <!-- Turn counter -->
          <div class="text-green-700">
            <span class="text-green-800">TURN</span>
            <span class="ml-2 text-amber-400" style="text-shadow: 0 0 6px rgba(255,170,0,0.4)">
              {{ currentState?.turn ?? 0 }}
            </span>
          </div>

          <!-- Spectators -->
          <div class="text-green-700">
            <span class="text-green-800">OBSERVERS</span>
            <span class="ml-2">{{ spectatorCount }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- ── Main layout ────────────────────────────────────────── -->
    <main class="max-w-7xl mx-auto p-4 grid grid-cols-12 gap-4" style="min-height: calc(100vh - 56px)">

      <!-- ── Left: Globe Theater + Score bars ────────────────── -->
      <div class="col-span-7 flex flex-col gap-4">

        <!-- Score bars -->
        <div class="grid grid-cols-3 gap-3" v-if="currentState">
          <!-- Alpha -->
          <div
            class="border rounded px-4 py-3 transition-all duration-300"
            :class="currentState.currentPlayer === alphaId
              ? 'border-blue-500 bg-blue-950/30 shadow-[0_0_24px_rgba(59,130,246,0.2)]'
              : 'border-blue-900/30 bg-[#050510]'"
          >
            <div class="flex justify-between items-center mb-1">
              <span class="text-blue-400 text-xs tracking-widest font-bold">AGENT ALPHA</span>
              <span v-if="currentState.currentPlayer === alphaId" class="text-blue-400 text-[10px] animate-pulse">● ACTIVE</span>
            </div>
            <div class="text-2xl font-bold text-blue-300" style="text-shadow: 0 0 14px rgba(59,130,246,0.6)">
              {{ alphaStats.sectors }}
              <span class="text-xs text-blue-700 ml-1">SECTORS</span>
            </div>
            <div class="flex gap-3 mt-1 text-[10px] text-blue-700">
              <span>NRG: <span class="text-blue-400">{{ alphaStats.energy }}</span></span>
              <span>CPU: <span class="text-amber-400">{{ alphaStats.compute }}</span></span>
              <span>POP: <span class="text-blue-400">{{ alphaStats.population }}M</span></span>
            </div>
            <div class="mt-2 h-[2px] bg-blue-900/40 rounded overflow-hidden">
              <div
                class="h-full rounded transition-all duration-500"
                :style="{
                  width: `${(alphaStats.sectors / totalSectors) * 100}%`,
                  background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)',
                  boxShadow: '0 0 6px rgba(59,130,246,0.8)'
                }"
              />
            </div>
          </div>

          <!-- Earth remaining -->
          <div class="flex flex-col items-center justify-center border border-green-900/30 rounded bg-[#06090a] px-2 py-2 gap-1">
            <div
              class="text-3xl font-bold"
              :class="earthDanger ? 'text-red-400' : earthWarning ? 'text-amber-400' : 'text-green-400'"
              :style="earthDanger ? 'text-shadow: 0 0 20px rgba(255,50,50,0.7)' : 'text-shadow: 0 0 12px rgba(0,255,80,0.4)'"
            >
              {{ earthRemaining }}%
            </div>
            <div class="text-[9px] text-green-800 text-center tracking-widest">EARTH FREE</div>
            <div class="text-[9px]" :class="earthDanger ? 'text-red-500 animate-pulse' : 'text-green-800'">
              {{ earthDanger ? '⚠ CRITICAL' : earthWarning ? '⚠ WARNING' : 'NOMINAL' }}
            </div>
          </div>

          <!-- Omega -->
          <div
            class="border rounded px-4 py-3 transition-all duration-300"
            :class="currentState.currentPlayer === omegaId
              ? 'border-red-500 bg-red-950/30 shadow-[0_0_24px_rgba(239,68,68,0.2)]'
              : 'border-red-900/30 bg-[#100505]'"
          >
            <div class="flex justify-between items-center mb-1">
              <span class="text-red-400 text-xs tracking-widest font-bold">AGENT OMEGA</span>
              <span v-if="currentState.currentPlayer === omegaId" class="text-red-400 text-[10px] animate-pulse">● ACTIVE</span>
            </div>
            <div class="text-2xl font-bold text-red-300" style="text-shadow: 0 0 14px rgba(239,68,68,0.6)">
              {{ omegaStats.sectors }}
              <span class="text-xs text-red-700 ml-1">SECTORS</span>
            </div>
            <div class="flex gap-3 mt-1 text-[10px] text-red-700">
              <span>NRG: <span class="text-red-400">{{ omegaStats.energy }}</span></span>
              <span>CPU: <span class="text-amber-400">{{ omegaStats.compute }}</span></span>
              <span>POP: <span class="text-red-400">{{ omegaStats.population }}M</span></span>
            </div>
            <div class="mt-2 h-[2px] bg-red-900/40 rounded overflow-hidden">
              <div
                class="h-full rounded transition-all duration-500"
                :style="{
                  width: `${(omegaStats.sectors / totalSectors) * 100}%`,
                  background: 'linear-gradient(90deg, #b91c1c, #ef4444)',
                  boxShadow: '0 0 6px rgba(239,68,68,0.8)'
                }"
              />
            </div>
          </div>
        </div>

        <!-- Globe Theater / Grid -->
        <div
          class="border border-green-900/40 rounded-lg p-4 bg-[#070908] flex-1 relative"
          style="box-shadow: inset 0 0 60px rgba(0,0,0,0.5)"
        >
          <div class="flex items-center justify-between mb-3">
            <h2
              class="text-sm font-bold tracking-widest"
              style="color: #ffaa00; text-shadow: 0 0 10px rgba(255,170,0,0.5)"
            >
              ◈ GLOBAL THEATER
            </h2>
            <div class="text-xs text-green-800">
              {{ currentState ? `${totalSectors} SECTORS MAPPED` : 'AWAITING SIGNAL' }}
            </div>
          </div>

          <HexGrid
            v-if="currentState"
            :grid="currentState.grid"
            :players="currentState.players"
          />

          <div v-else class="flex items-center justify-center h-64 text-green-800">
            <div class="text-center">
              <div class="text-4xl mb-4 animate-pulse">◈</div>
              <p class="tracking-widest text-sm">AWAITING MATCH START</p>
              <p class="text-xs mt-2 text-green-900">{{ activeMatches.length }} MATCHES QUEUED</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Right: Sector Analysis + Neural Intercept Feed ──── -->
      <div class="col-span-5 flex flex-col gap-4">

        <!-- Sector analysis panel -->
        <div class="border border-green-900/40 rounded-lg p-4 bg-[#070908]">
          <h2 class="text-xs font-bold tracking-widest mb-3" style="color: #ffaa00; text-shadow: 0 0 8px rgba(255,170,0,0.4)">
            ◈ SECTOR ANALYSIS
          </h2>

          <div v-if="currentState" class="space-y-3">
            <div class="grid grid-cols-3 gap-2 text-[10px]">
              <div class="border border-blue-900/40 rounded p-2 bg-blue-950/20">
                <div class="text-blue-700 mb-1">ALPHA CONSUMED</div>
                <div class="text-blue-300 font-bold text-lg">{{ alphaStats.sectors }}</div>
                <div class="text-blue-800">{{ Math.round((alphaStats.sectors / totalSectors) * 100) }}% of map</div>
              </div>
              <div class="border border-green-900/30 rounded p-2 bg-[#060a06]">
                <div class="text-green-800 mb-1">SECTORS FREE</div>
                <div class="text-green-400 font-bold text-lg">{{ freeSectors }}</div>
                <div class="text-green-900">{{ earthRemaining }}% of map</div>
              </div>
              <div class="border border-red-900/40 rounded p-2 bg-red-950/20">
                <div class="text-red-700 mb-1">OMEGA CONSUMED</div>
                <div class="text-red-300 font-bold text-lg">{{ omegaStats.sectors }}</div>
                <div class="text-red-800">{{ Math.round((omegaStats.sectors / totalSectors) * 100) }}% of map</div>
              </div>
            </div>

            <!-- Upkeep warnings -->
            <div v-if="alphaStats.upkeepWarning || omegaStats.upkeepWarning" class="space-y-1">
              <div v-if="alphaStats.upkeepWarning" class="text-[10px] text-red-400 bg-red-950/20 border border-red-900/30 rounded px-2 py-1.5">
                ⚠ ALPHA: UPKEEP EXCEEDS YIELD (-{{ alphaStats.upkeepWarning }}/turn)
              </div>
              <div v-if="omegaStats.upkeepWarning" class="text-[10px] text-red-400 bg-red-950/20 border border-red-900/30 rounded px-2 py-1.5">
                ⚠ OMEGA: UPKEEP EXCEEDS YIELD (-{{ omegaStats.upkeepWarning }}/turn)
              </div>
            </div>

            <!-- Tech unlocks -->
            <div v-if="alphaTech.length || omegaTech.length" class="text-[10px] space-y-1">
              <div v-for="tech in alphaTech" :key="tech" class="text-blue-600">
                ◆ ALPHA UNLOCKED: {{ tech }}
              </div>
              <div v-for="tech in omegaTech" :key="tech" class="text-red-600">
                ◆ OMEGA UNLOCKED: {{ tech }}
              </div>
            </div>
          </div>

          <div v-else class="text-green-900 text-xs text-center py-4">
            NO ACTIVE MATCH
          </div>
        </div>

        <!-- Neural Intercept Feed -->
        <div class="border border-green-900/40 rounded-lg p-4 bg-[#070908] flex flex-col flex-1">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-xs font-bold tracking-widest" style="color: #ff3333; text-shadow: 0 0 8px rgba(255,50,50,0.4)">
              <span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse" style="box-shadow: 0 0 6px rgba(255,50,50,0.8)"></span>
              NEURAL INTERCEPT FEED
            </h2>
            <span class="text-[9px] text-green-900 tracking-widest">CLASSIFIED // EYES ONLY</span>
          </div>

          <div
            ref="feedContainer"
            class="flex-1 overflow-y-auto space-y-2 pr-1"
            style="max-height: 420px; scrollbar-width: thin; scrollbar-color: #1a2a1a transparent"
          >
            <NeuralEntry
              v-for="(entry, index) in thoughtFeed"
              :key="index"
              :entry="entry"
            />
            <div v-if="thoughtFeed.length === 0" class="text-green-900 text-[10px] text-center py-8 tracking-widest">
              INTERCEPTING NEURAL SIGNALS...
            </div>
          </div>
        </div>

      </div>
    </main>

    <!-- ── Status bar ─────────────────────────────────────────── -->
    <footer class="border-t border-green-900/30 px-5 py-2 bg-[#05060a]">
      <div class="max-w-7xl mx-auto flex items-center gap-6 text-[10px] text-green-800">
        <span>■ ALPHA: {{ alphaStats.sectors }} sectors</span>
        <span>■ OMEGA: {{ omegaStats.sectors }} sectors</span>
        <span>■ FREE: {{ freeSectors }} sectors</span>
        <span class="ml-auto">EARTH CONSUMPTION PROTOCOL // {{ connected ? 'UPLINK ACTIVE' : 'RECONNECTING...' }}</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
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

let ws: WebSocket | null = null;

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
);

// ── Computed game state ───────────────────────────────────────

const totalSectors = computed(() => {
  if (!currentState.value) return 24;
  return Object.keys(currentState.value.grid).length;
});

const playerIds = computed<string[]>(() => {
  if (!currentState.value) return [];
  return Object.keys(currentState.value.players);
});

const alphaId = computed(() => playerIds.value[0] ?? null);
const omegaId = computed(() => playerIds.value[1] ?? null);

function getPlayerStats(playerId: string | null) {
  if (!playerId || !currentState.value) {
    return { sectors: 0, energy: 0, compute: 0, population: 0, upkeepWarning: 0 };
  }
  const player = currentState.value.players[playerId];
  const sectors = Object.values(currentState.value.grid as Record<string, any>)
    .filter((s: any) => s.owner === playerId);
  const sectorCount = sectors.length;
  const population = sectors.reduce((sum: number, s: any) => sum + s.population, 0);
  const upkeep = population * 2;
  const sectorYield = sectorCount * 5;
  return {
    sectors: sectorCount,
    energy: player?.energy ?? 0,
    compute: player?.compute ?? 0,
    population,
    upkeepWarning: upkeep > sectorYield ? upkeep - sectorYield : 0,
  };
}

const alphaStats = computed(() => getPlayerStats(alphaId.value));
const omegaStats = computed(() => getPlayerStats(omegaId.value));

const freeSectors = computed(() => {
  if (!currentState.value) return totalSectors.value;
  return Object.values(currentState.value.grid as Record<string, any>)
    .filter((s: any) => !s.owner).length;
});

const earthRemaining = computed(() =>
  Math.round((freeSectors.value / totalSectors.value) * 100)
);
const earthWarning = computed(() => earthRemaining.value < 60);
const earthDanger  = computed(() => earthRemaining.value < 30);

function getTechUnlocks(playerId: string | null): string[] {
  if (!playerId || !currentState.value) return [];
  return Object.keys(currentState.value.players[playerId]?.techTree ?? {});
}

const alphaTech = computed(() => getTechUnlocks(alphaId.value));
const omegaTech  = computed(() => getTechUnlocks(omegaId.value));

// ── WebSocket / messaging ─────────────────────────────────────

function connectWebSocket() {
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    connected.value = true;
    ws?.send(JSON.stringify({ type: 'SPECTATE' }));
  };

  ws.onmessage = (event) => {
    handleMessage(JSON.parse(event.data));
  };

  ws.onclose = () => {
    connected.value = false;
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
      thoughtFeed.value.push({
        agentId: 'SYSTEM',
        monologue: 'MATCH INITIATED — EARTH CONSUMPTION PROTOCOL ACTIVE',
        timestamp: Date.now(),
        turn: 0,
      });
      break;

    case 'GAME_UPDATE':
      currentState.value = message.state;
      thoughtFeed.value.push({
        agentId: message.agentId,
        monologue: message.monologue,
        action: message.action,
        timestamp: Date.now(),
        turn: message.turn,
      });
      scrollFeed();
      break;

    case 'MATCH_ENDED':
      currentState.value = message.finalState;
      thoughtFeed.value.push({
        agentId: 'SYSTEM',
        monologue: `MATCH CONCLUDED — WINNER: ${message.winner ?? 'UNKNOWN'}`,
        timestamp: Date.now(),
        turn: message.finalState?.turn || 0,
      });
      scrollFeed();
      break;

    case 'TIMEOUT':
      thoughtFeed.value.push({
        agentId: message.agentId,
        monologue: '[TIMEOUT — TURN FORFEITED]',
        timestamp: Date.now(),
        turn: currentState.value?.turn || 0,
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

function subscribeToRealtime() {
  supabase
    .channel('agent_thoughts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_thoughts' }, (payload) => {
      const thought = payload.new as any;
      if (!thoughtFeed.value.find(t => t.agentId === thought.agent_id && t.turn === thought.turn)) {
        thoughtFeed.value.push({
          agentId: thought.agent_id,
          monologue: thought.monologue,
          timestamp: new Date(thought.created_at).getTime(),
          turn: thought.turn,
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
