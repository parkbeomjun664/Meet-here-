/*
 * 카카오 지도 SDK는 공식 TypeScript 타입을 제공하지 않는다.
 * SDK 인스턴스를 담는 ref에 한해 any를 허용하고,
 * 외부에는 KakaoMapHandle 인터페이스로 타입 안전성을 보장한다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useState,
} from 'react';

// 지도 컴포넌트가 받는 props 타입
interface KakaoMapProps {
  center?: { lat: number; lng: number }; // 지도 초기 중심 좌표
  level?: number; // 지도 초기 확대 레벨 (숫자 클수록 넓게)
  onReady?: () => void; // 지도 초기화가 끝난 직후 호출 (저장된 마커 복원용)
}

// 부모 컴포넌트에서 ref로 호출할 수 있는 메서드 타입
export interface KakaoMapHandle {
  moveToPlace: (lat: number, lng: number) => void;
  addMarker: (lat: number, lng: number, name: string) => void;
  removeMarker: (name: string) => void;
  addMidpointMarker: (lat: number, lng: number, name: string) => void; // 중간지점 전용 마커
  removeMidpointMarker: () => void;
  drawRoute: (polyline: [number, number][], colorIndex: number) => void; // 경로 선 그리기
  clearRoutes: () => void; // 모든 경로 선 제거
  fitToMarkers: () => void; // 모든 참여자+중간지점이 한 화면에 보이도록 지도 범위 맞춤
  // 반경 원 + 주변 인프라 마커 표시 (맛집/놀거리 탭)
  drawSearchArea: (
    lat: number,
    lng: number,
    radiusM: number,
    places: { lat: number; lng: number }[]
  ) => void;
  clearSearchArea: () => void; // 반경 원 + 인프라 마커 제거
  clearAll: () => void; // 지도 위 모든 요소 제거 (초기화용)
}

const KAKAO_APP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY?.trim(); // 카카오 JavaScript 앱 키

// setBounds 여백(px). 화면이 좁으면 여백을 줄여야 마커가 다 들어온다.
const boundsPadding = (): [number, number, number, number] =>
  window.innerWidth <= 768 ? [44, 28, 28, 28] : [90, 70, 70, 70];

const KakaoMap = forwardRef<KakaoMapHandle, KakaoMapProps>(
  ({ center = { lat: 37.5665, lng: 126.978 }, level = 7, onReady }, ref) => {
    const mapRef = useRef<HTMLDivElement>(null); // 지도가 렌더링될 DOM 요소
    const onReadyRef = useRef(onReady); // 최신 onReady 보관 (initMap 의존성 고정용)
    onReadyRef.current = onReady;
    const mapInstanceRef = useRef<any>(null); // 카카오 Map 인스턴스 보관
    const previewMarkerRef = useRef<any>(null); // 검색 시 미리보기 마커
    const [mapError, setMapError] = useState<string | null>(null);
    const userMarkersRef = useRef<Map<string, any>>(new Map()); // 참여자별 마커 보관 (이름 → 마커)
    const midpointMarkerRef = useRef<any>(null); // 중간지점 마커 별도 보관 (컴포넌트 최상단에 선언)
    const routeLinesRef = useRef<any[]>([]); // 경로 폴리라인 목록
    const placeMarkersRef = useRef<any[]>([]); // 주변 인프라(맛집/놀거리) 마커
    const radiusCircleRef = useRef<any>(null); // 검색 반경 표시 원
    // 부모에서 ref.current.xxx() 호출 시 실행될 로직 정의
    useImperativeHandle(ref, () => ({
      // 검색 시 미리보기 마커 이동
      moveToPlace: (lat, lng) => {
        if (!mapInstanceRef.current) return;
        const position = new window.kakao.maps.LatLng(lat, lng);
        if (previewMarkerRef.current) previewMarkerRef.current.setMap(null); // 기존 미리보기 마커 제거
        previewMarkerRef.current = new window.kakao.maps.Marker({ position }); // 새 미리보기 마커 생성
        previewMarkerRef.current.setMap(mapInstanceRef.current); // 지도에 표시
        mapInstanceRef.current.setCenter(position); // 지도 중심 이동
      },

      // 중간지점 마커 (별 모양 강조 스타일)
      addMidpointMarker: (lat, lng, name) => {
        if (!mapInstanceRef.current) return;
        const position = new window.kakao.maps.LatLng(lat, lng);

        if (midpointMarkerRef.current) midpointMarkerRef.current.setMap(null); // 기존 중간지점 마커 제거

        const content = `
          <div style=" 
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
          ">
            <div style="
              background: #FFD700;
              color: #333;
              padding: 6px 12px;
              border-radius: 20px;
              font-size: 13px;
              font-weight: 800;
              white-space: nowrap;
              box-shadow: 0 2px 8px rgba(0,0,0,0.25);
              border: 2px solid #FFA500;
            ">⭐ ${name}</div>
            <div style="
              width: 0; height: 0;
              border-left: 7px solid transparent;
              border-right: 7px solid transparent;
              border-top: 10px solid #FFD700;
            "></div>
            <div style="
              width: 14px; height: 14px;
              background: #FFD700;
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            "></div>
          </div>
        `;

        midpointMarkerRef.current = new window.kakao.maps.CustomOverlay({
          position,
          content,
          yAnchor: 1,
        });
        midpointMarkerRef.current.setMap(mapInstanceRef.current);
        // 줌/중심은 fitToMarkers가 전체가 보이도록 맞추므로 여기선 손대지 않음
      },

      // 중간지점 마커 제거
      removeMidpointMarker: () => {
        if (midpointMarkerRef.current) {
          midpointMarkerRef.current.setMap(null);
          midpointMarkerRef.current = null;
        }
      },

      // 참여자 등록 시 이름 라벨이 달린 마커 추가
      addMarker: (lat, lng, name) => {
        if (!mapInstanceRef.current) return;
        const position = new window.kakao.maps.LatLng(lat, lng);

        // 이름 라벨 커스텀 오버레이 HTML
        const content = `
          <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
          ">
            <div style="
              background: #FF5A5F;
              color: white;
              padding: 4px 10px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 700;
              white-space: nowrap;
              box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            ">${name}</div>
            <div style="
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 8px solid #FF5A5F;
            "></div>
            <div style="
              width: 10px;
              height: 10px;
              background: #FF5A5F;
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>
          </div>
        `;

        // 기존에 같은 이름 마커가 있으면 제거 후 재생성
        if (userMarkersRef.current.has(name)) {
          userMarkersRef.current.get(name).setMap(null);
        }

        const overlay = new window.kakao.maps.CustomOverlay({
          position,
          content,
          yAnchor: 1, // 오버레이 하단이 좌표에 맞춰짐
        });
        overlay.setMap(mapInstanceRef.current);
        userMarkersRef.current.set(name, overlay); // 이름을 key로 마커 저장

        // 미리보기 마커 제거 (참여자 마커로 대체됐으므로)
        if (previewMarkerRef.current) {
          previewMarkerRef.current.setMap(null);
          previewMarkerRef.current = null;
        }

        mapInstanceRef.current.setCenter(position); // 지도 중심을 참여자 위치로 이동
      },
      // 멤버별 경로를 지도에 선으로 그리기
      // 참여자 삭제 시 해당 마커 제거
      removeMarker: (name) => {
        if (userMarkersRef.current.has(name)) {
          userMarkersRef.current.get(name).setMap(null); // 지도에서 마커 숨김
          userMarkersRef.current.delete(name); // Map에서 참조 제거
        }
      },

      drawRoute: (polyline, colorIndex) => {
        if (!mapInstanceRef.current || !polyline.length) return;
        const COLORS = ['#FF5A5F', '#4A90D9', '#2ECC71', '#F39C12', '#9B59B6'];
        const color = COLORS[colorIndex % COLORS.length];

        const path = polyline.map(
          ([lat, lng]) => new window.kakao.maps.LatLng(lat, lng)
        );
        const line = new window.kakao.maps.Polyline({
          path,
          strokeWeight: 4, // 선 두께
          strokeColor: color, // 멤버별 고유 색상
          strokeOpacity: 0.8,
          strokeStyle: 'solid',
        });
        line.setMap(mapInstanceRef.current);
        routeLinesRef.current.push(line); // 나중에 제거할 수 있도록 보관
      },

      // 모든 경로 선 제거
      clearRoutes: () => {
        routeLinesRef.current.forEach((line) => line.setMap(null));
        routeLinesRef.current = [];
      },

      // 모든 참여자 마커 + 중간지점이 한 화면에 들어오도록 지도 범위를 맞춤
      fitToMarkers: () => {
        if (!mapInstanceRef.current || !window.kakao?.maps) return;
        const bounds = new window.kakao.maps.LatLngBounds();
        let count = 0;
        userMarkersRef.current.forEach((overlay) => {
          bounds.extend(overlay.getPosition()); // 참여자 마커 위치 포함
          count++;
        });
        if (midpointMarkerRef.current) {
          bounds.extend(midpointMarkerRef.current.getPosition()); // 중간지점 포함
          count++;
        }
        if (count === 0) return;
        // 상·우·하·좌 여백(px): 이름 라벨이 화면 가장자리에 잘리지 않도록
        const [t, r, b, l] = boundsPadding();
        mapInstanceRef.current.setBounds(bounds, t, r, b, l);
      },

      // 검색 반경 원 + 주변 인프라 마커를 지도에 표시하고, 반경이 다 보이도록 맞춤
      drawSearchArea: (lat, lng, radiusM, places) => {
        if (!mapInstanceRef.current || !window.kakao?.maps) return;
        const center = new window.kakao.maps.LatLng(lat, lng);

        // 1) 반경 원 (기존 것 제거 후 새로)
        if (radiusCircleRef.current) radiusCircleRef.current.setMap(null);
        radiusCircleRef.current = new window.kakao.maps.Circle({
          center,
          radius: radiusM,
          strokeWeight: 2,
          strokeColor: '#FF5A5F',
          strokeOpacity: 0.8,
          strokeStyle: 'dashed',
          fillColor: '#FF5A5F',
          fillOpacity: 0.06,
        });
        radiusCircleRef.current.setMap(mapInstanceRef.current);

        // 2) 인프라 마커 (기존 것 제거 후 새로)
        placeMarkersRef.current.forEach((m) => m.setMap(null));
        placeMarkersRef.current = [];
        const dot =
          '<div style="width:14px;height:14px;background:#FF5A5F;' +
          'border:2px solid #fff;border-radius:50%;' +
          'box-shadow:0 1px 5px rgba(0,0,0,0.35);"></div>';
        places.forEach((p) => {
          const overlay = new window.kakao.maps.CustomOverlay({
            position: new window.kakao.maps.LatLng(p.lat, p.lng),
            content: dot,
          });
          overlay.setMap(mapInstanceRef.current);
          placeMarkersRef.current.push(overlay);
        });

        // 3) 반경 원 전체가 보이도록 지도 범위 맞춤
        const [pt, pr, pb, pl] = boundsPadding();
        mapInstanceRef.current.setBounds(
          radiusCircleRef.current.getBounds(),
          pt,
          pr,
          pb,
          pl
        );
      },

      // 반경 원 + 인프라 마커 제거 (다른 탭으로 이동 시)
      clearSearchArea: () => {
        if (radiusCircleRef.current) {
          radiusCircleRef.current.setMap(null);
          radiusCircleRef.current = null;
        }
        placeMarkersRef.current.forEach((m) => m.setMap(null));
        placeMarkersRef.current = [];
      },

      // 지도 위 모든 요소 제거 (초기화 버튼용): 참여자·미리보기·중간지점·경로·반경·인프라
      clearAll: () => {
        userMarkersRef.current.forEach((m) => m.setMap(null));
        userMarkersRef.current.clear();
        if (previewMarkerRef.current) {
          previewMarkerRef.current.setMap(null);
          previewMarkerRef.current = null;
        }
        if (midpointMarkerRef.current) {
          midpointMarkerRef.current.setMap(null);
          midpointMarkerRef.current = null;
        }
        routeLinesRef.current.forEach((l) => l.setMap(null));
        routeLinesRef.current = [];
        if (radiusCircleRef.current) {
          radiusCircleRef.current.setMap(null);
          radiusCircleRef.current = null;
        }
        placeMarkersRef.current.forEach((m) => m.setMap(null));
        placeMarkersRef.current = [];
      },
    }));

    // 지도 초기화 함수 (useCallback으로 감싸 불필요한 재생성 방지)
    const initMap = useCallback(() => {
      if (!mapRef.current) return;
      const options = {
        center: new window.kakao.maps.LatLng(center.lat, center.lng), // 초기 중심 좌표
        level, // 초기 확대 레벨
      };
      mapInstanceRef.current = new window.kakao.maps.Map(
        mapRef.current, // 지도를 렌더링할 DOM 요소
        options
      );
      onReadyRef.current?.(); // 초기화 완료 알림 → 저장된 마커/경로 복원
    }, [center.lat, center.lng, level]);

    useEffect(() => {
      if (!KAKAO_APP_KEY) {
        setMapError(
          '카카오 지도 API 키가 설정되지 않았습니다. .env에 VITE_KAKAO_MAP_KEY를 추가해주세요.'
        );
        return;
      }

      setMapError(null);

      const existingScript = document.querySelector(
        'script[src*="dapi.kakao.com"]'
      );

      if (existingScript) {
        // 스크립트 태그는 있지만 kakao 객체가 아직 준비됐는지 확인
        if (window.kakao?.maps) {
          initMap(); // 이미 로드 완료 → 바로 초기화
        } else {
          // 아직 로드 중 → 완료 후 초기화
          existingScript.addEventListener('load', () => {
            window.kakao.maps.load(() => initMap());
          });
        }
        return;
      }

      // 스크립트 태그가 없으면 새로 생성해서 삽입
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&libraries=services&autoload=false`;
      // libraries=services: 키워드 검색 등 부가 기능 포함
      // autoload=false: 스크립트 로드 후 수동으로 kakao.maps.load() 호출
      script.async = true;
      document.head.appendChild(script);

      script.onload = () => {
        window.kakao.maps.load(() => initMap()); // SDK 준비 완료 후 지도 초기화
      };

      script.onerror = () => {
        setMapError('카카오 지도 SDK를 불러오지 못했습니다. 네트워크 상태를 확인해주세요.');
      };
    }, [initMap]); // KAKAO_APP_KEY는 모듈 상수라 의존성 대상이 아님

    // 컨테이너 크기가 바뀌면 카카오 지도에 relayout()을 알려야 한다.
    // (모바일 화면 회전, 주소창 노출/숨김, 레이아웃 전환 시 지도가 잘리거나 회색으로 남는 문제 방지)
    useEffect(() => {
      const el = mapRef.current;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => {
        mapInstanceRef.current?.relayout();
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    // 지도가 렌더링될 빈 div (width/height 100%로 부모 크기에 맞춤)
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {mapError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(255,255,255,0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              textAlign: 'center',
              color: '#333',
              fontSize: '14px',
              lineHeight: 1.5,
            }}
          >
            <div>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🗺️</div>
              <div>{mapError}</div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default KakaoMap;
