/**
 * RouteTab.tsx — 2번 탭 "최적경로"
 *
 * 계산된 결과를 "보여주기만" 하는 탭. props를 하나도 받지 않는다.
 * 스토어의 midpointResult를 직접 구독하므로, 계산이 끝나면 알아서 갱신된다.
 *
 * 보여주는 것:
 *   - 추천 지점 요약 (시간편차 · 평균시간 · 총 교통비)
 *   - 멤버별 경로 카드 (소요시간 · 이동수단 · 요금 · 환승 횟수)
 *   - 비용 산출 근거 (예: "톨비 2,400원 + 기름값 3,400원")
 *
 * 화면 상태 3가지: 참여자 없음 / 계산 중 / 결과 표시
 */
import useUserStore from '../../store/userStore';
import styles from '../../styles/Sidebar.module.css';

// 이동수단별 표시 정보
const MODE_INFO = {
  transit: { label: '대중교통', icon: '🚇', color: '#3949AB', bg: '#EEF2FF', border: '#9FA8DA' },
  car:     { label: '자동차',   icon: '🚗', color: '#2E7D32', bg: '#F0FFF4', border: '#A5D6A7' },
  walk:    { label: '도보',     icon: '🚶', color: '#E65100', bg: '#FFF3E0', border: '#FFCC80' },
};

// 멤버별 경로 선 색상 (지도와 동일한 색상 사용)
const ROUTE_COLORS = ['#FF5A5F', '#4A90D9', '#2ECC71', '#F39C12', '#9B59B6'];

const RouteTab = () => {
  const { users, midpointResult, isCalculating } = useUserStore();

  return (
    <div className={styles.tabContentContainer}>
      <div className={styles.sectionGroup}>
        <label className={styles.sectionLabel}>⏱️ 멤버별 최적 경로 안내</label>

        {/* 유저 없음 */}
        {users.length === 0 && !isCalculating && !midpointResult && (
          <p className={styles.emptyTabDescription}>
            등록된 사용자가 없습니다.<br />
            '약속잡기' 탭에서 친구들을 먼저 등록해 주세요.
          </p>
        )}

        {/* 계산 중 */}
        {isCalculating && (
          <div className={styles.routeLoadingCard}>
            <div className={styles.routeLoadingIcon}>🔍</div>
            <div className={styles.routeLoadingTitle}>중간 지점을 계산하고 있어요...</div>
            <div className={styles.routeLoadingText}>모든 멤버의 출발지와 이동 방식을 분석 중입니다.</div>
          </div>
        )}

        {/* 결과 */}
        {!isCalculating && midpointResult && (
          <>
            <div className={styles.routeSummaryCard}>
              <div className={styles.routeSummaryTop}>
                <span className={styles.routeSummaryBadge}>추천 지점</span>
                <span className={styles.routeInfoPill}>
                  ⚖️ 편차 {midpointResult.maxTimeDiff ?? 0}분
                </span>
              </div>
              <div className={styles.routeSummaryTitle}>{midpointResult.name}</div>
              <div className={styles.routeSummaryBody}>
                이동시간의 공평성·평균 소요시간·교통비를 함께 계산해 고른 지점이에요.
              </div>
              <div className={styles.routeMetaRow}>
                <span className={styles.routeInfoPill}>
                  🕒 평균 {midpointResult.avgTime ?? 0}분
                </span>
                <span className={styles.routeInfoPill}>
                  💰 총 {(midpointResult.totalFare ?? 0).toLocaleString()}원
                </span>
              </div>
            </div>

            <div className={styles.routeLegendList}>
              {midpointResult.routes.map((route, idx) => (
                <div key={route.userName} className={styles.routeLegendItem}>
                  <div
                    className={styles.routeLegendDot}
                    style={{ background: ROUTE_COLORS[idx % ROUTE_COLORS.length] }}
                  />
                  {route.userName}
                </div>
              ))}
            </div>

            <div className={styles.routeCardList}>
              {midpointResult.routes.map((route, idx) => {
                const modeInfo = MODE_INFO[route.mode];
                return (
                  <div key={route.userName} className={styles.routeItemCard} style={{ borderLeft: `4px solid ${ROUTE_COLORS[idx % ROUTE_COLORS.length]}` }}>
                    {/* 헤더 */}
                    <div className={styles.routeHeader}>
                      <span className={styles.routeUserName}><b>{route.userName}</b>님</span>
                      <span className={styles.routeTimeBadge}>약 {route.totalTime}분 소요</span>
                    </div>

                    <div className={styles.routeMetaRow}>
                      <span
                        className={styles.routeModePill}
                        style={{ background: modeInfo.bg, color: modeInfo.color, borderColor: modeInfo.border }}
                      >
                        {modeInfo.icon} {modeInfo.label}
                      </span>
                      {route.totalFare > 0 && (
                        <span className={styles.routeInfoPill}>
                          💰 {route.totalFare.toLocaleString()}원
                        </span>
                      )}
                      {route.totalFare === 0 && route.mode !== 'walk' && (
                        <span className={styles.routeInfoPill}>
                          💰 무료
                        </span>
                      )}
                      {route.mode === 'transit' && (
                        <span className={styles.routeInfoPill}>
                          🔁 환승 {route.transferCount}회
                        </span>
                      )}
                    </div>

                    {/* 비용 산출 근거 (무엇을 반영했는지) */}
                    {route.fareNote && (
                      <div className={styles.routeFareNote}>
                        💡 비용 산출: {route.fareNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className={styles.routeHintText}>
              경로를 다시 계산하려면 약속잡기 탭에서 다시 눌러주세요.
            </p>
          </>
        )}

        {/* 유저는 있지만 아직 계산 전 */}
        {!isCalculating && !midpointResult && users.length >= 2 && (
          <p className={styles.infoSummaryText}>
            '약속잡기' 탭에서 중간 지점 찾기 버튼을 눌러주세요.
          </p>
        )}
      </div>
    </div>
  );
};

export default RouteTab;