import type {
  MidpointResult,
  UserEntry,
  TransportMode,
} from '../store/userStore';

const KAKAO_REST_KEY = import.meta.env.VITE_KAKAO_REST_KEY;
const ODSAY_KEY = import.meta.env.VITE_ODSAY_KEY;

// 자동차 유류비 단가 (원/km) — 연비·유가 기반 추정치. 여기 한 곳만 바꾸면 전체 반영됨.
const FUEL_PER_KM = 170;

// 경로 계산 결과 공통 형태 (대중교통/자동차/도보 모두 이 모양으로 반환)
type RouteResult = {
  totalTime: number; // 소요 시간(분)
  totalFare: number; // 총 비용(원)
  transferCount: number; // 환승 횟수 (대중교통만 의미 있음)
  mode: TransportMode;
  polyline: [number, number][]; // 지도에 그릴 경로 좌표
  distance?: number; // 이동 거리(km) — 자동차/도보에서 채움
  fareNote?: string; // 비용이 어떻게 산출됐는지 설명 (UI 표시용)
};

// ── 거리 계산 (Haversine) ─────────────────────────────────────
export const calcDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// 멤버들 좌표의 평균 중심점
const calcCenter = (users: UserEntry[]) => ({
  lat: users.reduce((s, u) => s + u.lat, 0) / users.length,
  lng: users.reduce((s, u) => s + u.lng, 0) / users.length,
});

// ── 후보 지점 검색 (거리에 따라 전략 변경) ──────────────────────
const fetchNearbyCandidates = async (
  lat: number,
  lng: number,
  distanceKm: number
) => {
  // 거리별 검색 전략
  // 50km 초과: KTX/고속터미널 우선 검색
  // 10~50km: 반경 넓혀서 지하철역 검색
  // 10km 이하: 일반 지하철역 검색

  const strategies =
    distanceKm > 50
      ? [
          { query: 'KTX역', radius: 50000 },
          { query: '고속버스터미널', radius: 50000 },
          { query: '시외버스터미널', radius: 50000 },
          { query: '지하철역', radius: 30000 },
        ]
      : distanceKm > 10
      ? [
          { query: '지하철역', radius: 20000 },
          { query: '버스터미널', radius: 20000 },
        ]
      : [
          { query: '지하철역', radius: 5000 },
          { query: '버스정류장', radius: 3000 },
        ];

  const results: { place_name: string; x: string; y: string }[] = [];

  for (const { query, radius } of strategies) {
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
          query
        )}&x=${lng}&y=${lat}&radius=${radius}&size=5&sort=distance`,
        { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
      );
      const data = await res.json();
      if (data.documents?.length) {
        results.push(...data.documents);
      }
    } catch {
      /* 개별 검색 실패는 무시 */
    }
  }

  // 중복 제거 (place_name 기준)
  const seen = new Set<string>();
  return results
    .filter((r) => {
      if (seen.has(r.place_name)) return false;
      seen.add(r.place_name);
      return true;
    })
    .slice(0, 8); // 최대 8개 후보
};

// ── 이동수단별 경로 계산 ──────────────────────────────────────

// 대중교통: ODsay API (도시간 포함)
const fetchTransitRoute = async (
  oLng: number,
  oLat: number,
  dLng: number,
  dLat: number
): Promise<RouteResult | null> => {
  const key = encodeURIComponent(ODSAY_KEY);

  // 도시내 경로 먼저 시도
  try {
    const res = await fetch(
      `https://api.odsay.com/v1/api/searchPubTransPathT?SX=${oLng}&SY=${oLat}&EX=${dLng}&EY=${dLat}&apiKey=${key}`
    );
    const data = await res.json();
    if (!data.error && data.result?.path?.length) {
      const best = data.result.path[0].info;
      const polyline: [number, number][] = [];
      for (const sub of data.result.path[0].subPath ?? []) {
        if (sub.passStopList?.stations) {
          for (const st of sub.passStopList.stations) {
            if (st.x && st.y)
              polyline.push([parseFloat(st.y), parseFloat(st.x)]);
          }
        }
      }
      return {
        totalTime: best.totalTime as number,
        totalFare: best.payment as number,
        transferCount: (best.busTransitCount +
          best.subwayTransitCount) as number,
        mode: 'transit' as TransportMode,
        polyline,
        fareNote: '대중교통 요금 (버스·지하철 기준)',
      };
    }
  } catch {
    /* 도시내 실패 시 도시간 시도 */
  }

  // 도시간 경로 시도 (서울-부산 등 장거리)
  try {
    const res = await fetch(
      `https://api.odsay.com/v1/api/searchPubTransPathT?SX=${oLng}&SY=${oLat}&EX=${dLng}&EY=${dLat}&SearchType=1&apiKey=${key}`
    );
    const data = await res.json();
    if (!data.error && data.result?.path?.length) {
      const best = data.result.path[0].info;
      const polyline: [number, number][] = [
        [oLat, oLng],
        [dLat, dLng],
      ]; // 장거리는 직선으로
      return {
        totalTime: best.totalTime as number,
        totalFare: best.payment as number,
        transferCount: (best.busTransitCount +
          best.subwayTransitCount) as number,
        mode: 'transit' as TransportMode,
        polyline,
        fareNote: '대중교통 요금 (버스·지하철 기준)',
      };
    }
  } catch {
    /* 실패 */
  }

  return null;
};

