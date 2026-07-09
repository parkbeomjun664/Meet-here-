import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// 📌 유니온 타입 (Union Type)
// 'transit' | 'car' | 'walk' 세 가지 문자열만 허용
// string보다 구체적이라 오타 방지 + 자동완성 지원
export type TransportMode = 'transit' | 'car' | 'walk';

// 📌 interface: 객체 형태 정의
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
    // 📌 옵셔널 프로퍼티 (?): 있을 수도, 없을 수도 있는 필드
    // 접근 시 항상 옵셔널 체이닝 ?.로 접근해야 안전
    polyline?: [number, number][]; // 튜플 배열: 반드시 숫자 2개짜리 배열만 허용
    fareNote?: string; // 이 비용이 어떻게 산출됐는지 설명 (톨비+기름값 등)
  }[];
  maxTimeDiff: number; // 멤버 간 이동시간 편차(분) — 공평성 지표
  totalFare: number;   // 모든 멤버의 교통비 합계(원) — 비용 지표
  avgTime: number;     // 멤버 평균 이동시간(분)
}

// 📌 Zustand 스토어의 전체 타입 (상태 + 액션)
// Context API에서는 State / Action / Reducer / Provider / Context를 각각 정의해야 했지만,
// Zustand는 상태와 그 상태를 바꾸는 액션을 하나의 스토어 안에서 함께 정의한다.
interface UserStore {
  // ── 상태 ──
  users: UserEntry[];
  appointmentDateTime: string;
  midpointResult: MidpointResult | null; // null: 아직 계산 안 됨
  isCalculating: boolean;

  // ── 액션 ──
  // 컴포넌트에서 dispatch 대신 이 함수들을 직접 호출한다.
  addUser: (payload: Omit<UserEntry, 'id'>) => void; // Omit: id를 제외한 타입 (id는 스토어 내부에서 생성)
  removeUser: (id: number) => void;
  clearUsers: () => void;
  setAppointmentDateTime: (value: string) => void;
  clearAppointmentDateTime: () => void;
  setMidpoint: (result: MidpointResult) => void;
  clearMidpoint: () => void;
  setCalculating: (value: boolean) => void;
}

// 📌 create<T>((set, get) => ({ ...상태, ...액션 }))
// - set: 상태를 갱신하는 함수. 넘긴 값을 기존 상태에 얕게 병합(merge)한다.
//        set((state) => ...) 형태로 이전 상태를 받아서 계산할 수도 있다.
// - Context의 useReducer + dispatch + Provider 역할을 이 한 곳이 모두 대신한다.
// - 반환된 useUserStore 훅은 앱 어디서든 Provider 없이 바로 호출 가능하다.
// 📌 persist 미들웨어: 스토어 상태를 localStorage에 자동 저장/복원한다.
//    새로고침해도 참여자·약속시간·중간지점 결과가 유지됨.
//    (미들웨어 사용 시 TS에서는 create<T>()(...) 처럼 한 번 더 호출하는 형태 사용)
const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      // ── 초기 상태 ──
      users: [],
      appointmentDateTime: '',
      midpointResult: null,
      isCalculating: false,

      // ── 액션 구현 ──
      // 📌 불변성: Context의 리듀서처럼 기존 배열/객체를 직접 수정하지 않고
      //    스프레드 연산자로 새 값을 만들어 set에 넘긴다.
      addUser: (payload) =>
        set((state) => ({
          users: [...state.users, { id: Date.now(), ...payload }],
        })),

      removeUser: (id) =>
        set((state) => ({
          // filter: 조건을 만족하는 요소만 남긴 새 배열 반환 (원본 불변)
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
      migrate: (persisted: any) => {
        const mp = persisted?.midpointResult;
        if (mp && (mp.totalFare === undefined || mp.avgTime === undefined)) {
          persisted.midpointResult = null;
        }
        return persisted;
      },
    }
  )
);

export default useUserStore;
