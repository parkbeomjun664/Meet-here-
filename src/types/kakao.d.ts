// 카카오 지도 SDK는 공식 TypeScript 타입을 제공하지 않으므로
// 전역 window.kakao 만 any로 선언하고, 사용처(KakaoMap)에서 타입을 좁혀 쓴다.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao: any;
  }
}
export {};
