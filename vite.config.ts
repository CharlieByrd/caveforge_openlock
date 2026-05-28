import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/caveforge_openlock/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
