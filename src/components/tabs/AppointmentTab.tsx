/**
 * AppointmentTab.tsx — 1번 탭 "약속잡기" (앱에서 가장 큰 화면)
 *
 * 이 앱에서 유일하게 스토어에 "쓰기"를 하는 탭. 나머지 탭은 읽기만 한다.
 *
 * 하는 일:
 *   1) 참여자 등록 — 이름 + 출발지(카카오 검색 / 현재 위치) + 이동수단
 *   2) 약속 시간 선택 — 직접 만든 달력 + 시간 입력
 *   3) 중간지점 찾기 — midpoint 알고리즘 실행 → 스토어 저장 + 지도에 그리기
 *
 * 상태를 두 곳에 나눠 쓴다:
 *   - 로컬 state(useState) : 입력 중인 값 (이름, 검색어, 달력 열림 등)
 *                            → 이 탭 밖에선 아무도 알 필요가 없으므로
 *   - 전역 store(zustand)  : 확정된 값 (참여자 목록, 계산 결과)
 *                            → 다른 탭들이 함께 봐야 하므로
 *
 * 지도 조작은 부모(Home)가 넘겨준 mapRef로 직접 명령한다.
 */
import { useState } from 'react';
import {
  Search,
  UserPlus,
  Users,
  X,
  User,
  LocateFixed,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
  Sparkles,
} from 'lucide-react';

import useUserStore, {
  type UserEntry,
  type TransportMode,
} from '../../store/userStore';
import styles from '../../styles/AppointmentTab.module.css';
import { type KakaoMapHandle } from '../map/KakaoMap';

type PlaceResult = {
  place_name: string;
  address_name: string;
  x: string;
  y: string;
};

type UserProps = {
  onShowToast?: (msg: string) => void;
  mapRef?: React.RefObject<KakaoMapHandle | null>; // React.RefObject: useRef로 만든 ref의 타입. 부모→자식 ref 전달 시 사용
};

const TRANSPORT_OPTIONS: {
  value: TransportMode;
  label: string;
  icon: string;
}[] = [
  { value: 'transit', label: '대중교통', icon: '🚇' },
  { value: 'car', label: '자동차', icon: '🚗' },
  { value: 'walk', label: '도보', icon: '🚶' },
];

// ── UserCard: 순수 표시용 컴포넌트 (상태 없음) ─────────────────
const UserCard = ({
  user,
  onRemove,
}: {
  user: UserEntry;
  onRemove: () => void;
}) => {
  const modeIcon =
    TRANSPORT_OPTIONS.find((t) => t.value === user.transportMode)?.icon ?? '🚇';
  return (
    <div className={styles.userCard}>
      <div className={styles.avatarWrapper}>
        <div className={styles.avatar}>
          <User size={16} color="#fff" />
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{user.name}</div>
          <div className={styles.userDeparture}>
            📍 {user.departure} · {modeIcon}
          </div>
        </div>
      </div>
      <button className={styles.removeButton} onClick={onRemove} title="삭제">
        <X size={16} />
      </button>
    </div>
  );
};

