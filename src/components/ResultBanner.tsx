import { useState } from 'react';
import { X } from 'lucide-react';
import useUserStore from '../store/userStore';
import styles from '../styles/ResultBanner.module.css';

// 지도 위에 떠서 "산출된 중간지점 + 핵심 정보"를 크게 보여주는 알림 카드.
// 전역 스토어의 midpointResult / isCalculating을 직접 구독한다.
const ResultBanner = ({ onViewRoutes }: { onViewRoutes: () => void }) => {
  const { midpointResult, isCalculating } = useUserStore();

  // "닫기"는 특정 결과에 대해서만 유효하도록 결과 키를 저장한다.
  // 새 결과가 나오면 키가 달라져 배너가 자동으로 다시 보인다. (effect 불필요)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const resultKey = midpointResult
    ? `${midpointResult.name}:${midpointResult.lat},${midpointResult.lng}`
    : null;
  const hidden = resultKey !== null && dismissedKey === resultKey;

  // 계산 중: 진행 표시
  if (isCalculating) {
    return (
      <div className={styles.wrap}>
        <div className={styles.calcBanner}>
          <span className={styles.spinner} />
          가장 공평한 중간지점을 계산하고 있어요…
        </div>
      </div>
    );
  }

  if (!midpointResult || hidden) return null;
  const r = midpointResult;

  return (
    <div className={styles.wrap}>
      <div className={styles.resultBanner}>
        <button
          className={styles.resultClose}
          onClick={() => setDismissedKey(resultKey)}
          aria-label="결과 닫기"
        >
          <X size={16} />
        </button>

        <div className={styles.resultTop}>
          <div className={styles.resultStar}>⭐</div>
          <div>
            <div className={styles.resultLabel}>가장 공평한 중간지점</div>
            <div className={styles.resultName}>{r.name}</div>
          </div>
        </div>

        <div className={styles.resultStats}>
          <span className={styles.resultStat}>⚖️ 편차 {r.maxTimeDiff ?? 0}분</span>
          <span className={styles.resultStat}>🕒 평균 {r.avgTime ?? 0}분</span>
          <span className={styles.resultStat}>
            💰 총 {(r.totalFare ?? 0).toLocaleString()}원
          </span>
        </div>

        <button className={styles.resultCta} onClick={onViewRoutes}>
          멤버별 경로 자세히 보기 →
        </button>
      </div>
    </div>
  );
};

export default ResultBanner;
