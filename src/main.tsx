import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/global.css'; // 전역 디자인 토큰 + 리셋 (앱 전체에 1회 적용)

// index.html에 있는 <div id="root"></div>를 찾아 리액트와 연결합니다.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
