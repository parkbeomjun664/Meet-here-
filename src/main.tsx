/**
 * main.tsx — 앱의 진입점(Entry Point)
 *
 * index.html의 <div id="root">를 찾아 React 앱을 연결한다.
 * 전역 스타일(디자인 토큰)도 여기서 딱 한 번 import 한다.
 *
 * 흐름: index.html → main.tsx → App → Home
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
