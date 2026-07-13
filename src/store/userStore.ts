/**
 * userStore.ts — 전역 상태 저장소 (Zustand)
 *
 * 이 앱의 "심장". 컴포넌트끼리 직접 대화하지 않고 모두 이 창고를 거친다.
 *
 *   [쓰기] AppointmentTab  → addUser / setMidpoint / setAppointmentDateTime
 *   [읽기] RouteTab · ResultBanner · ProfileTab · PlaceTab (구독 → 값 바뀌면 자동 리렌더)
 *
 * 보관하는 것:
 *   - users               참여자 목록
 *   - appointmentDateTime 약속 시간
 *   - midpointResult      중간지점 계산 결과
 *   - isCalculating       계산 중 여부(일시적 상태 → 저장 안 함)
 *
 * persist 미들웨어로 localStorage에 자동 저장/복원하며,
 * 저장 형식이 바뀌면 version + migrate로 옛 데이터를 보정한다.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type TransportMode = 'transit' | 'car' | 'walk';

// 참여자 식별자. 동명이인이 있어도 구분되도록 이름이 아닌 고유 id를 쓴다.
// (crypto.randomUUID는 보안 컨텍스트에서만 제공되므로 폴백을 둔다)
const createUserId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export interface UserEntry {
  id: string;
  name: string;
  departure: string;
  lat: number;
  lng: number;
  transportMode: TransportMode;
}

export interface MidpointResult {
  name: string;
  lat: number;
  lng: number;
  routes: {
    userName: string;
    totalTime: number;
    totalFare: number;
    transferCount: number;
    mode: TransportMode;
    polyline?: [number, number][]; // 지도에 그릴 경로 좌표 [위도, 경도][]
    fareNote?: string; // 비용 산출 근거 (예: 톨비 + 기름값)
  }[];
  maxTimeDiff: number; // 멤버 간 이동시간 편차(분) — 공평성 지표
  totalFare: number;   // 모든 멤버의 교통비 합계(원) — 비용 지표
  avgTime: number;     // 멤버 평균 이동시간(분)
}

interface UserStore {
  // ── 상태 ──
  users: UserEntry[];
  appointmentDateTime: string;
  midpointResult: MidpointResult | null; // null: 아직 계산 전
  isCalculating: boolean;

  // ── 액션 ──
  addUser: (payload: Omit<UserEntry, 'id'>) => string; // 생성된 id를 반환 (지도 마커 키로 사용)
  removeUser: (id: string) => void;
  clearUsers: () => void;
  setAppointmentDateTime: (value: string) => void;
  clearAppointmentDateTime: () => void;
  setMidpoint: (result: MidpointResult) => void;
  clearMidpoint: () => void;
  setCalculating: (value: boolean) => void;
}

// persist 미들웨어로 상태를 localStorage에 자동 저장/복원한다.
// (미들웨어 사용 시 TS에서는 create<T>()(...) 형태로 한 번 더 호출해야 한다)
const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      // ── 초기 상태 ──
      users: [],
      appointmentDateTime: '',
      midpointResult: null,
      isCalculating: false,

      // ── 액션 ──
      addUser: (payload) => {
        const id = createUserId();
        set((state) => ({ users: [...state.users, { id, ...payload }] }));
        return id; // 호출부가 이 id로 지도 마커를 등록한다
      },

      removeUser: (id) =>
        set((state) => ({
          users: state.users.filter((u) => u.id !== id),
        })),

      clearUsers: () => set({ users: [] }),

      setAppointmentDateTime: (value) => set({ appointmentDateTime: value }),

      clearAppointmentDateTime: () => set({ appointmentDateTime: '' }),

      // 계산 완료 시 로딩 상태도 함께 해제
      setMidpoint: (result) =>
        set({ midpointResult: result, isCalculating: false }),

      clearMidpoint: () => set({ midpointResult: null }),

      setCalculating: (value) => set({ isCalculating: value }),
    }),
    {
      name: 'meet-here-store', // localStorage 키 이름
      version: 2, // 저장 형식 버전 (필드가 바뀌면 올려서 옛 데이터 정리)
      storage: createJSONStorage(() => localStorage),
      // 저장할 항목만 선택 (isCalculating 같은 일시적 상태는 제외)
      partialize: (state) => ({
        users: state.users,
        appointmentDateTime: state.appointmentDateTime,
        midpointResult: state.midpointResult,
      }),
      // 옛 저장 데이터를 현재 형식으로 보정한다.
      //  v0 → v1: midpointResult에 totalFare/avgTime이 없어 렌더 중 크래시하던 문제
      //  v1 → v2: 참여자 id가 number → string(UUID)으로 변경
      migrate: (persisted) => {
        const state = persisted as Partial<UserStore>;

        const mp = state?.midpointResult as Partial<MidpointResult> | null;
        if (mp && (mp.totalFare === undefined || mp.avgTime === undefined)) {
          state.midpointResult = null;
        }

        if (Array.isArray(state?.users)) {
          state.users = state.users.map((u) => ({ ...u, id: String(u.id) }));
        }

        return state as UserStore;
      },
    }
  )
);

export default useUserStore;