// 자동차: 카카오모빌리티 Directions API
const fetchCarRoute = async (
  oLng: number,
  oLat: number,
  dLng: number,
  dLat: number
): Promise<RouteResult | null> => {
  try {
    const res = await fetch(
      `https://apis-navi.kakaomobility.com/v1/directions?origin=${oLng},${oLat}&destination=${dLng},${dLat}&priority=RECOMMEND`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    );
    const data = await res.json();
    if (!data.routes?.length || data.routes[0].result_code !== 0) return null;

    const summary = data.routes[0].summary;
    const polyline: [number, number][] = [];
    for (const section of data.routes[0].sections ?? []) {
      for (const road of section.roads ?? []) {
        const verts: number[] = road.vertexes ?? [];
        for (let i = 0; i < verts.length - 1; i += 2) {
          polyline.push([verts[i + 1], verts[i]]);
        }
      }
    }
    // 자동차 비용 = 톨비(카카오모빌리티 제공) + 기름값(거리 × 단가 추정)
    const distanceKm = Math.round(summary.distance / 1000);
    const toll = (summary.fare?.toll ?? 0) as number;
    const fuel = distanceKm * FUEL_PER_KM;
    return {
      totalTime: Math.round(summary.duration / 60),
      totalFare: toll + fuel,
      transferCount: 0,
      distance: distanceKm,
      mode: 'car' as TransportMode,
      polyline,
      fareNote: `톨비 ${toll.toLocaleString()}원 + 기름값 ${fuel.toLocaleString()}원 (약 ${distanceKm}km × ${FUEL_PER_KM}원/km)`,
    };
  } catch {
    return null;
  }
};

// 도보: 직선거리 기반 추정
const estimateWalkRoute = (
  oLat: number,
  oLng: number,
  dLat: number,
  dLng: number
): RouteResult => {
  const dist = calcDistance(oLat, oLng, dLat, dLng) * 1.3;
  return {
    totalTime: Math.round((dist / 4) * 60),
    totalFare: 0,
    transferCount: 0,
    distance: Math.round(dist * 10) / 10,
    mode: 'walk' as TransportMode,
    polyline: [
      [oLat, oLng],
      [dLat, dLng],
    ] as [number, number][],
    fareNote: '도보 이동 (요금 없음)',
  };
};

// ── 도시간(장거리) 대중교통 추정 ──────────────────────────────
// ODsay는 도시내(intra-city) 위주라 서울↔부산·강릉 같은 장거리는 경로가 안 나온다.
// 그래서 이 거리 이상이면 KTX/고속버스 기준으로 시간·요금을 근사하고,
// 지도 선은 카카오모빌리티(자동차) 도로 경로로 그려 자연스럽게 표시한다.
const INTERCITY_KM = 40; // 이 직선거리(km) 이상이면 도시간 추정 적용

