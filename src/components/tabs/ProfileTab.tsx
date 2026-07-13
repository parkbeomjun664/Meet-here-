/**
 * ProfileTab.tsx — 4번 탭 "사용자" (내 약속 현황)
 *
 * 계정·로그인 기능이 없으므로, 스토어의 실제 데이터만으로 현황을 보여준다.
 *   - 요약: 몇 명이 모이는 약속인지 + 약속 시간
 *   - 지표: 참여자 수 / 시간편차 / 평균 이동시간
 *   - 목록: 참여자별 출발지·이동수단, 추천 중간지점
 *
 * 설계 원칙: 없는 데이터를 있는 척하지 않는다.
 *   초기에는 "만족도 97%" 같은 가짜 지표가 있었으나,
 *   근거가 없는 수치라 전부 제거했다.
 */
import { Users } from 'lucide-react';
import useUserStore from '../../store/userStore';
import styles from '../../styles/Sidebar.module.css';

const TRANSPORT_ICON: Record<string, string> = {
  transit: '🚇',
  car: '🚗',
  walk: '🚶',
};

// 실제 스토어 데이터(참여자·약속시간·중간지점)만으로 구성한 "내 약속 현황".
// 계정/이력 기능이 없으므로 근거 없는 지표(만족도 등)는 두지 않는다.
const ProfileTab = () => {
  const { users, appointmentDateTime, midpointResult } = useUserStore();

  return (
    <div className={styles.tabContentContainer}>
      <div className={styles.sectionGroup}>
        <label className={styles.sectionLabel}>👤 내 약속 현황</label>

        {/* 요약 카드 (실데이터) */}
        <div className={styles.profileCard}>
          <div className={styles.profileAvatar}>
            <Users size={20} color="#fff" />
          </div>
          <div className={styles.profileInfo}>
            <h4 className={styles.profileName}>
              {users.length > 0
                ? `${users.length}명이 모이는 약속`
                : '아직 약속이 없어요'}
            </h4>
            <p className={styles.profileEmail}>
              {appointmentDateTime
                ? `🗓️ ${appointmentDateTime}`
                : '약속 시간 미정'}
            </p>
          </div>
        </div>

        {/* 실데이터 지표 3개 (참여자 / 시간편차 / 평균이동) */}
        <div className={styles.profileStatGrid}>
          <div className={styles.profileStatBox}>
            <div className={styles.profileStatValue}>{users.length}</div>
            <div className={styles.profileStatLabel}>참여자</div>
          </div>
          <div className={styles.profileStatBox}>
            <div className={styles.profileStatValue}>
              {midpointResult ? `${midpointResult.maxTimeDiff ?? 0}분` : '—'}
            </div>
            <div className={styles.profileStatLabel}>시간편차</div>
          </div>
          <div className={styles.profileStatBox}>
            <div className={styles.profileStatValue}>
              {midpointResult ? `${midpointResult.avgTime ?? 0}분` : '—'}
            </div>
            <div className={styles.profileStatLabel}>평균이동</div>
          </div>
        </div>

        <hr className={styles.sectionDivider} />

        {/* 참여자 목록 (실데이터) */}
        <label className={styles.sectionLabel}>👥 참여자</label>
        {users.length === 0 ? (
          <p className={styles.emptyTabDescription}>
            '약속잡기' 탭에서 참여자를 등록하면
            <br />여기에 표시돼요.
          </p>
        ) : (
          <div className={styles.bookmarkList}>
            {users.map((u) => (
              <div
                key={u.id}
                className={styles.bookmarkItem}
                style={{ cursor: 'default' }}
              >
                <span>
                  {TRANSPORT_ICON[u.transportMode] ?? '🚇'} {u.name}
                </span>
                <small className={styles.bookmarkAddr}>📍 {u.departure}</small>
              </div>
            ))}
          </div>
        )}

        {/* 추천 중간지점 (계산된 경우에만, 실데이터) */}
        {midpointResult && (
          <>
            <hr className={styles.sectionDivider} />
            <label className={styles.sectionLabel}>⭐ 추천 중간지점</label>
            <div className={styles.bookmarkItem} style={{ cursor: 'default' }}>
              <span>⭐ {midpointResult.name}</span>
              <small className={styles.bookmarkAddr}>
                총 {(midpointResult.totalFare ?? 0).toLocaleString()}원
              </small>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfileTab;
