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
  // Array.find(): 조건에 맞는 첫 번째 요소 반환, 없으면 undefined
  // ?? (nullish coalescing): 앞이 null/undefined일 때만 뒤 값 사용 (|| 와 다르게 0이나 '' 는 통과)
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
  // 📌 공부 포인트: useState
  // [현재값, 값변경함수] = useState(초기값)
  // 값이 바뀌면 컴포넌트가 자동으로 리렌더링됨
  const [name, setName] = useState('');
  const [departure, setDeparture] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]); // 제네릭: 배열 안에 PlaceResult 타입만 들어올 수 있음
  const [selectedCoords, setSelectedCoords] = useState<{
    // 유니온 타입: 좌표 객체 또는 null
    lat: number;
    lng: number;
  } | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>('transit');
  const [isRecommending, setIsRecommending] = useState(false);
  // (참고) 초기화 모달은 사이드바(Sidebar)에서 담당하므로 여기서는 상태를 두지 않음

  // 날짜/시간 관련 상태
  const now = new Date(); // Date 객체: 현재 시각
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(now.getMonth()); // getMonth(): 0~11 반환 (0=1월)
  const [currentYear, setCurrentYear] = useState(now.getFullYear()); // getFullYear(): 4자리 연도
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [timeValue, setTimeValue] = useState('');

  // 📌 공부 포인트: 커스텀 훅 (useUserStore)
  // Context에서 필요한 값만 구조분해 할당으로 꺼내씀
  // 전역 상태를 한 곳에서 관리하고 어느 컴포넌트에서나 접근 가능
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

  // 해당 월의 마지막 날 계산
  // 📌 공부 포인트: new Date(year, month+1, 0)
  // month+1의 0번째 날 = 해당 월의 마지막 날 (JS Date의 날짜 0은 이전 달 마지막 날을 의미)
  const getDaysInMonth = (y: number, m: number) =>
    new Date(y, m + 1, 0).getDate();

  // 해당 월 1일이 무슨 요일인지 (0=일, 1=월 ... 6=토)
  const getFirstDay = (y: number, m: number) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDay(currentYear, currentMonth);

  // 오늘 이전 날짜 비활성화 판별
  // 📌 공부 포인트: setHours(0,0,0,0)으로 시간을 00:00:00으로 맞춰야
  // 날짜만 정확히 비교 가능 (시간 차이로 인한 오판 방지)
  const isDateDisabled = (day: number) => {
    const t = new Date(currentYear, currentMonth, day);
    t.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return t < today; // 오늘보다 이전이면 true
  };

  // 현재 표시 중인 달력의 날짜가 선택된 날짜와 같은지 확인
  // 📌 공부 포인트: 옵셔널 체이닝 ?.
  // selectedDate가 null이면 undefined 반환 (에러 안 남)
  const isSelectedDay = (day: number) =>
    selectedDate?.getFullYear() === currentYear &&
    selectedDate?.getMonth() === currentMonth &&
    selectedDate?.getDate() === day;

  const isToday = (day: number) =>
    now.getFullYear() === currentYear &&
    now.getMonth() === currentMonth &&
    now.getDate() === day;

  // 📌 공부 포인트: setState에 함수 전달 (함수형 업데이트)
  // setCurrentMonth(m => m - 1) 처럼 이전 값을 받아서 계산할 때 사용
  // setCurrentMonth(currentMonth - 1) 대신 쓰면 비동기 상태 업데이트 시 안전함
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1); // 함수형 업데이트
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

  // 날짜 + 시간 문자열 조합 → 전역 저장
  // 📌 공부 포인트: split(':').map(Number)
  // "09:30" → ['09','30'] → [9, 30] 으로 변환
  // map(Number)는 map(s => Number(s))의 축약형
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
    // 📌 toLocaleString: 날짜를 사람이 읽기 좋은 문자열로 변환
    // 'ko-KR' 로케일 → "2025년 6월 1일 오후 03:00" 형식
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

  // 📌 공부 포인트: 파생 상태 (derived state)
  // 별도 useState 없이 기존 상태에서 계산해서 쓰는 값
  // 리렌더링 시 자동으로 재계산됨
  const canConfirm = selectedDate !== null && timeValue !== '';

  // 📌 공부 포인트: async/await + 동적 import
  // import()는 필요한 시점에 모듈을 불러오는 코드 스플리팅 기법
  // 앱 초기 로딩 속도를 높이기 위해 무거운 로직을 지연 로딩할 때 사용
  const handleRecommendTransport = async () => {
    if (!selectedCoords) {
      onShowToast?.('먼저 출발지를 선택해주세요.');
      return;
    }
    setIsRecommending(true); // 로딩 시작
    try {
      // 동적 import: 버튼 클릭 시점에 모듈 로드
      const { recommendTransport } = await import('../../lib/midpoint');

      // 📌 공부 포인트: Array.reduce()
      // 배열을 순회하며 누적값을 만드는 함수
      // (누적값, 현재요소) => 새 누적값 형태
      // 여기선 lat의 합계를 구한 뒤 멤버 수로 나눠 평균 계산
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

      setTransportMode(rec.mode); // 추천 결과를 이동수단 선택에 바로 반영
      onShowToast?.(`✨ 추천: ${rec.reason}`);
    } catch {
      onShowToast?.('추천 계산에 실패했어요.');
    } finally {
      // 📌 공부 포인트: finally
      // try/catch 결과와 무관하게 항상 실행됨
      // 로딩 상태 해제처럼 "반드시 실행해야 하는 코드"에 사용
      setIsRecommending(false);
    }
  };

  // 카카오 REST API 키워드 검색
  // 📌 공부 포인트: fetch API
  // 브라우저 내장 HTTP 요청 함수
  // headers: 서버에 추가 정보 전달 (여기선 인증 키)
  // Authorization 헤더: API 키 인증 방식 중 하나
  const searchPlaces = async (keyword: string) => {
    setDeparture(keyword);
    if (!keyword.trim()) {
      // trim(): 앞뒤 공백 제거 후 빈 문자열 체크
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        // encodeURIComponent: URL에 한글/특수문자 포함 시 인코딩 필수
        // "강남역" → "%EA%B0%95%EB%82%A8%EC%97%AD"
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
          keyword
        )}&size=5`,
        {
          headers: {
            Authorization: `KakaoAK ${import.meta.env.VITE_KAKAO_REST_KEY}`,
          },
        }
      );
      const data = await res.json(); // 응답을 JSON으로 파싱
      setSuggestions(data.documents ?? []); // data.documents가 없으면 빈 배열
    } catch {
      setSuggestions([]); // 네트워크 오류 등 예외 시 목록 초기화
    }
  };

  // 자동완성 목록에서 장소 선택
  const handleSelectPlace = (place: PlaceResult) => {
    setDeparture(place.place_name);
    setSuggestions([]);
    // 📌 공부 포인트: parseFloat
    // 문자열 → 부동소수점 숫자 변환 ("126.978" → 126.978)
    // 카카오 API는 좌표를 문자열로 반환하기 때문에 변환 필요
    const lat = parseFloat(place.y); // y = 위도(latitude)
    const lng = parseFloat(place.x); // x = 경도(longitude)
    setSelectedCoords({ lat, lng });
    mapRef?.current?.moveToPlace(lat, lng); // ref를 통해 자식 컴포넌트 메서드 직접 호출
  };

  // GPS 현재 위치 감지
  // 📌 공부 포인트: Geolocation API
  // 브라우저 내장 위치 감지 기능
  // getCurrentPosition(성공콜백, 실패콜백)
  // 비동기로 동작 → 사용자가 권한 허용/거부할 때까지 대기
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      onShowToast?.('위치 기능을 지원하지 않아요.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // 성공 콜백: GeolocationPosition 객체 전달
        const { latitude: lat, longitude: lng } = pos.coords; // 구조분해 + 이름 변경
        try {
          // Nominatim: 무료 역지오코딩 API (좌표 → 주소)
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`
          );
          const data = await res.json();
          // 📌 공부 포인트: 단축 평가 (Short-circuit evaluation)
          // || 연산자: 앞이 falsy면 다음 값 시도
          // 주소 정밀도 높은 것부터 순서대로 시도하는 폴백 패턴
          const addr =
            data.address?.quarter || // 동 단위
            data.address?.suburb || // 근교
            data.address?.neighbourhood || // 주거지
            data.address?.city_district || // 구 단위
            data.display_name?.split(',')[0] || // 전체 주소 첫 번째 항목
            `${lat.toFixed(4)}, ${lng.toFixed(4)}`; // 최후 수단: 좌표 문자열
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
        // 실패 콜백: 권한 거부 등
        onShowToast?.('위치 권한을 허용해주세요.');
        setIsLocating(false);
      }
    );
  };

  // 참여자 등록
  const handleRegister = () => {
    // 📌 공부 포인트: 얼리 리턴 (Early Return) 패턴
    // 조건 불만족 시 함수 초반에 return으로 탈출
    // 중첩 if 줄이고 가독성 높이는 패턴
    if (!name.trim() || !departure.trim()) {
      onShowToast?.('이름과 출발지를 모두 입력해주세요!');
      return;
    }
    if (!selectedCoords) {
      onShowToast?.('목록에서 장소를 선택하거나 현재 위치를 감지해주세요!');
      return;
    }
    addUser({
      name: name.trim(),
      departure: departure.trim(),
      lat: selectedCoords.lat,
      lng: selectedCoords.lng,
      transportMode, // 현재 선택된 이동수단 함께 저장
    });
    mapRef?.current?.addMarker(
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

  // 중간 지점 계산
  // 📌 공부 포인트: 동적 import + async/await 조합
  // findMidpoint는 무거운 연산이라 버튼 클릭 시점에만 로드
  // try/catch/finally로 로딩·성공·실패 상태를 명확히 처리
  const handleFindMidpoint = async () => {
    if (users.length < 2) return;
    setCalculating(true);
    clearMidpoint();
    onShowToast?.('중간 지점을 계산 중이에요... 🗺️');
    try {
      const { findMidpoint } = await import('../../lib/midpoint');
      const result = await findMidpoint(users);
      setMidpoint(result); // 결과를 전역 스토어에 저장 → RouteTab에서 읽음
      mapRef?.current?.addMidpointMarker(result.lat, result.lng, result.name);
      // 📌 공부 포인트: Array.forEach
      // 배열 순회, 반환값 없음 (map과 달리 새 배열 안 만듦)
      // 부수효과(side effect)만 수행할 때 사용
      result.routes.forEach((route, idx) => {
        if (route.polyline?.length) {
          mapRef?.current?.drawRoute(route.polyline, idx); // 멤버별 경로 선 그리기
        }
      });
      // 모든 참여자 이름과 중간지점이 한눈에 보이도록 지도 축소
      mapRef?.current?.fitToMarkers();
      onShowToast?.(`중간 지점: ${result.name} 찾았어요! 🎉`);
    } catch (e: any) {
      // e: any → 에러 객체 타입을 any로 명시 (TS에서 catch 변수는 unknown 타입)
      onShowToast?.(e.message ?? '중간 지점 계산에 실패했어요.');
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

        {/* 출발지 입력 + 자동완성 드롭다운
            📌 공부 포인트: position: relative + absolute 조합
            부모에 relative, 자식(드롭다운)에 absolute 주면
            부모 기준으로 위치 잡기 가능 */}
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
                  // 📌 공부 포인트: onMouseDown vs onClick
                  // onClick은 mousedown → mouseup → click 순서
                  // input의 onBlur(포커스 해제)가 mousedown 직후 발생해서
                  // onClick 시점엔 드롭다운이 이미 사라짐 → onMouseDown 사용
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
            {/* 📌 공부 포인트: 배열.map()으로 반복 UI 생성
                TRANSPORT_OPTIONS 배열을 순회하며 버튼 3개 자동 생성
                직접 3개 버튼을 하드코딩하는 것보다 유지보수 용이 */}
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

            {/* 추천 버튼
                📌 공부 포인트: disabled 조건
                isRecommending(로딩중) 이거나 selectedCoords(출발지)가 없으면 비활성화
                || 연산자: 둘 중 하나라도 true면 disabled */}
            <button
              onClick={handleRecommendTransport}
              disabled={isRecommending || !selectedCoords}
              title="출발지 기준 최적 이동수단 추천" // 마우스 호버 시 툴팁
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
            {/* 📌 공부 포인트: key prop
                React가 리스트 아이템을 효율적으로 업데이트하기 위해 필요
                고유한 값이어야 함 (index 사용 비권장 → id 사용 권장)
                key가 바뀌면 컴포넌트를 새로 마운트함 */}
            {users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onRemove={() => {
                  removeUser(user.id);
                  mapRef?.current?.removeMarker(user.name);
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