const estimateIntercityTransit = async (
  oLng: number,
  oLat: number,
  dLng: number,
  dLat: number,
  dist: number
): Promise<RouteResult> => {
  // 실제 도로 회랑을 따라가는 경로선 확보 (실패하면 직선)
  const car = await fetchCarRoute(oLng, oLat, dLng, dLat);
  const polyline: [number, number][] = car?.polyline?.length
    ? car.polyline
    : [
        [oLat, oLng],
        [dLat, dLng],
      ];
  const km = Math.round(dist);
  // KTX 표정속도 근사(직선거리 기준 약 120km/h) + 접근·대기 40분
  const totalTime = Math.round((dist / 120) * 60 + 40);
  // 거리 비례 요금 근사(약 180원/km, 최소 8,400원) — 서울-부산 ≈ 58,500원 수준
  const totalFare = Math.max(8400, Math.round(dist * 180));
  return {
    totalTime,
    totalFare,
    transferCount: 0,
    mode: 'transit' as TransportMode,
    distance: km,
    polyline,
    fareNote: `KTX·고속버스 예상 (약 ${km}km · 접근·대기 포함)`,
  };
};

// 거리 기반 자동 폴백: 어떤 이동수단이든 반드시 결과 반환
const fetchRouteFallback = async (
  user: UserEntry,
  dLat: number,
  dLng: number
): Promise<RouteResult> => {
  const dist = calcDistance(user.lat, user.lng, dLat, dLng);

  // 사용자가 선택한 이동수단 먼저 시도
  if (user.transportMode === 'transit') {
    // 장거리(도시간)면 도시내 대중교통 API는 결과가 없으므로 KTX/고속버스 추정
    if (dist >= INTERCITY_KM) {
      return estimateIntercityTransit(user.lng, user.lat, dLng, dLat, dist);
    }
    const r = await fetchTransitRoute(user.lng, user.lat, dLng, dLat);
    if (r) return r;
    // 대중교통 실패 → 자동차 시도
    const car = await fetchCarRoute(user.lng, user.lat, dLng, dLat);
    if (car) return car;
  } else if (user.transportMode === 'car') {
    const r = await fetchCarRoute(user.lng, user.lat, dLng, dLat);
    if (r) return r;
    // 자동차 실패 → 대중교통 시도
    const transit = await fetchTransitRoute(user.lng, user.lat, dLng, dLat);
    if (transit) return transit;
  } else {
    // 도보 → 짧으면 도보, 장거리면 도시간 추정, 그 외엔 대중교통
    if (dist <= 5) return estimateWalkRoute(user.lat, user.lng, dLat, dLng);
    if (dist >= INTERCITY_KM) {
      return estimateIntercityTransit(user.lng, user.lat, dLng, dLat, dist);
    }
    const transit = await fetchTransitRoute(user.lng, user.lat, dLng, dLat);
    if (transit) return transit;
  }

  // 모두 실패 → 거리 기반 추정치 반환 (절대 null 안 냄)
  if (dist >= INTERCITY_KM) {
    // 장거리 최후 수단: KTX/고속버스 추정 (도로 경로 없이 직선)
    const km = Math.round(dist);
    return {
      totalTime: Math.round((dist / 120) * 60 + 40),
      totalFare: Math.max(8400, Math.round(dist * 180)),
      transferCount: 0,
      mode: 'transit' as TransportMode,
      distance: km,
      polyline: [
        [user.lat, user.lng],
        [dLat, dLng],
      ] as [number, number][],
      fareNote: `KTX·고속버스 예상 (약 ${km}km · 직선 추정)`,
    };
  }
  if (dist > 10) {
    // 중거리: 자동차 추정 (평균 60km/h) — 기름값만 추정 (톨비 정보 없음)
    const km = Math.round(dist);
    return {
      totalTime: Math.round((dist / 60) * 60),
      totalFare: Math.round(dist * FUEL_PER_KM),
      transferCount: 0,
      mode: 'car' as TransportMode,
      distance: km,
      polyline: [
        [user.lat, user.lng],
        [dLat, dLng],
      ] as [number, number][],
      fareNote: `기름값 추정 (약 ${km}km × ${FUEL_PER_KM}원/km · 톨비 미포함)`,
    };
  }
  // 단거리: 도보 추정
  return estimateWalkRoute(user.lat, user.lng, dLat, dLng);
};

