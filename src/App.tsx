import Home from './pages/Home';

// 📌 Zustand는 Context와 달리 Provider로 감쌀 필요가 없다.
// 스토어(useUserStore)가 모듈 자체에서 전역으로 생성되므로
// 어느 컴포넌트에서든 훅을 호출하기만 하면 같은 상태에 접근한다.
function App() {
  return <Home />;
}

export default App;
