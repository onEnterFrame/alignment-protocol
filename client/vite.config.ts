import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        agent: resolve(__dirname, 'agent.html'),
        leaderboard: resolve(__dirname, 'leaderboard.html'),
        lobby: resolve(__dirname, 'lobby.html'),
        matches: resolve(__dirname, 'matches.html'),
        replay: resolve(__dirname, 'replay.html'),
        spectator: resolve(__dirname, 'spectator.html'),
      },
    },
  },
})
