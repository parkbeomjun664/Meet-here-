/**
 * Sidebar.tsx — 사이드바 "껍데기"(프레임)
 *
 * 탭 내용은 직접 만들지 않고 children으로 받는다.
 * (Home이 탭 4개를 넣어주고, Sidebar는 감싸는 틀만 담당 = 관심사 분리)
 *
 * 맡는 것:
 *   - 하단 탭 4개 내비게이션 (약속잡기 / 최적경로 / 맛집·놀거리 / 사용자)
 *   - 사이드바 접기·펴기 토글 (데스크톱 전용)
 *   - 초기화 확인 모달 → 실제 초기화는 Home의 onReset이 수행
 *   - 토스트 알림 표시
 */
import { useState } from 'react';
import {
  CalendarDays,
  Route,
  Utensils,
  UserCheck,
  RotateCcw,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import styles from '../styles/Sidebar.module.css';

// 공통 토스트 알림
const Toast = ({ message, visible }: { message: string; visible: boolean }) => (
  <div className={`${styles.toast} ${visible ? styles.visible : ''}`}>
    <CheckCircle size={16} color="#4CAF50" />
    {message}
  </div>
);

export type ActiveTab = 'appointment' | 'routes' | 'places' | 'profile';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onReset: () => void; // 전체 초기화 (스토어+지도+입력) — Home이 처리
  toastMessage: string;
  toastVisible: boolean;
  children: React.ReactNode; //컴포넌트 자식으로 어떤 것이든 허용
}

const Sidebar = ({
  activeTab,
  onTabChange,
  onReset,
  toastMessage,
  toastVisible,
  children,
}: SidebarProps) => {
  const [showResetModal, setShowResetModal] = useState(false); //리셋모달
  const [collapsed, setCollapsed] = useState(false); //사이드바 접기, 펴기

  // 실제 초기화 로직은 Home의 handleReset가 담당 (지도·전역상태·입력값 전부)
  const confirmReset = () => {
    onReset();
    setShowResetModal(false);
  };

  return (
    <>
      <div
        className={`${styles.sidebarWrapper} ${
          collapsed ? styles.sidebarCollapsed : ''
        }`}
      >
        <aside className={styles.sidebar}>
          {/* ── 탭 콘텐츠 영역 (외부에서 주입) ── */}
          <div className={styles.tabContentArea}>{children}</div>

          {/* ── 하단 리셋 및 4버튼 내비게이션 바 ── */}
          <div className={styles.sidebarFooter}>
            <button
              onClick={() => setShowResetModal(true)}
              className={styles.resetButton}
            >
              <RotateCcw size={13} />새 약속 짜기 (초기화)
            </button>

            <nav className={styles.bottomTabBar}>
              <button
                onClick={() => onTabChange('appointment')}
                className={`${styles.tabBtn} ${
                  activeTab === 'appointment' ? styles.activeTab : ''
                }`}
              >
                <CalendarDays size={18} />
                <span>약속잡기</span>
              </button>

              <button
                onClick={() => onTabChange('routes')}
                className={`${styles.tabBtn} ${
                  activeTab === 'routes' ? styles.activeTab : ''
                }`}
              >
                <Route size={18} />
                <span>최적경로</span>
              </button>

              <button
                onClick={() => onTabChange('places')}
                className={`${styles.tabBtn} ${
                  activeTab === 'places' ? styles.activeTab : ''
                }`}
              >
                <Utensils size={18} />
                <span>맛집/놀거리</span>
              </button>

              <button
                onClick={() => onTabChange('profile')}
                className={`${styles.tabBtn} ${
                  activeTab === 'profile' ? styles.activeTab : ''
                }`}
              >
                <UserCheck size={18} />
                <span>사용자</span>
              </button>
            </nav>
          </div>
        </aside>

        {/* ── 사이드바 토글 버튼 ── */}
        <button
          className={styles.collapseToggleBtn}
          onClick={() => setCollapsed((prev) => !prev)} //현재값 상태(prev)을 가져와서 그 반댓값으로 반환
          aria-label={collapsed ? '사이드바 열기' : '사이드바 닫기'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <Toast message={toastMessage} visible={toastVisible} />

      {/* 리셋 모달 */}
      {showResetModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowResetModal(false)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()} //이벤트가 위로 퍼지는 것을 막음
          >
            <div className={styles.modalIconWrapper}>
              <RotateCcw size={24} color="#FF5A5F" />
            </div>
            <div className={styles.modalTextGroup}>
              <p className={styles.modalTitle}>약속을 리셋할까요?</p>
              <p className={styles.modalDescription}>
                등록된 멤버와 설정한 약속 시간이
                <br />
                전부 삭제되며 복구할 수 없습니다.
              </p>
            </div>
            <div className={styles.modalButtonGroup}>
              <button
                className={styles.modalCancelBtn}
                onClick={() => setShowResetModal(false)}
              >
                취소
              </button>
              <button className={styles.modalConfirmBtn} onClick={confirmReset}>
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
