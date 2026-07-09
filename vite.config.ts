import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,       // 개발 서버 포트를 항상 5173으로 고정
    strictPort: true, // 5173이 사용 중이면 다른 포트로 바꾸지 않고 에러로 알림 (포트가 멋대로 바뀌는 것 방지)
  },
})