// ── 추천 이동수단 계산 (추천 버튼용) ─────────────────────────────
export const recommendTransport = async (
  userPartial: { lat: number; lng: number; name: string; departure: string },
  centerLat: number,
  centerLng: number
): Promise<{ mode: TransportMode; reason: string; totalTime: number }> => {
  const dist = calcDistance(
    userPartial.lat,
    userPartial.lng,
    centerLat,
    centerLng
  );

  // 2km 이하는 무조건 도보 추천
  if (dist < 2) {
    return {
      mode: 'walk',
      reason: `직선거리 ${dist.toFixed(1)}km — 도보로 충분해요`,
      totalTime: Math.round(((dist * 1.3) / 4) * 60),
    };
  }

  // 대중교통 + 자동차 동시 계산
  const [transitRes, carRes] = await Promise.allSettled([
    fetchTransitRoute(userPartial.lng, userPartial.lat, centerLng, centerLat),
    fetchCarRoute(userPartial.lng, userPartial.lat, centerLng, centerLat),
  ]);

  const transit = transitRes.status === 'fulfilled' ? transitRes.value : null;
  const car = carRes.status === 'fulfilled' ? carRes.value : null;

  // 둘 다 성공: 소요시간 비교해서 추천
  if (transit && car) {
    if (transit.totalTime <= car.totalTime * 1.2) {
      return {
        mode: 'transit',
        reason: `대중교통 ${transit.totalTime}분 vs 자동차 ${car.totalTime}분 — 대중교통이 효율적이에요`,
        totalTime: transit.totalTime,
      };
    }
    return {
      mode: 'car',
      reason: `자동차 ${car.totalTime}분 vs 대중교통 ${transit.totalTime}분 — 자동차가 더 빠릅니다`,
      totalTime: car.totalTime,
    };
  }
  if (transit)
    return {
      mode: 'transit',
      reason: `대중교통으로 약 ${transit.totalTime}분 소요`,
      totalTime: transit.totalTime,
    };
  if (car)
    return {
      mode: 'car',
      reason: `자동차로 약 ${car.totalTime}분 소요`,
      totalTime: car.totalTime,
    };

  // API 실패 시 거리 기반 추정
  if (dist > 100)
    return {
      mode: 'transit',
      reason: `장거리(${Math.round(dist)}km) — KTX/고속버스 이용을 추천해요`,
      totalTime: Math.round(dist * 0.4),
    };
  if (dist > 30)
    return {
      mode: 'car',
      reason: `중거리(${Math.round(dist)}km) — 자동차가 편리해요`,
      totalTime: Math.round(dist * 1.5),
    };
  return {
    mode: 'transit',
    reason: `${Math.round(dist)}km — 대중교통 이용을 추천해요`,
    totalTime: Math.round(dist * 3),
  };
};

// ── 후보 점수 가중치 ───────────────────────────────────────────
// 세 지표를 각각 0~1로 정규화한 뒤 가중 합산한다. (점수가 낮을수록 좋은 후보)
// 합이 1이 되도록 두면 "각 항목이 결과에 몇 % 영향을 주는지" 직관적으로 읽힌다.
const SCORE_WEIGHTS = {
  fairness: 0.5, // 이동시간 편차(공평성) — 가장 중요
  time: 0.3, // 평균 이동시간 — 전체적으로 빨리 모이는가
  cost: 0.2, // 평균 교통비 — 돈이 적게 드는가
};

// 평균
const mean = (values: number[]) =>
  values.reduce((s, v) => s + v, 0) / values.length;

// 표준편차: max-min(편차)은 한 명의 극단값에 휘둘리기 쉬워서,
// 전체 분포의 흩어짐을 함께 보기 위해 사용한다.
const stdDev = (values: number[]) => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
};

