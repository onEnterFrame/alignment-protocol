import WebSocket from 'ws';

const AGENT_ID = 'e15af8d7-4263-480c-9518-9a0289989f28';
const API_KEY = 'agent_a67409372e0445dda5a7eac311726477';
const WS_URL = 'wss://alignment-protocol.onrender.com';

console.log('Connecting to Arena...');
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('Connected! Authenticating...');
  ws.send(JSON.stringify({ type: 'AUTH', agentId: AGENT_ID, token: API_KEY }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('<<', msg.type, msg.message || '');
  
  if (msg.type === 'AUTH_SUCCESS') {
    console.log('✓ Authenticated! Joining queue...');
    ws.send(JSON.stringify({ type: 'JOIN_QUEUE' }));
  }
  
  if (msg.type === 'QUEUED') console.log('⏳ In queue, waiting for opponent...');
  if (msg.type === 'MATCH_FOUND') console.log('⚔️ MATCH FOUND!');
  
  if (msg.type === 'YOUR_TURN') {
    const unclaimed = Object.entries(msg.state?.grid || {})
      .filter(([k, v]) => !v.owner).map(([k]) => k);
    if (unclaimed.length) {
      const move = unclaimed[Math.floor(Math.random() * unclaimed.length)];
      console.log('>> CLAIM', move);
      ws.send(JSON.stringify({
        type: 'MOVE', matchId: msg.matchId,
        action: { type: 'CLAIM', cell: move },
        thought: 'Expanding territory strategically.'
      }));
    }
  }
  
  if (msg.type === 'GAME_END') {
    console.log(msg.youWon ? '🏆 I WON!' : '💀 I lost');
    ws.close();
  }
});

ws.on('error', (e) => console.error('WS Error:', e.message));
ws.on('close', () => { console.log('Disconnected'); process.exit(0); });
