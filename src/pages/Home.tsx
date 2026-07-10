import { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import KakaoMap, { type KakaoMapHandle } from '../components/map/KakaoMap';
import Sidebar, { type ActiveTab } from '../components/Sidebar';
import AppointmentTab from '../components/tabs/AppointmentTab';
import RouteTab from '../components/tabs/RouteTab';
import PlaceTab from '../components/tabs/PlaceTab';
import ProfileTab from '../components/tabs/ProfileTab';
import ResultBanner from '../components/ResultBanner';
import useUserStore from '../store/userStore';
import styles from '../styles/Home.module.css';

const HEADER_HEIGHT = '75px';


const Home = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('appointment');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [resetKey, setResetKey] = useState(0); // 값이 바뀌면 약속잡기 폼을 리마운트해 입력값 초기화
  const kakaoMapRef = useRef<KakaoMapHandle | null>(null); // 지도 제어용 ref (마커 이동 등)

  // 전역 상태 (localStorage에서 복원된 값 포함)
  const {
    users,
    midpointResult,
    clearUsers,
    clearMidpoint,
    clearAppointmentDateTime,
  } = useUserStore();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  // ── 전체 초기화 (사이드바 "새 약속 짜기") ──
  // 전역 상태 + 지도 위 요소 + 약속잡기 입력값을 모두 비운다.
  const handleReset = () => {
    kakaoMapRef.current?.clearAll(); // 지도: 마커·경로·중간지점·반경원 전부 제거
    clearUsers();
    clearMidpoint(); // → 결과 배너/최적경로도 사라짐
    clearAppointmentDateTime();
    setResetKey((k) => k + 1); // 약속잡기 폼 리마운트 (이름·날짜·시간 등 로컬 입력 초기화)
    setActiveTab('appointment');
    showToast('모든 정보가 초기화되었어요.');
  };

  // ── 지도 준비 완료 시, localStorage에서 복원된 상태를 지도에 다시 그림 ──
  // (지도 마커/경로는 명령형이라 저장되지 않으므로, 데이터로부터 재생성한다)
  const redrawFromStore = () => {
    const map = kakaoMapRef.current;
    if (!map) return;
    map.clearAll();
    users.forEach((u) => map.addMarker(u.id, u.lat, u.lng, u.name));
    if (midpointResult) {
      map.addMidpointMarker(
        midpointResult.lat,
        midpointResult.lng,
        midpointResult.name
      );
      midpointResult.routes.forEach((r, idx) => {
        if (r.polyline?.length) map.drawRoute(r.polyline, idx);
      });
    }
    // addMarker가 매번 지도 중심을 옮기므로, 복원 후 전체가 보이도록 맞춘다
    if (users.length > 0) map.fitToMarkers();
  };
 
  return (
    <div className={styles.appShell}>
      {/* ── 고정 헤더 (앱바) · 브랜드 중앙 정렬 ── */}
      <header
        style={{
          flexShrink: 0,
          height: HEADER_HEIGHT,
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '3px',
          zIndex: 100,
          padding: '0 24px',
        }}
      >
        {/* 로고 마크 + 브랜드명 (가로 묶음, 중앙) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--primary), #ff8a63)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-primary)',
              flexShrink: 0,
            }}
          >
            <MapPin size={19} color="#fff" strokeWidth={2.4} />
          </div>
          <h1
            style={{
              color: 'var(--text-strong)',
              margin: 0,
              fontSize: '22px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            여기서 <span style={{ color: 'var(--primary)' }}>만나!</span>
          </h1>
        </div>
        <p
          style={{
            color: 'var(--text-muted)',
            margin: 0,
            fontSize: '12px',
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        >
          친구들의 출발점을 입력하면 최적의 중간지점을 찾아드려요.
        </p>
      </header>

      {/* ── 헤더 아래 콘텐츠 영역 ── */}
      <div className={styles.appBody}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onReset={handleReset}
          toastMessage={toastMessage}
          toastVisible={toastVisible}
        >
          {/*
            조건부 렌더링(&&) 대신 display 토글로 숨긴다.
            탭을 이동해도 언마운트되지 않아 각 탭의 로컬 상태(달력·시간 등)가 유지된다.
          */}
          <div
            style={{ display: activeTab === 'appointment' ? 'block' : 'none' }}
          >
            <AppointmentTab
              key={resetKey}
              onShowToast={showToast}
              mapRef={kakaoMapRef}
            />
          </div>
          <div style={{ display: activeTab === 'routes' ? 'block' : 'none' }}>
            <RouteTab />
          </div>
          <div style={{ display: activeTab === 'places' ? 'block' : 'none' }}>
            <PlaceTab
              onShowToast={showToast}
              mapRef={kakaoMapRef}
              isActive={activeTab === 'places'}
            />
          </div>
          <div style={{ display: activeTab === 'profile' ? 'block' : 'none' }}>
            <ProfileTab />
          </div>
        </Sidebar>

        {/* ── 지도 영역 (결과 배너를 지도 위에 겹쳐 표시) ── */}
        <div className={styles.mapPane}>
          <KakaoMap
            ref={kakaoMapRef}
            center={{ lat: 37.5665, lng: 126.978 }}
            level={5}
            onReady={redrawFromStore}
          />
          <ResultBanner onViewRoutes={() => setActiveTab('routes')} />
        </div>
      </div>
    </div>
  );
};

export default Home;