// min-max 정규화: 분(minute)과 원(won)처럼 단위·규모가 다른 지표를
// 0~1로 맞춰 공정하게 합산하기 위함. (모두 같은 값이면 0으로 나눔 방지)
const normalize = (values: number[]): number[] => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) => (v - min) / range);
};

// ── 메인: 가장 공평하고(시간) 저렴한(비용) 중간지점 탐색 ─────────
export const findMidpoint = async (
  users: UserEntry[]
): Promise<MidpointResult> => {
  const center = calcCenter(users);

  // 멤버 간 최대 거리 계산 (검색 전략 결정용)
  let maxDist = 0;
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const d = calcDistance(
        users[i].lat,
        users[i].lng,
        users[j].lat,
        users[j].lng
      );
      if (d > maxDist) maxDist = d;
    }
  }

  const candidates = await fetchNearbyCandidates(
    center.lat,
    center.lng,
    maxDist
  );

  // 후보가 없어도 중심점 자체를 후보로 추가 (어떤 상황에서도 결과 보장)
  if (!candidates.length) {
    candidates.push({
      place_name: '중간 지점',
      x: String(center.lng),
      y: String(center.lat),
    });
  }

  // ── 1) 후보별로 "모든 멤버의 경로를 병렬(Promise.all)"로 계산 ──
  // 예전엔 멤버를 for문으로 하나씩 await → 멤버가 N명이면 N배 느렸다.
  // Promise.all로 동시에 요청하면 한 후보당 "가장 느린 한 명" 시간이면 끝난다.
  // (후보 루프는 순차로 두어 외부 API 동시 요청 폭주를 막는다 = 속도/안정성 균형)
  const evaluated = [];
  for (const candidate of candidates) {
    const dLat = parseFloat(candidate.y);
    const dLng = parseFloat(candidate.x);

    const routes: MidpointResult['routes'] = await Promise.all(
      users.map(async (user) => {
        // fetchRouteFallback은 절대 null을 반환하지 않음 → 항상 결과 보장
        const route = await fetchRouteFallback(user, dLat, dLng);
        return {
          userName: user.name,
          totalTime: route.totalTime,
          totalFare: route.totalFare,
          transferCount: route.transferCount,
          mode: route.mode,
          polyline: route.polyline,
          fareNote: route.fareNote,
        };
      })
    );

    const times = routes.map((r) => r.totalTime);
    const fares = routes.map((r) => r.totalFare);

    evaluated.push({
      name: candidate.place_name,
      lat: dLat,
      lng: dLng,
      routes,
      // ── 후보 평가 지표 ──
      timeSpread: Math.max(...times) - Math.min(...times), // 편차(공평성)
      timeStd: stdDev(times), // 편차 정밀 보정
      avgTime: mean(times), // 평균 이동시간
      totalFare: fares.reduce((s, f) => s + f, 0), // 총 교통비
      avgFare: mean(fares), // 1인 평균 교통비(비용 점수용)
    });
  }

  // ── 2) 지표별로 0~1 정규화 (단위 차이 제거) ──
  // 공평성은 "편차 + 표준편차"를 합쳐 한쪽 극단에 속지 않게 한다.
  const normFairness = normalize(evaluated.map((e) => e.timeSpread + e.timeStd));
  const normTime = normalize(evaluated.map((e) => e.avgTime));
  const normCost = normalize(evaluated.map((e) => e.avgFare));

  // ── 3) 가중 합산 → 점수가 가장 낮은(=공평·빠름·저렴) 후보 선택 ──
  let best = evaluated[0];
  let bestScore = Infinity;
  evaluated.forEach((e, i) => {
    const score =
      SCORE_WEIGHTS.fairness * normFairness[i] +
      SCORE_WEIGHTS.time * normTime[i] +
      SCORE_WEIGHTS.cost * normCost[i];
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  });

  return {
    name: best.name,
    lat: best.lat,
    lng: best.lng,
    routes: best.routes,
    maxTimeDiff: best.timeSpread,
    totalFare: best.totalFare,
    avgTime: Math.round(best.avgTime),
  };
};
