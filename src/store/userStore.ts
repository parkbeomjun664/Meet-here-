import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type TransportMode = 'transit' | 'car' | 'walk';

export interface UserEntry {
  id: number;
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
  addUser: (payload: Omit<UserEntry, 'id'>) => void; // id는 스토어에서 생성
  removeUser: (id: number) => void;
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
      addUser: (payload) =>
        set((state) => ({
          users: [...state.users, { id: Date.now(), ...payload }],
        })),

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
      version: 1, // 저장 형식 버전 (필드가 바뀌면 올려서 옛 데이터 정리)
      storage: createJSONStorage(() => localStorage),
      // 저장할 항목만 선택 (isCalculating 같은 일시적 상태는 제외)
      partialize: (state) => ({
        users: state.users,
        appointmentDateTime: state.appointmentDateTime,
        midpointResult: state.midpointResult,
      }),
      // 옛 버전(totalFare/avgTime 없던 midpointResult) 데이터는 결과만 비워 크래시 방지
      migrate: (persisted) => {
        const state = persisted as Partial<UserStore>;
        const mp = state?.midpointResult as Partial<MidpointResult> | null;
        if (mp && (mp.totalFare === undefined || mp.avgTime === undefined)) {
          state.midpointResult = null;
        }
        return state as UserStore;
      },
    }
  )
);

export default useUserStore;
