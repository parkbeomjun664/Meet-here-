import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import useUserStore from '../../store/userStore';
import styles from '../../styles/Sidebar.module.css';
import { type KakaoMapHandle } from '../map/KakaoMap';

interface TabProps {
  onShowToast: (msg: string) => void;
  mapRef?: React.RefObject<KakaoMapHandle | null>;
  isActive?: boolean; // 이 탭이 현재 보이는 중인지 (지도 마커 표시 제어)
}

// 카카오 로컬 카테고리 검색 결과 형태
type KakaoPlace = {
  id: string;
  place_name: string;
  category_name: string; // "음식점 > 한식 > 육류,고기"
  distance: string; // 중심에서 거리(m), 문자열
  place_url: string; // 카카오맵 상세 페이지
  road_address_name?: string;
  x: string; // 경도
  y: string; // 위도
};

// 카카오 category_group_code
const CATEGORIES = [
  { code: 'FD6', label: '🍽️ 맛집' },
  { code: 'CE7', label: '☕ 카페' },
  { code: 'CT1', label: '🎭 놀거리' },
  { code: 'AT4', label: '🏛️ 명소' },
];
const RADII = [
  { m: 500, label: '500m' },
  { m: 1000, label: '1km' },
  { m: 2000, label: '2km' },
  { m: 3000, label: '3km' },
];

const PlaceTab = ({ onShowToast, mapRef, isActive }: TabProps) => {
  const { midpointResult } = useUserStore();
  const [category, setCategory] = useState('FD6');
  const [radius, setRadius] = useState(1000);
  const [places, setPlaces] = useState<KakaoPlace[]>([]);
  const [loading, setLoading] = useState(false);

  // ── 중간지점 좌표를 중심으로 카카오 카테고리 검색 ──
  // 탭이 보일 때 + 카테고리/반경/중간지점이 바뀔 때마다 다시 검색
  useEffect(() => {
    if (!isActive || !midpointResult) return;
    let cancelled = false; // 언마운트/재검색 시 이전 응답 무시 (경쟁 상태 방지)

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${category}` +
            `&x=${midpointResult.lng}&y=${midpointResult.lat}` +
            `&radius=${radius}&sort=distance&size=15`,
          {
            headers: {
              Authorization: `KakaoAK ${import.meta.env.VITE_KAKAO_REST_KEY}`,
            },
          }
        );
        const data = await res.json();
        if (!cancelled) setPlaces(data.documents ?? []);
      } catch {
        if (!cancelled) {
          setPlaces([]);
          onShowToast('주변 검색에 실패했어요.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // onShowToast는 매 렌더 새로 생성되므로 의도적으로 의존성에서 제외 (불필요한 재검색 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, midpointResult, category, radius]);

  // ── 지도에 반경 원 + 인프라 마커 표시 (탭 벗어나면 제거) ──
  useEffect(() => {
    const map = mapRef?.current;
    if (!map) return;
    if (isActive && midpointResult) {
      map.drawSearchArea(
        midpointResult.lat,
        midpointResult.lng,
        radius,
        places.map((p) => ({ lat: parseFloat(p.y), lng: parseFloat(p.x) }))
      );
    } else {
      map.clearSearchArea();
    }
  }, [isActive, places, radius, midpointResult, mapRef]);

  const radiusLabel = radius >= 1000 ? `${radius / 1000}km` : `${radius}m`;

  return (
    <div className={styles.tabContentContainer}>
      <div className={styles.sectionGroup}>
        <label className={styles.sectionLabel}>🍽️ 중간지점 주변 인프라</label>

        {/* 중간지점이 아직 없으면 안내 */}
        {!midpointResult ? (
          <p className={styles.emptyTabDescription}>
            먼저 '약속잡기'에서 중간지점을 찾아주세요.
            <br />그 위치를 기준으로 주변 맛집·놀거리를 찾아드려요.
          </p>
        ) : (
          <>
            {/* 카테고리 필터 */}
            <div>
              <div className={styles.filterLabel}>무엇을 찾을까요?</div>
              <div className={styles.filterRow}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setCategory(c.code)}
                    className={`${styles.chip} ${
                      category === c.code ? styles.chipActive : ''
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 반경 필터 */}
            <div>
              <div className={styles.filterLabel}>반경 (중간지점 기준)</div>
              <div className={styles.filterRow}>
                {RADII.map((r) => (
                  <button
                    key={r.m}
                    onClick={() => setRadius(r.m)}
                    className={`${styles.chip} ${
                      radius === r.m ? styles.chipActive : ''
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <p className={styles.infoSummaryText}>
              📍 {midpointResult.name} 기준 반경 {radiusLabel} 이내
              {!loading && ` · ${places.length}곳`}
            </p>

            {/* 결과 목록 */}
            {loading ? (
              <p className={styles.infoSummaryText}>검색 중이에요…</p>
            ) : places.length === 0 ? (
              <p className={styles.emptyTabDescription}>
                이 반경에는 결과가 없어요.
                <br />반경을 넓혀보거나 다른 카테고리를 골라보세요.
              </p>
            ) : (
              <div className={styles.placeCardList}>
                {places.map((p) => {
                  // "음식점 > 한식 > 육류,고기" → "한식 · 육류,고기"
                  const sub =
                    p.category_name.split(' > ').slice(1).join(' · ') ||
                    p.category_name;
                  const distM = Number(p.distance);
                  const distLabel =
                    distM >= 1000 ? `${(distM / 1000).toFixed(1)}km` : `${distM}m`;
                  return (
                    <div key={p.id} className={styles.placeItemCard}>
                      <div className={styles.placeHeader}>
                        <span className={styles.placeCategory}>{sub}</span>
                        <span className={styles.placeDistance}>{distLabel}</span>
                      </div>
                      <h4 className={styles.placeName}>{p.place_name}</h4>
                      {p.road_address_name && (
                        <p className={styles.placeDesc}>{p.road_address_name}</p>
                      )}
                      <a
                        href={p.place_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.placeLink}
                        style={{ marginTop: '8px' }}
                      >
                        카카오맵에서 보기 <ExternalLink size={13} />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PlaceTab;
