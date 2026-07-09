import { Users } from 'lucide-react';
import useUserStore from '../../store/userStore';
import styles from '../../styles/Sidebar.module.css';

interface TabProps {
  onShowToast: (msg: string) => void;
}

// 이동수단 아이콘 (Record<string,string>로 두어 별도 타입 import 없이 안전하게 인덱싱)
const TRANSPORT_ICON: Record<string, string> = {
  transit: '🚇',
  car: '🚗',
  walk: '🚶',
};

// 실제 스토어 데이터(참여자·약속시간·중간지점)만으로 구성한 "내 약속 현황".
// 계정/이력 기능이 없으므로 근거 없는 가짜 지표(만족도 등)는 두지 않는다.
const ProfileTab = (_props: TabProps) => {
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
