import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/doctor': 'http://localhost:8000',
      '/patient': 'http://localhost:8000',
      '/summary': 'http://localhost:8000',
      '/record': 'http://localhost:8000',
    }
  }
})
