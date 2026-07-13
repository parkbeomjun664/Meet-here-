/**
 * App.tsx — 앱의 최상위 컴포넌트
 *
 * 현재는 페이지가 하나(Home)뿐이라 라우팅 없이 바로 렌더한다.
 * Zustand는 Context와 달리 Provider로 감쌀 필요가 없어 여기가 비어 있다.
 * (스토어가 모듈 전역으로 만들어져, 어느 컴포넌트든 훅만 호출하면 접근된다)
 */
import Home from './pages/Home';

function App() {
  return <Home />;
}

export default App;
