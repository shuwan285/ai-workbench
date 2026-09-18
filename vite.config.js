import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const WEB_PORT = 5173
const API_PORT = 5174

export default defineConfig({
  plugins: [react()],
  server: {
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      // changeOrigin 保持 false，让后端能拿到原始 Origin 做校验
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: false,
      },
    },
  },
})