// ── 메인 컴포넌트 ────────────────────────────────────────────
const AppointmentTab = ({ onShowToast, mapRef }: UserProps) => {
  // 참여자 입력 폼 상태
  const [name, setName] = useState('');
  const [departure, setDeparture] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>('transit');
  const [isRecommending, setIsRecommending] = useState(false);

  // 날짜/시간 선택 상태 (초기화 모달은 Sidebar가 담당)
  const now = new Date();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(now.getMonth()); // 0~11
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [timeValue, setTimeValue] = useState('');

  const {
    users,
    addUser,
    removeUser,
    appointmentDateTime,
    setAppointmentDateTime,
    isCalculating,
    setCalculating,
    setMidpoint,
    clearMidpoint,
  } = useUserStore();

  const MONTH_NAMES = [
    '1월',
    '2월',
    '3월',
    '4월',
    '5월',
    '6월',
    '7월',
    '8월',
    '9월',
    '10월',
    '11월',
    '12월',
  ];
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

  // 다음 달 0일 = 이번 달 마지막 날
  const getDaysInMonth = (y: number, m: number) =>
    new Date(y, m + 1, 0).getDate();

  // 해당 월 1일의 요일 (0=일 ~ 6=토) — 달력 첫 주 빈칸 계산용
  const getFirstDay = (y: number, m: number) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDay(currentYear, currentMonth);

  // 지난 날짜는 선택 불가. 시각을 0시로 맞춰 날짜 단위로만 비교한다.
  const isDateDisabled = (day: number) => {
    const t = new Date(currentYear, currentMonth, day);
    t.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return t < today;
  };

  const isSelectedDay = (day: number) =>
    selectedDate?.getFullYear() === currentYear &&
    selectedDate?.getMonth() === currentMonth &&
    selectedDate?.getDate() === day;

  const isToday = (day: number) =>
    now.getFullYear() === currentYear &&
    now.getMonth() === currentMonth &&
    now.getDate() === day;

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else setCurrentMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else setCurrentMonth((m) => m + 1);
  };

  const handleSelectDate = (day: number) => {
    setSelectedDate(new Date(currentYear, currentMonth, day));
    setCalendarOpen(false);
  };

  // 선택한 날짜 + "HH:mm" 시간을 합쳐 전역 상태에 저장
  const handleConfirmDateTime = () => {
    if (!selectedDate || !timeValue) return;
    const [hour, minute] = timeValue.split(':').map(Number);
    const result = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      hour,
      minute
    );
    setAppointmentDateTime(
      result.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    );
    onShowToast?.('약속 시간이 설정되었어요 🗓️');
  };

  const selectedDateLabel = selectedDate
    ? `${selectedDate.getFullYear()}년 ${
        MONTH_NAMES[selectedDate.getMonth()]
      } ${selectedDate.getDate()}일`
    : '날짜 선택';

  const canConfirm = selectedDate !== null && timeValue !== '';

  // 출발지 기준 최적 이동수단 추천.
  // midpoint 모듈은 무거우므로 버튼 클릭 시점에 동적 import (초기 번들 분리)
  const handleRecommendTransport = async () => {
    if (!selectedCoords) {
      onShowToast?.('먼저 출발지를 선택해주세요.');
      return;
    }
    setIsRecommending(true);
    try {
      const { recommendTransport } = await import('../../lib/midpoint');

      // 기준점: 멤버가 있으면 좌표 평균, 없으면 본인 출발지
      const center =
        users.length > 0
          ? {
              lat: users.reduce((s, u) => s + u.lat, 0) / users.length,
              lng: users.reduce((s, u) => s + u.lng, 0) / users.length,
            }
          : selectedCoords;

      const rec = await recommendTransport(
        { name, departure, lat: selectedCoords.lat, lng: selectedCoords.lng },
        center.lat,
        center.lng
      );

      setTransportMode(rec.mode);
      onShowToast?.(`✨ 추천: ${rec.reason}`);
    } catch {
      onShowToast?.('추천 계산에 실패했어요.');
    } finally {
      setIsRecommending(false);
    }
  };

  // 카카오 로컬 키워드 검색 (출발지 자동완성)
  const searchPlaces = async (keyword: string) => {
    setDeparture(keyword);
    if (!keyword.trim()) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
          keyword
        )}&size=5`,
        {
          headers: {
            Authorization: `KakaoAK ${import.meta.env.VITE_KAKAO_REST_KEY}`,
          },
        }
      );
      const data = await res.json();
      setSuggestions(data.documents ?? []);
    } catch {
      setSuggestions([]); // 네트워크 오류 시 목록만 비우고 조용히 실패
    }
  };

  // 자동완성 목록에서 장소 선택 (카카오는 좌표를 문자열로 반환)
  const handleSelectPlace = (place: PlaceResult) => {
    setDeparture(place.place_name);
    setSuggestions([]);
    const lat = parseFloat(place.y);
    const lng = parseFloat(place.x);
    setSelectedCoords({ lat, lng });
    mapRef?.current?.moveToPlace(lat, lng);
  };

  // 브라우저 Geolocation → 역지오코딩으로 주소 변환
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      onShowToast?.('위치 기능을 지원하지 않아요.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          // Nominatim(무료 역지오코딩)으로 좌표 → 주소 변환
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`
          );
          const data = await res.json();
          // 정밀도가 높은 필드부터 순서대로 폴백, 최후엔 좌표 문자열
          const addr =
            data.address?.quarter ||
            data.address?.suburb ||
            data.address?.neighbourhood ||
            data.address?.city_district ||
            data.display_name?.split(',')[0] ||
            `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          setDeparture(addr);
          setSelectedCoords({ lat, lng });
          mapRef?.current?.moveToPlace(lat, lng);
          onShowToast?.('현재 위치를 불러왔어요 📍');
        } catch {
          onShowToast?.('주소 변환에 실패했어요.');
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        onShowToast?.('위치 권한을 허용해주세요.');
        setIsLocating(false);
      }
    );
  };

  // 참여자 등록 (이름·출발지·좌표가 모두 확정된 경우에만)
  const handleRegister = () => {
    if (!name.trim() || !departure.trim()) {
      onShowToast?.('이름과 출발지를 모두 입력해주세요!');
      return;
    }
    if (!selectedCoords) {
      onShowToast?.('목록에서 장소를 선택하거나 현재 위치를 감지해주세요!');
      return;
    }
    const id = addUser({
      name: name.trim(),
      departure: departure.trim(),
      lat: selectedCoords.lat,
      lng: selectedCoords.lng,
      transportMode,
    });
    mapRef?.current?.addMarker(
      id,
      selectedCoords.lat,
      selectedCoords.lng,
      name.trim()
    );
    onShowToast?.(`${name}님이 등록되었습니다! 🎉`);
    // 등록 후 입력 필드 초기화
    setName('');
    setDeparture('');
    setSelectedCoords(null);
    setSuggestions([]);
    setTransportMode('transit');
  };

  // 중간지점 계산 (무거운 모듈이라 클릭 시점에 동적 import)
  const handleFindMidpoint = async () => {
    if (users.length < 2) return;
    setCalculating(true);
    clearMidpoint();
    onShowToast?.('중간 지점을 계산 중이에요... 🗺️');
    try {
      const { findMidpoint } = await import('../../lib/midpoint');
      const result = await findMidpoint(users);
      setMidpoint(result); // 전역 저장 → RouteTab·ResultBanner가 구독
      // 이전 계산의 경로선을 먼저 지운다.
      // (지우지 않으면 재계산할 때마다 옛 경로가 지도에 계속 쌓인다)
      mapRef?.current?.clearRoutes();
      mapRef?.current?.addMidpointMarker(result.lat, result.lng, result.name);
      result.routes.forEach((route, idx) => {
        if (route.polyline?.length) {
          mapRef?.current?.drawRoute(route.polyline, idx);
        }
      });
      // 모든 참여자 이름과 중간지점이 한눈에 보이도록 지도 축소
      mapRef?.current?.fitToMarkers();
      onShowToast?.(`중간 지점: ${result.name} 찾았어요! 🎉`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : '중간 지점 계산에 실패했어요.';
      onShowToast?.(message);
      setCalculating(false);
    }
  };

  return (
    <>
      <div className={styles.tabRoot}>
        {/* ─── 패널 ①: 참여자 등록 ─── */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIcon}>
              <Users size={18} />
            </div>
            <div className={styles.panelTitleWrap}>
              <div className={styles.panelTitle}>누가 모이나요?</div>
              <div className={styles.panelHint}>
                참여자와 출발지·이동수단을 등록하세요
              </div>
            </div>
            {users.length > 0 && (
              <span className={styles.countPill}>{users.length}명</span>
            )}
          </div>
          <div className={styles.panelBody}>

        {/* 이름 입력: controlled input */}
        <div className={styles.inputWrapper}>
          <input
            type="text"
            placeholder="이름 (예: '김철수')"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.inputField}
          />
          <User size={16} color="#999" className={styles.inputIcon} />
        </div>

        {/* 출발지 입력 + 자동완성 드롭다운 (드롭다운을 absolute로 띄우기 위해 relative) */}
        <div className={styles.inputWrapper} style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="출발 역 또는 주소 검색"
            value={departure}
            onChange={(e) => searchPlaces(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRegister()} // Enter키 감지
            className={styles.inputField}
          />
          <Search size={16} color="#999" className={styles.inputIcon} />

          {/* suggestions 배열이 비어있지 않을 때만 드롭다운 표시 */}
          {suggestions.length > 0 && (
            <ul
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 999,
                listStyle: 'none',
                margin: 0,
                padding: '4px',
                overflow: 'hidden',
              }}
            >
              {suggestions.map((place, i) => (
                <li
                  key={i}
                  // onClick은 input의 blur로 드롭다운이 먼저 닫혀 발화하지 않으므로 onMouseDown 사용
                  onMouseDown={() => handleSelectPlace(place)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderRadius: 'var(--r-sm)',
                    fontSize: '13px',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'var(--primary-tint)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <div style={{ fontWeight: 600 }}>{place.place_name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '1px' }}>
                    {place.address_name}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── 이동수단 선택 + 추천 버튼 ── */}
        <div style={{ marginTop: '4px', marginBottom: '4px' }}>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontWeight: 600,
              marginBottom: '6px',
            }}
          >
            이동수단 선택
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {TRANSPORT_OPTIONS.map(({ value, label, icon }) => (
              <button
                key={value}
                onClick={() => setTransportMode(value)}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: 'var(--r-sm)',
                  border: '1.5px solid',
                  // 현재 선택된 이동수단이면 강조 스타일
                  borderColor:
                    transportMode === value ? 'var(--primary)' : 'var(--border-strong)',
                  background:
                    transportMode === value ? 'var(--primary-tint)' : 'var(--surface)',
                  color:
                    transportMode === value ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: transportMode === value ? 700 : 500,
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {icon} {label}
              </button>
            ))}

            {/* 이동수단 추천 (출발지가 정해져야 계산 가능) */}
            <button
              onClick={handleRecommendTransport}
              disabled={isRecommending || !selectedCoords}
              title="출발지 기준 최적 이동수단 추천"
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1.5px solid',
                borderColor: '#FFD700',
                background: '#FFFBEA',
                color: '#B8860B',
                fontWeight: 700,
                fontSize: '12px',
                cursor:
                  isRecommending || !selectedCoords ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                whiteSpace: 'nowrap', // 텍스트 줄바꿈 방지
                opacity: !selectedCoords ? 0.5 : 1, // 비활성화 시 반투명
                transition: 'all 0.15s',
              }}
            >
              <Sparkles size={13} />
              {isRecommending ? '분석중' : '추천'}
            </button>
          </div>
        </div>

        {/* 현재 위치 감지 */}
        <button
          onClick={handleCurrentLocation}
          disabled={isLocating}
          className={styles.locationButton}
        >
          <LocateFixed size={15} />
          {isLocating ? '위치 불러오는 중...' : '현재 위치 감지하기'}
        </button>

        {/* 참여자 추가 */}
        <button onClick={handleRegister} className={styles.registerButton}>
          <UserPlus size={16} />
          참여자 추가하기
        </button>

            {/* 등록된 멤버 목록 (참여자가 있을 때만) */}
            {users.length > 0 && (
              <div className={styles.memberBlock}>
                <div className={styles.memberBlockLabel}>
                  현재 모인 멤버 · {users.length}명
                </div>
                <div className={styles.userCardList}>
            {users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onRemove={() => {
                  removeUser(user.id);
                  mapRef?.current?.removeMarker(user.id);
                }}
              />
            ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─── 패널 ②: 약속 시간 ─── */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIcon}>
              <CalendarDays size={18} />
            </div>
            <div className={styles.panelTitleWrap}>
              <div className={styles.panelTitle}>언제 만나요?</div>
              <div className={styles.panelHint}>날짜와 시간을 정하세요</div>
            </div>
            {appointmentDateTime && (
              <span className={styles.checkPill}>
                <Check size={13} />
                설정됨
              </span>
            )}
          </div>
          <div className={styles.panelBody}>
          <button
            onClick={() => setCalendarOpen((o) => !o)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 'var(--r-md)',
              border: '1.5px solid',
              borderColor: selectedDate ? 'var(--primary)' : 'var(--border-strong)',
              background: selectedDate ? 'var(--primary-tint)' : 'var(--surface)',
              color: selectedDate ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: selectedDate ? 700 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CalendarDays size={14} />
              {selectedDateLabel}
            </span>
            {calendarOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {calendarOpen && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px 6px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <button
                  onClick={prevMonth}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: '#555',
                  }}
                >
                  <ChevronLeft size={15} />
                </button>
                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-strong)' }}>
                  {currentYear}년 {MONTH_NAMES[currentMonth]}
                </span>
                <button
                  onClick={nextMonth}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: '#555',
                  }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  padding: '6px 8px 2px',
                }}
              >
                {DAY_NAMES.map((d, i) => (
                  <div
                    key={d}
                    style={{
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 600,
                      color:
                        i === 0
                          ? 'var(--primary)'
                          : i === 6
                          ? 'var(--transit)'
                          : 'var(--text-subtle)',
                      padding: '2px 0',
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  padding: '0 8px 8px',
                  gap: '2px',
                }}
              >
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const disabled = isDateDisabled(day);
                  const selected = isSelectedDay(day);
                  const today = isToday(day);
                  return (
                    <button
                      key={day}
                      disabled={disabled}
                      onClick={() => handleSelectDate(day)}
                      style={{
                        aspectRatio: '1',
                        border:
                          today && !selected ? '1.5px solid var(--primary)' : 'none',
                        borderRadius: 'var(--r-pill)',
                        fontSize: '12px',
                        fontWeight: selected ? 700 : 500,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        background: selected ? 'var(--primary)' : 'transparent',
                        color: disabled
                          ? 'var(--gray-300)'
                          : selected
                          ? 'var(--on-primary)'
                          : 'var(--text)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 14px',
              borderRadius: 'var(--r-md)',
              border: '1.5px solid',
              borderColor: timeValue ? 'var(--primary)' : 'var(--border-strong)',
              background: timeValue ? 'var(--primary-tint)' : 'var(--surface)',
              transition: 'all 0.15s',
            }}
          >
            <Clock size={14} color={timeValue ? '#FF5A5F' : '#9ca3af'} />
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                fontSize: '13px',
                fontWeight: timeValue ? 700 : 500,
                color: timeValue ? 'var(--primary)' : 'var(--text-muted)',
                outline: 'none',
                cursor: 'pointer',
              }}
            />
          </div>

          <button
            onClick={handleConfirmDateTime}
            disabled={!canConfirm}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 'var(--r-md)',
              border: 'none',
              background: canConfirm ? 'var(--primary)' : 'var(--gray-200)',
              color: canConfirm ? 'var(--on-primary)' : 'var(--text-subtle)',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: canConfirm ? 'var(--shadow-primary)' : 'none',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
          >
            <Check size={14} />
            약속 시간 확인
          </button>

          {appointmentDateTime && (
            <div className={styles.datePreview}>
              <CalendarDays size={14} />
              {appointmentDateTime}
            </div>
          )}
          </div>
        </section>

        {/* ─── 최종 액션: 중간지점 찾기 (하단 고정) ─── */}
        <div className={styles.ctaBar}>
          <button
            disabled={users.length < 2 || isCalculating}
            onClick={handleFindMidpoint}
            className={styles.findCenterButton}
          >
            {isCalculating
              ? '계산 중... ⏳'
              : users.length < 2
              ? `중간 지점 찾기 (${users.length}/2명 이상 필요)`
              : '가장 공평한 중간지점 찾기 🗺️'}
          </button>
        </div>
      </div>
    </>
  );
};

export default AppointmentTab;
