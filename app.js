/**
 * 영어과외 학습 관리 & 캘린더 시스템 - 메인 애플리케이션 로직 (app.js)
 */
console.log("Firebase DB:", window.firebaseDB);

const App = {
  // 상태 관리 (State)
  state: {
    view: 'landing', // 'landing' | 'student' | 'admin' | 'vocabTest' | 'practiceTest'
    selectedStudentId: 1,
    adminSelectedStudentId: 1,
    isAdminLoggedIn: false,
    isAdminStudentPreview: false,
    isStudentLoggedIn: false,
    calendarDate: new Date(),
    studentViewTab: 'calendar', // 'calendar' | 'list'
    studentListFilter: 'ALL', // 'ALL' | 'SCHEDULED' | 'PASS' | 'RETEST'
    adminTab: 'tests', // 'tests' | 'overview' | 'students' | 'backup' | 'vocab'
    vocabTest: null,
    vocabSetReturnToTestForm: false,
    vocabResultSelectedDate: null,
    adminVocabCalendarMonth: null,
    practiceTest: null,
    editingPracticeQuestions: [],
    specialScienceResults: {},
    specialScienceResultsStudentId: null
  },

  // 초기화 (Init)
  init() {
    this.bindEvents();
    if (!this.restoreSession()) {
      this.renderLanding();
    }
  },

  // 최초 진입과 로그인 데이터 준비에 같은 스켈레톤을 재사용합니다.
  showLoadingSkeleton(role = 'login') {
    const skeleton = document.getElementById('initialLoadingSkeleton');
    if (!skeleton) return;
    clearTimeout(this.loadingSkeletonTimer);
    skeleton.classList.remove('initial-loading-skeleton--leaving', 'initial-loading-skeleton--student', 'initial-loading-skeleton--admin');
    if (role === 'student' || role === 'admin') skeleton.classList.add(`initial-loading-skeleton--${role}`);
    skeleton.hidden = false;
    skeleton.tabIndex = -1;
    skeleton.focus({ preventScroll: true });
  },

  finishInitialLoading() {
    const skeleton = document.getElementById('initialLoadingSkeleton');
    if (!skeleton) return;

    clearTimeout(this.loadingSkeletonTimer);
    skeleton.classList.add('initial-loading-skeleton--leaving');
    this.loadingSkeletonTimer = setTimeout(() => { skeleton.hidden = true; }, 220);
  },

  // 클라우드 동기화 상태 및 데이터 로딩 안내 배너 표시
  updateSyncStatus(status, text) {
    const badge = document.getElementById('cloudSyncStatusBadge');
    const notice = document.getElementById('dataSyncNoticeBanner');
    const adminNotice = document.getElementById('adminDataSyncNoticeBanner');

    let badgeHtml = '';
    let noticeHtml = '';

    if (status === 'syncing' || status === 'synced') {
      // 최초 동기화와 완료 안내는 별도 배너 대신 스켈레톤 전환으로 처리합니다.
      if (badge) {
        badge.innerHTML = '';
        badge.classList.add('hidden');
        badge.classList.remove('flex');
      }
      [notice, adminNotice].forEach(el => el?.classList.add('hidden'));
      return;
    } else if (status === 'offline') {
      badgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold shadow-xs">
          <i class="fa-solid fa-shield-halved text-amber-500"></i>
          <span>${text || '로컬 안전 모드 (저장됨)'}</span>
        </span>
      `;
      noticeHtml = `
        <div class="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between text-xs sm:text-sm font-medium shadow-xs">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-shield-halved text-amber-600"></i>
            <span><strong>로컬 캐시 모드:</strong> 클라우드 지연 시에도 저장된 시험 데이터로 정상 이용하실 수 있습니다.</span>
          </div>
          <span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 hidden sm:inline-block">로컬 모드</span>
        </div>
      `;
    }

    if (badge) {
      badge.innerHTML = badgeHtml;
      badge.classList.remove('hidden');
      badge.classList.add('flex');
      if (status === 'synced') {
        setTimeout(() => {
          badge.style.transition = 'opacity 0.5s ease';
          badge.style.opacity = '0';
          setTimeout(() => {
            badge.classList.add('hidden');
            badge.classList.remove('flex');
            badge.style.opacity = '';
          }, 520);
        }, 3000);
      }
    }

    [notice, adminNotice].forEach(el => {
      if (!el) return;
      if (noticeHtml) {
        el.innerHTML = noticeHtml;
        el.classList.remove('hidden');
        if (status === 'synced') {
          setTimeout(() => {
            el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-4px)';
            setTimeout(() => {
              el.classList.add('hidden');
              el.style.opacity = '';
              el.style.transform = '';
            }, 520);
          }, 2500);
        }
      } else {
        el.classList.add('hidden');
      }
    });
  },

  // Firebase Auth is the only source of session authority.
  saveSession() {},
  clearSession() { localStorage.removeItem('yem_auth_session'); },
  restoreSession() { return false; },

  bindEvents() {
    // 태블릿처럼 hover가 없는 넓은 터치 화면에서는 축소된 좌측 메뉴를
    // 메뉴 영역 터치로 펼치고, 메뉴 밖 터치로 다시 접는다.
    const studentSidebar = document.getElementById('studentSidebar');
    if (studentSidebar) {
      document.addEventListener('pointerdown', (e) => {
        const isWideTouchScreen = window.innerWidth >= 1024 && e.pointerType === 'touch';
        const isStudentDashboardActive = !document.getElementById('studentDashboardView')?.classList.contains('hidden');
        if (!isWideTouchScreen || !isStudentDashboardActive) return;

        if (studentSidebar.contains(e.target)) {
          if (!studentSidebar.classList.contains('sidebar-touch-expanded')) {
            studentSidebar.classList.add('sidebar-touch-expanded');
            // 첫 터치는 메뉴를 여는 용도로만 사용해 항목이 즉시 실행되지 않게 한다.
            this.touchSidebarJustOpened = true;
          }
        } else {
          studentSidebar.classList.remove('sidebar-touch-expanded');
          this.touchSidebarJustOpened = false;
        }
      });

      studentSidebar.addEventListener('click', (e) => {
        if (!this.touchSidebarJustOpened) return;
        this.touchSidebarJustOpened = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }, true);
    }

    // 키보드 ESC로 모달 닫기
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // 시험 등록/수정 모달은 작성 중 날아가는 것을 방지하기 위해 ESC로 닫지 않음
        const testFormModal = document.getElementById('adminTestFormModal');
        if (testFormModal && !testFormModal.classList.contains('hidden')) {
          return;
        }
        // 단어 시험 진행 중 ESC로 나갈 때 경고 및 0점 불합격 포기 처리
        const vt = this.state.vocabTest;
        if (this.state.view === 'vocabTest' && vt && !vt.isCompleted) {
          if (confirm('시험 진행 중에 나가면 0점(불합격) 처리되며 10분 동안 다시 응시할 수 없습니다.\n\n정말 시험을 종료하고 나가시겠습니까?')) {
            this.forfeitVocabTest().then(() => {
              this.state.vocabTest = null;
              if (this.state.isStudentLoggedIn) {
                this.selectStudent(this.state.selectedStudentId);
              } else {
                this.showLanding();
              }
            });
          }
          return;
        }
        // 본문 암기 시험 진행 중에는 ESC로 닫히지 않고 경고
        const tmModal = document.getElementById('textMemorizeExamModal');
        if (tmModal && !tmModal.classList.contains('hidden') && this.state.textMemorizeExam && !this.state.textMemorizeExam.isCompleted) {
          if (confirm('시험 진행 중에 나가면 0점(불합격) 처리됩니다.\n\n정말 시험을 포기하고 나가시겠습니까?')) {
            this.forfeitTextMemorizeTest();
          }
          return;
        }

        // 단어장 크게 보기 모달이 열려있으면 단어장 닫기(시험 창 복귀)
        const vocabStudyModal = document.getElementById('vocabStudyModal');
        if (vocabStudyModal && !vocabStudyModal.classList.contains('hidden')) {
          this.closeVocabStudyModal();
          return;
        }

        this.closeAllModals();
        this.closeMobileSidebar();
      }

      // 객관식 단어테스트 PC 키보드 숫자 단축키 (1~5 및 넘패드 1~5)
      const vt = this.state.vocabTest;
      if (this.state.view === 'vocabTest' && vt && vt.direction === 2 && !vt.isCompleted) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          let num = null;
          if (e.key >= '1' && e.key <= '5') {
            num = parseInt(e.key, 10);
          } else if (e.code && e.code.startsWith('Numpad')) {
            const digit = e.code.replace('Numpad', '');
            if (digit >= '1' && digit <= '5') {
              num = parseInt(digit, 10);
            }
          }
          if (num !== null) {
            const choiceIndex = num - 1;
            const q = vt.questions && vt.questions[vt.currentIndex];
            if (q && q.choices && choiceIndex >= 0 && choiceIndex < q.choices.length) {
              if (q.answered === null || q.answered === undefined) {
                e.preventDefault();
                this.selectVocabAnswer(choiceIndex);
                return;
              }
            }
          }
        }
      }

      // 단어장 크게 보기 모달 - 플래시카드 암기학습 키보드 단축키
      const vsModal = document.getElementById('vocabStudyModal');
      if (vsModal && !vsModal.classList.contains('hidden')) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          const vs = this.state.vocabStudy;
          if (vs?.viewMode === 'card') {
            if (vs.isMasteryFinished) {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                this.setVocabStudyViewMode('list');
                return;
              }
            } else if (vs.isRoundFinished) {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                this.vocabStudyStartNextRound();
                return;
              }
            } else {
              if (e.key === 'ArrowLeft' || e.key === '1') {
                e.preventDefault();
                this.vocabStudyMarkWord(false);
                return;
              } else if (e.key === 'ArrowRight' || e.key === '2') {
                e.preventDefault();
                this.vocabStudyMarkWord(true);
                return;
              } else if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                this.vocabStudyFlipCard();
                return;
              }
            }
          }
        }
      }

      // 본문 암기학습 모달 키보드 단축키
      const tmStudyModal = document.getElementById('textMemorizeStudyModal');
      if (tmStudyModal && !tmStudyModal.classList.contains('hidden')) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const tmStudy = this.state.textMemorizeStudy;
        if (tmStudy) {
          if (tmStudy.viewMode === 'card' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
            if (tmStudy.isMasteryFinished) {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                this.setTmStudyViewMode('mask');
                return;
              }
            } else if (tmStudy.isRoundFinished) {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                this.tmStudyStartNextRound();
                return;
              }
            } else {
              if (e.key === 'ArrowLeft' || e.key === '1') {
                e.preventDefault();
                this.tmStudyMarkSentence(false);
                return;
              } else if (e.key === 'ArrowRight' || e.key === '2') {
                e.preventDefault();
                this.tmStudyMarkSentence(true);
                return;
              } else if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                this.tmStudyFlipCard();
                return;
              }
            }
          } else if (tmStudy.viewMode === 'scramble' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (tmStudy.scramblePlacedWords && tmStudy.scramblePlacedWords.length > 0) {
                this.tmStudyScrambleRemoveWord(tmStudy.scramblePlacedWords.length - 1);
              }
              return;
            } else if (e.key === 'Enter' && tmStudy.scrambleIsCorrect) {
              e.preventDefault();
              this.tmStudyScrambleNext();
              return;
            }
          }
        }
      }
    });

    // 브라우저 뒤로가기(popstate) 감지: 단어시험 진행 중 뒤로가기 시 포기 confirm 처리
    window.addEventListener('popstate', async (e) => {
      const vt = this.state.vocabTest;
      if (this.state.view === 'vocabTest' && vt && !vt.isCompleted) {
        const confirmExit = confirm('시험 진행 중에 나가면 0점(불합격) 처리되며 10분 동안 다시 응시할 수 없습니다.\n\n정말 시험을 종료하고 나가시겠습니까?');
        if (confirmExit) {
          await this.forfeitVocabTest();
          this.state.vocabTest = null;
          if (this.state.isStudentLoggedIn) {
            this.selectStudent(this.state.selectedStudentId);
          } else {
            await this.showLanding();
          }
        } else {
          // 뒤로가기 취소 -> 시험 상태 유지
          history.pushState({ inVocabTest: true }, '');
        }
      }
    });

    // 본문암기 모달 배경 스크롤 차단 (휠/터치 이벤트 체이닝 방지)
    const tmModalEl = document.getElementById('textMemorizeExamModal');
    if (tmModalEl) {
      tmModalEl.addEventListener('wheel', (e) => {
        const bodyEl = document.getElementById('tmExamBody');
        if (!bodyEl || !bodyEl.contains(e.target)) {
          e.preventDefault();
          return;
        }
        const isAtTop = bodyEl.scrollTop <= 0;
        const isAtBottom = bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 1;
        if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
          e.preventDefault();
        }
      }, { passive: false });
    }

    // 시험 진행 중 페이지 이탈(새로고침, 탭 닫기) 시 경고 및 포기 처리 (시험 진행 중일 때만 동작)
    window.addEventListener('beforeunload', (e) => {
      const vt = this.state.vocabTest;
      if (this.state.view === 'vocabTest' && vt && vt.setId && !vt.isCompleted) {
        this.forfeitVocabTest();
        e.preventDefault();
        e.returnValue = '시험 진행 중 페이지를 벗어나면 불합격(0점) 처리됩니다.';
      }
      const pt = this.state.practiceTest;
      if (this.state.view === 'practiceTest' && pt && pt.testId && !pt.isCompleted && !pt.isReviewOnly) {
        e.preventDefault();
        e.returnValue = '시험 진행 중 페이지를 벗어나면 작성 중인 답안이 저장되지 않습니다.';
      }
      const tm = this.state.textMemorizeExam;
      if (tm && tm.testId && !tm.isCompleted) {
        this.forfeitTextMemorizeTest();
        e.preventDefault();
        e.returnValue = '시험 진행 중 페이지를 벗어나면 0점 불합격 처리됩니다.';
      }
    });

    // 모달 배경 클릭 시 닫기
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          // 시험 등록/수정 모달은 여백(배경) 클릭으로 꺼지지 않도록 방지 (X 버튼 또는 취소 버튼으로만 닫힘)
          if (overlay.id === 'adminTestFormModal') {
            return;
          }
          // 본문 암기 시험 진행 중 배경 클릭 → 포기 confirm
          if (overlay.id === 'textMemorizeExamModal' && this.state.textMemorizeExam && !this.state.textMemorizeExam.isCompleted) {
            if (confirm('시험 진행 중에 나가면 0점(불합격) 처리됩니다.\n\n정말 시험을 포기하고 나가시겠습니까?')) {
              this.forfeitTextMemorizeTest();
            }
            return;
          }
          this.hideModal(overlay.id);
        }
      });
    });

    // 화면 크기 변경 감지: 데스크톱 크기(1024px 이상)로 전환 시 모바일 드로어 및 스크롤 잠금 자동 해제
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) {
        this.closeMobileSidebar();
      }
    });
  },

  // ========================================================
  // 1. 네비게이션 & 뷰 전환 (Navigation & Views)
  // ========================================================
  async checkAndConfirmVocabTestExit() {
    if (this.blockGrammarExit?.()) return false;
    const vt = this.state.vocabTest;
    if (this.state.view === 'vocabTest' && vt && !vt.isCompleted) {
      const confirmExit = confirm('시험 진행 중에 나가면 0점(불합격) 처리되며 10분 동안 다시 응시할 수 없습니다.\n\n정말 시험을 종료하고 나가시겠습니까?');
      if (!confirmExit) return false;
      try {
        await this.forfeitVocabTest();
      } catch (err) {
        console.error(err);
      }
      this.state.vocabTest = null;
    }
    return true;
  },

  async handleLogoClick() {
    if (!(await this.checkAndConfirmVocabTestExit())) return;
    if (this.state.isAdminLoggedIn) {
      this.showAdminDashboard();
    } else if (this.state.isStudentLoggedIn) {
      this.selectStudent(this.state.selectedStudentId);
    } else {
      await this.showLanding();
    }
  },

  async showLanding() {
    if (!(await this.checkAndConfirmVocabTestExit())) return;
    this.clearVocabQuestionTimer();
    this.state.vocabTest = null;
    this.state.practiceTest = null;
    this.state.isStudentLoggedIn = false;
    this.state.isAdminLoggedIn = false;
    this.state.isAdminStudentPreview = false;
    this.state.view = 'landing';
    document.getElementById('landingView').classList.remove('hidden');
    document.getElementById('studentDashboardView').classList.add('hidden');
    document.getElementById('adminDashboardView').classList.add('hidden');
    document.getElementById('vocabTestView').classList.add('hidden');
    document.getElementById('practiceTestView')?.classList.add('hidden');
    document.getElementById('textMemorizePaperView')?.classList.add('hidden');
    this.updateHeaderActions();
    this.renderLanding();
    this.focusLoginInput();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async logoutStudent() {
    if (!(await this.checkAndConfirmVocabTestExit())) return;
    if (window.PaceAuth) return PaceAuth.logout();
    this.clearSession();
    this.state.isStudentLoggedIn = false;
    this.toast('로그아웃되었습니다.', 'info');
    await this.showLanding();
  },

  async selectStudent(studentId) {
    if (this.blockGrammarExit?.()) return;
    const normalizedStudentId = Number(studentId);
    if (!this.state.isAdminLoggedIn && !this.state.isStudentLoggedIn) {
      this.toast('로그인한 후 이용해주세요.', 'info');
      await this.showLanding();
      return;
    }

    if (this.state.view === 'vocabTest' && this.state.vocabTest && !this.state.vocabTest.isCompleted) {
      if (!(await this.checkAndConfirmVocabTestExit())) return;
    }

    // Keep the persisted admin session, but use the actual student UI and rules.
    if (this.state.isAdminLoggedIn) {
      this.closeAllModals();
      if (typeof AcademicManager !== 'undefined') AcademicManager.studentTab = 'schedule';
      this.state.isAdminStudentPreview = true;
      this.state.isAdminLoggedIn = false;
      this.state.isStudentLoggedIn = true;
    }
    this.clearVocabQuestionTimer();
    this.state.selectedStudentId = normalizedStudentId;
    this.state.view = 'student';
    this.state.calendarDate = new Date(); // 오늘 기준으로 캘린더 초기화
    this.state.studentViewTab = 'calendar';
    this.state.studentListFilter = 'ALL';

    document.getElementById('landingView').classList.add('hidden');
    document.getElementById('studentDashboardView').classList.remove('hidden');
    document.getElementById('adminDashboardView').classList.add('hidden');
    document.getElementById('vocabTestView').classList.add('hidden');
    document.getElementById('practiceTestView')?.classList.add('hidden');
    document.getElementById('textMemorizePaperView')?.classList.add('hidden');
    this.updateHeaderActions();

    this.renderStudentDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });

  },

  isCalendarOnlyStudent() {
    const student = AppData.getStudentById(this.state.selectedStudentId);
    return Boolean(
      this.state.isStudentLoggedIn &&
      !this.state.isAdminLoggedIn &&
      student &&
      student.accessMode === 'CALENDAR_ONLY'
    );
  },

  async showAdminDashboard() {
    if (!(await this.checkAndConfirmVocabTestExit())) return;
    this.clearVocabQuestionTimer();
    if (this.state.isAdminStudentPreview) {
      this.state.isAdminStudentPreview = false;
      this.state.isAdminLoggedIn = true;
      this.state.isStudentLoggedIn = false;
      this.closeAllModals();
    }
    this.state.view = 'admin';
    document.getElementById('landingView').classList.add('hidden');
    document.getElementById('studentDashboardView').classList.add('hidden');
    document.getElementById('adminDashboardView').classList.remove('hidden');
    document.getElementById('vocabTestView').classList.add('hidden');
    document.getElementById('practiceTestView')?.classList.add('hidden');
    document.getElementById('textMemorizePaperView')?.classList.add('hidden');
    this.updateHeaderActions();

    this.renderAdminDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  showVocabTestView() {
    if (this.blockGrammarExit?.()) return;
    this.state.view = 'vocabTest';
    document.getElementById('landingView').classList.add('hidden');
    document.getElementById('studentDashboardView').classList.add('hidden');
    document.getElementById('adminDashboardView').classList.add('hidden');
    document.getElementById('vocabTestView').classList.remove('hidden');
    document.getElementById('practiceTestView')?.classList.add('hidden');
    document.getElementById('textMemorizePaperView')?.classList.add('hidden');
    this.updateHeaderActions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  showPracticeTestView() {
    if (this.blockGrammarExit?.()) return;
    this.clearVocabQuestionTimer();
    this.state.view = 'practiceTest';
    document.getElementById('landingView').classList.add('hidden');
    document.getElementById('studentDashboardView').classList.add('hidden');
    document.getElementById('adminDashboardView').classList.add('hidden');
    document.getElementById('vocabTestView').classList.add('hidden');
    document.getElementById('practiceTestView')?.classList.remove('hidden');
    document.getElementById('textMemorizePaperView')?.classList.add('hidden');
    this.updateHeaderActions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  updateHeaderActions() {
    AppData.queueWeeklyReviews?.();
    document.getElementById('vocabTestView')?.classList.toggle('vocab-result-active', this.state.view === 'vocabTest' && Boolean(this.state.vocabTest?.isCompleted));
    document.getElementById('paceReportView')?.classList.toggle('hidden', this.state.view !== 'paceReport');
    document.getElementById('weeklyReviewView')?.classList.toggle('hidden', this.state.view !== 'weeklyReview');
    document.getElementById('grammarCompletionView')?.classList.toggle('hidden', this.state.view !== 'grammarResult');
    document.getElementById('grammarTestView')?.classList.toggle('hidden', this.state.view !== 'grammarTest');
    const container = document.getElementById('headerNavActions');
    const mobileToggleBtn = document.getElementById('mobileSidebarToggleBtn');

    // 모바일 햄버거 토글 버튼 표시 여부 갱신 (학생 대시보드 뷰 활성 시 노출, 데스크톱 lg: 화면에서는 항상 숨김)
    const stuDashboard = document.getElementById('studentDashboardView');
    const isStudentActive = (this.state.isStudentLoggedIn || this.state.isAdminLoggedIn) && stuDashboard && !stuDashboard.classList.contains('hidden');
    const hideStudentMenu = this.isCalendarOnlyStudent();
    document.body.classList.toggle('calendar-only-student', Boolean(isStudentActive && hideStudentMenu));

    if (mobileToggleBtn) {
      if (isStudentActive && !hideStudentMenu) {
        mobileToggleBtn.style.removeProperty('display');
        mobileToggleBtn.classList.remove('hidden');
        mobileToggleBtn.classList.add('flex', 'lg:hidden');
      } else {
        // 모바일 전용 CSS보다 우선하여 캘린더 전용 계정에서는 메뉴 버튼을 완전히 제거합니다.
        if (hideStudentMenu) mobileToggleBtn.style.setProperty('display', 'none', 'important');
        else mobileToggleBtn.style.removeProperty('display');
        mobileToggleBtn.classList.add('hidden');
        mobileToggleBtn.classList.remove('flex');
        this.closeMobileSidebar();
      }
    }

    // 학생 사이드바 표시 여부 제어 (학생 대시보드 뷰 활성 시 노출, 그 외 뷰에서는 숨김)
    const studentSidebar = document.getElementById('studentSidebar');
    if (studentSidebar) {
      if (isStudentActive && !hideStudentMenu) {
        studentSidebar.classList.remove('hidden');
      } else {
        studentSidebar.classList.add('hidden');
        this.closeMobileSidebar();
      }
    }

    if (!container) return;

    if (this.isGrammarExamActive?.()) {
      container.innerHTML = '';
      return;
    }

    if (this.state.isAdminStudentPreview) {
      container.innerHTML = `
        <button onclick="App.showAdminDashboard()" class="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
          <i class="fa-solid fa-arrow-left"></i>
          <span>관리자 탭으로 돌아가기</span>
        </button>
      `;
    } else if (this.state.isAdminLoggedIn) {
      container.innerHTML = `
        <div class="flex items-center gap-2">
          ${this.state.view !== 'admin' ? `
            <button onclick="App.showAdminDashboard()" class="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
              <i class="fa-solid fa-gauge-high"></i>
              <span>관리자</span>
            </button>
          ` : ''}
          <button onclick="App.logoutAdmin()" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
            <i class="fa-solid fa-right-from-bracket"></i>
            <span>관리자 로그아웃</span>
          </button>
        </div>
      `;
    } else if (this.state.isStudentLoggedIn) {
      const profileButton = `
        <button onclick="PaceAuth.openProfileSettings()" class="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center gap-1.5 border border-indigo-200 cursor-pointer" title="목표 설정 / 목표 대학 / 비밀번호 변경">
          <i class="fa-solid fa-user-gear"></i>
          <span>프로필 설정</span>
        </button>
      `;
      container.innerHTML = `
        <div class="flex items-center gap-2">
          ${profileButton}
          <button onclick="App.logoutStudent()" class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer">
            <i class="fa-solid fa-right-from-bracket"></i>
            <span>로그아웃</span>
          </button>
        </div>
      `;
    } else {
      container.innerHTML = '';
    }
  },

  // ========================================================
  // 모바일 사이드바 드로어 제어 (우측 슬라이드 인/아웃)
  // ========================================================
  openMobileSidebar() {
    const sidebar = document.getElementById('studentSidebar');
    const backdrop = document.getElementById('mobileSidebarBackdrop');
    const toggleBtn = document.getElementById('mobileSidebarToggleBtn');
    if (!sidebar || sidebar.classList.contains('hidden')) return;

    sidebar.classList.remove('translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.setAttribute('aria-label', '메뉴 닫기');
    }
  },

  closeMobileSidebar() {
    const sidebar = document.getElementById('studentSidebar');
    const backdrop = document.getElementById('mobileSidebarBackdrop');
    const toggleBtn = document.getElementById('mobileSidebarToggleBtn');
    if (!sidebar) return;

    sidebar.classList.add('translate-x-full');
    sidebar.classList.remove('sidebar-touch-expanded');
    this.touchSidebarJustOpened = false;
    if (backdrop) backdrop.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.setAttribute('aria-label', '메뉴 열기');
    }
  },

  toggleMobileSidebar() {
    const sidebar = document.getElementById('studentSidebar');
    if (!sidebar) return;
    const isClosed = sidebar.classList.contains('translate-x-full');
    if (isClosed) {
      this.openMobileSidebar();
    } else {
      this.closeMobileSidebar();
    }
  },

  // ========================================================
  // 2. 랜딩 화면 렌더링 (Unified Login)
  // ========================================================
  renderLanding() {
    const errorEl = document.getElementById('loginError');
    if (errorEl) errorEl.classList.add('hidden');

  },

  focusLoginInput() {
    const idInput = document.getElementById('studentLoginId');
    if (idInput && (this.state.view === 'landing' || !this.state.view)) idInput.focus();
  },

  handleLogin(e) { return window.PaceAuth?.login(e); },

  // ========================================================
  // 3. 학생 전용 대시보드 (Student Dashboard & Calendar)
  // ========================================================
  renderStudentDashboard() {
    const student = AppData.getStudentById(this.state.selectedStudentId);
    if (!student) return;

    const tests = AppData.getTestsByStudentId(student.id);
    const todayStr = this.getTodayDateString();

    // 1. 학생 배너 렌더링 (메인창 상단 배치)
    const banner = document.getElementById('studentBanner');
    banner.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center space-x-3.5 sm:space-x-4">
          <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-b from-slate-300 to-slate-400 flex items-center justify-center text-white shadow-md flex-shrink-0 border-2 border-white">
            <i class="fa-solid fa-user text-2xl sm:text-3xl text-white/90"></i>
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">${this.escapeHtml(student.name)} 학생의 학습 공간</h2>
              ${this.state.isAdminLoggedIn ? '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap"><i class="fa-solid fa-eye mr-1"></i>관리자 미리보기</span>' : ''}
            </div>
            <p class="text-xs sm:text-sm text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
              <i class="fa-solid fa-bullseye text-indigo-500"></i>
              <span>목표: <strong class="text-slate-800 font-bold">${this.escapeHtml(student.target)}</strong></span>
            </p>
          </div>
        </div>
        ${this.state.isAdminLoggedIn ? `
          <button onclick="App.showAdminDashboard()" class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm shadow-indigo-200 self-start sm:self-auto cursor-pointer">
            <i class="fa-solid fa-gauge-high"></i>
            <span>관리자 대시보드로 돌아가기</span>
          </button>
        ` : ''}
      </div>
    `;

    // 2. 통계 위젯 렌더링
    const grammarStats = this.grammarStatistics(tests);
    const totalTests = tests.filter(t => t.type !== 'GRAMMAR').length + grammarStats.total;
    const passedTests = tests.filter(t => t.type !== 'GRAMMAR' && (t.status === 'PASS' || t.retestStatus === 'RETEST_PASS' || (t.type === 'PRACTICE' && t.practiceResult))).length + grammarStats.passed;
    const retestNeeded = tests.filter(t => t.type !== 'GRAMMAR' && t.type !== 'PRACTICE' && (t.retestStatus === 'RETEST_PENDING' || (t.status === 'FAIL' && t.retestStatus !== 'RETEST_PASS'))).length + grammarStats.failed;
    const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

    const typeOrder = { 'PRACTICE': 1, 'TEXT_MEMORIZE': 2, 'REGULAR': 3, 'VOCAB': 4 };
    const upcomingTests = tests
      .filter(t => t.date >= todayStr && (t.type === 'GRAMMAR' ? t.grammarStage !== 'done' : t.status === 'SCHEDULED'))
      .sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff !== 0) return dateDiff;
        const ordA = typeOrder[a.type] || 5;
        const ordB = typeOrder[b.type] || 5;
        return ordA - ordB;
      });
    const nextTest = upcomingTests[0];
    const nextDDay = nextTest ? this.calculateDDay(nextTest.date) : '-';

    const statsGrid = document.getElementById('studentStatsGrid');
    statsGrid.innerHTML = `
      <div ${nextTest ? `onclick="App.openTestDetailModal('${nextTest.id}')" role="button" class="glass-card rounded-xl p-3 flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition"` : `class="glass-card rounded-xl p-3 flex flex-col justify-between"`}>
        <div class="flex items-center justify-between text-slate-400 text-[11px]">
          <span>다음 시험</span>
          <i class="fa-solid fa-hourglass-half text-indigo-500 text-[11px]"></i>
        </div>
        <div class="mt-1.5">
          <div class="text-lg font-black text-indigo-600 leading-tight">${nextDDay}</div>
          <p class="text-[10px] text-slate-500 truncate mt-0.5">${nextTest ? this.escapeHtml(nextTest.title) : '예정 없음'}</p>
        </div>
        ${nextTest ? `
          <div class="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-indigo-600">
            <span>열기</span>
            <i class="fa-solid fa-arrow-right text-[9px]"></i>
          </div>
        ` : ''}
      </div>

      <div class="glass-card rounded-xl p-3 flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-400 text-[11px]">
          <span>통과율</span>
          <i class="fa-solid fa-chart-pie text-emerald-500 text-[11px]"></i>
        </div>
        <div class="mt-1.5">
          <div class="text-lg font-black text-emerald-600 leading-tight">${passRate}%</div>
          <p class="text-[10px] text-slate-500 mt-0.5">${passedTests}개 / ${totalTests}개</p>
        </div>
      </div>

      <div class="glass-card rounded-xl p-3 flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-400 text-[11px]">
          <span>재시험</span>
          <i class="fa-solid fa-triangle-exclamation text-amber-500 text-[11px]"></i>
        </div>
        <div class="mt-1.5">
          <div class="text-lg font-black ${retestNeeded > 0 ? 'text-amber-600' : 'text-slate-700'} leading-tight">${retestNeeded}건</div>
          <p class="text-[10px] text-slate-500 mt-0.5">${retestNeeded > 0 ? '대비 필수' : '재시험 없음'}</p>
        </div>
      </div>

      <div class="glass-card rounded-xl p-3 flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-400 text-[11px]">
          <span>시험 수</span>
          <i class="fa-solid fa-file-lines text-slate-500 text-[11px]"></i>
        </div>
        <div class="mt-1.5">
          <div class="text-lg font-black text-slate-800 leading-tight">${totalTests}회</div>
          <p class="text-[10px] text-slate-500 mt-0.5">${grammarStats.total ? '문법은 영역별 집계' : '누적 기록'}</p>
        </div>
      </div>
    `;

    // 3. 탭 컨테이너 visible 상태 동기화 (계정 전환 시 스테일 목록 버그 방지)
    const calContainer = document.getElementById('studentCalendarContainer');
    const listContainer = document.getElementById('studentListContainer');
    const calTabBtn = document.getElementById('viewTabCalendar');
    const listTabBtn = document.getElementById('viewTabList');
    if (calContainer && listContainer) {
      if (this.state.studentViewTab === 'calendar') {
        calContainer.classList.remove('hidden');
        listContainer.classList.add('hidden');
        if (calTabBtn) calTabBtn.className = 'px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition bg-white text-slate-900 shadow-sm flex items-center gap-1.5';
        if (listTabBtn) listTabBtn.className = 'px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition text-slate-600 hover:text-slate-900 flex items-center gap-1.5';
        this.renderCalendar();
      } else {
        calContainer.classList.add('hidden');
        listContainer.classList.remove('hidden');
        if (listTabBtn) listTabBtn.className = 'px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition bg-white text-slate-900 shadow-sm flex items-center gap-1.5';
        if (calTabBtn) calTabBtn.className = 'px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition text-slate-600 hover:text-slate-900 flex items-center gap-1.5';
        this.renderStudentTestsList();
      }
    }

    const existingVocabSection = document.getElementById('studentVocabSection');
    if (existingVocabSection) existingVocabSection.remove();
  },

  switchStudentViewTab(tab) {
    this.state.studentViewTab = tab;
    const calTabBtn = document.getElementById('viewTabCalendar');
    const listTabBtn = document.getElementById('viewTabList');
    const calContainer = document.getElementById('studentCalendarContainer');
    const listContainer = document.getElementById('studentListContainer');

    if (tab === 'calendar') {
      calTabBtn.className = 'px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition bg-white text-slate-900 shadow-sm flex items-center gap-1.5';
      listTabBtn.className = 'px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition text-slate-600 hover:text-slate-900 flex items-center gap-1.5';
      calContainer.classList.remove('hidden');
      listContainer.classList.add('hidden');
      this.renderCalendar();
    } else {
      listTabBtn.className = 'px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition bg-white text-slate-900 shadow-sm flex items-center gap-1.5';
      calTabBtn.className = 'px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition text-slate-600 hover:text-slate-900 flex items-center gap-1.5';
      calContainer.classList.add('hidden');
      listContainer.classList.remove('hidden');
      this.renderStudentTestsList();
    }
  },

  // 캘린더 네비게이션
  prevMonth() {
    this.state.calendarDate.setMonth(this.state.calendarDate.getMonth() - 1);
    this.renderCalendar();
  },

  nextMonth() {
    this.state.calendarDate.setMonth(this.state.calendarDate.getMonth() + 1);
    this.renderCalendar();
  },

  goToToday() {
    this.state.calendarDate = new Date();
    this.renderCalendar();
  },

  // 캘린더 월간 그리드 렌더링
  renderCalendar() {
    const calGrid = document.getElementById('calendarDaysGrid');
    const title = document.getElementById('calendarMonthTitle');
    if (!calGrid || !title) return;

    const currYear = this.state.calendarDate.getFullYear();
    const currMonth = this.state.calendarDate.getMonth(); // 0-11
    title.innerText = `${currYear}년 ${currMonth + 1}월`;

    const firstDayIndex = new Date(currYear, currMonth, 1).getDay(); // 0(Sun) - 6(Sat)
    const lastDate = new Date(currYear, currMonth + 1, 0).getDate();
    const prevLastDate = new Date(currYear, currMonth, 0).getDate();

    const studentTests = AppData.getTestsByStudentId(this.state.selectedStudentId);
    const todayStr = this.getTodayDateString();

    let gridHtml = '';

    // 1. 이전 달 날짜들 채우기
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevLastDate - i;
      const prevDate = new Date(currYear, currMonth - 1, dayNum);
      const dateStr = this.formatDate(prevDate);
      gridHtml += this.buildCalendarCell(dayNum, dateStr, true, studentTests, todayStr);
    }

    // 2. 이번 달 날짜들 채우기
    for (let dayNum = 1; dayNum <= lastDate; dayNum++) {
      const curDate = new Date(currYear, currMonth, dayNum);
      const dateStr = this.formatDate(curDate);
      gridHtml += this.buildCalendarCell(dayNum, dateStr, false, studentTests, todayStr);
    }

    // 3. 다음 달 날짜들 채우기 (7열 그리드 마감)
    const totalCells = firstDayIndex + lastDate;
    const nextDaysNeeded = (7 - (totalCells % 7)) % 7;
    for (let dayNum = 1; dayNum <= nextDaysNeeded; dayNum++) {
      const nextDate = new Date(currYear, currMonth + 1, dayNum);
      const dateStr = this.formatDate(nextDate);
      gridHtml += this.buildCalendarCell(dayNum, dateStr, true, studentTests, todayStr);
    }

    calGrid.innerHTML = gridHtml;
  },

  renderCalendarLearningTest(test, label, icon, handler) {
    const badgeStyle = this.getTestBadgeStyle(test, false);
    const completedGrammar = test.type === 'GRAMMAR' && badgeStyle.tag === '완료';
    return `<div onclick="App.${handler}('${test.id}')" class="test-event-pill px-1.5 py-1 rounded-md mb-1 font-semibold flex items-center gap-1 shadow-xs ${badgeStyle.class}" title="${this.escapeHtml(label)}${completedGrammar ? ' · 완료' : ''}"><div class="truncate flex items-center gap-1 min-w-0"><span class="inline-flex w-4 flex-shrink-0 items-center justify-center"><i aria-hidden="true" class="fa-solid fa-fw ${icon}"></i></span><span class="truncate">${this.escapeHtml(label)}</span></div></div>`;
  },

  // 캘린더 개별 날짜 셀 생성 헬퍼
  buildCalendarCell(dayNum, dateStr, isOtherMonth, studentTests, todayStr) {
    const isToday = dateStr === todayStr;
    const cellClass = `calendar-day-cell p-1.5 sm:p-2 bg-white flex flex-col justify-start relative ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today !bg-indigo-50/70 ring-1 ring-inset ring-indigo-400' : ''}`;

    // 해당 날짜에 있는 시험 필터링 (본시험 날짜이거나 재시험 날짜인 경우)
    const dayTests = studentTests.filter(t => t.date === dateStr || t.retestDate === dateStr);

    // 무조건 일반 시험 -> 문제풀이 시험 -> 단어 시험 순서로 정렬
    const typeOrder = { 'REGULAR': 1, 'PRACTICE': 2, 'VOCAB': 3 };
    dayTests.sort((a, b) => {
      const orderA = typeOrder[a.type] || 1;
      const orderB = typeOrder[b.type] || 1;
      return orderA - orderB;
    });

    let testsHtml = '';
    dayTests.forEach(test => {
      if (test.type === 'VOCAB_REVIEW') {
        if (test.status !== 'REVIEW_DATA_NEEDED') testsHtml += this.renderCalendarLearningTest(test, '주간 복습', 'fa-rotate', 'openWeeklyReviewModal');
        return;
      }
      if (test.type === 'GRAMMAR') {
        if (test.date === dateStr) testsHtml += this.renderCalendarLearningTest(test, '문법 테스트', 'fa-align-left', 'openGrammarTestModal');
        return;
      }
      if (test.type === 'VOCAB') {
        if (test.date === dateStr) {

          const badgeStyle = this.getTestBadgeStyle(test, false);
          const isCompleted = badgeStyle.tag === '완료';

          {
            const isEngDef = Boolean(test.isEnglishDefTest);
            const vocabCalendarLabel = isEngDef ? '영영풀이 테스트' : '단어 테스트';
            const pillIcon = isEngDef ? 'fa-graduation-cap' : 'fa-spell-check';
            testsHtml += this.renderCalendarLearningTest(test, vocabCalendarLabel, pillIcon, 'openVocabTestScheduleModal');
          }
        }
        return;
      }
      if (test.type === 'PRACTICE') {
        if (test.date === dateStr) {
          const isCompleted = Boolean(test.practiceResult || test.status === 'PASS');
          const badgeStyle = this.getTestBadgeStyle(test, false);
          testsHtml += `
            <div onclick="App.openPracticeTestScheduleModal('${test.id}')" class="test-event-pill px-1.5 py-1 rounded-md mb-1 font-semibold flex items-center justify-between gap-1 shadow-xs ${badgeStyle.class}" title="${isCompleted ? '문제풀이 시험 응시 완료 (결과 확인)' : '문제풀이 시험 확인 및 응시'}">
              <div class="truncate flex items-center gap-1 min-w-0">
                <span><i class="fa-solid ${isCompleted ? 'fa-circle-check text-emerald-600' : 'fa-pen-to-square'}"></i></span>
                <span class="truncate">${this.escapeHtml(test.title || '문제풀이 시험')}</span>
              </div>
              ${isCompleted ? '<span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-900 flex-shrink-0">완료</span>' : ''}
            </div>`;
        }
        return;
      }
      if (test.type === 'TEXT_MEMORIZE') {
        if (test.date === dateStr) {
          const badgeStyle = this.getTestBadgeStyle(test, false);
          let bookIconColor = 'text-blue-600';
          if (badgeStyle.tag === '완료' || test.status === 'PASS') {
            bookIconColor = 'text-emerald-600';
          } else if (test.allowRetest || badgeStyle.tag === '재시험대기' || test.retestStatus === 'RETEST_PENDING') {
            bookIconColor = 'text-amber-600';
          } else if (badgeStyle.tag === '불합격' || test.status === 'FAIL') {
            bookIconColor = 'text-rose-600';
          }
          testsHtml += `
            <div onclick="App.openTextMemorizeScheduleModal('${test.id}')" class="test-event-pill px-1.5 py-1 rounded-md mb-1 font-semibold flex items-center gap-1 shadow-xs ${badgeStyle.class}" title="본문암기 시험">
              <div class="truncate flex items-center gap-1">
                <span><i class="fa-solid fa-book-open ${bookIconColor}"></i></span>
                <span class="truncate">${this.escapeHtml(test.title || '본문암기')}</span>
              </div>
            </div>`;
        }
        return;
      }
      const isRetestDay = test.retestDate === dateStr && test.date !== dateStr;
      const badgeStyle = this.getTestBadgeStyle(test, isRetestDay);

      testsHtml += `
        <div onclick="App.openTestDetailModal('${test.id}')" class="test-event-pill px-1.5 py-1 rounded-md mb-1 font-semibold flex items-center gap-1 shadow-xs ${badgeStyle.class}" title="클릭하여 상세 정보 확인">
          <div class="truncate flex items-center gap-1">
            <span>${badgeStyle.icon}</span>
            <span class="truncate">${this.escapeHtml(test.title)}</span>
          </div>
        </div>
      `;
    });

    return `
      <div class="${cellClass}">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs sm:text-sm font-bold ${isToday ? 'text-indigo-600' : isOtherMonth ? 'text-slate-300' : 'text-slate-700'}">
            ${dayNum}
          </span>
          ${isToday ? '<span class="text-[10px] font-black text-indigo-600 uppercase">Today</span>' : ''}
        </div>
        <div class="space-y-1 overflow-y-auto max-h-[80px]">
          ${testsHtml}
        </div>
      </div>
    `;
  },

  // 시험 상태에 따른 스타일/배지 반환
  getTestBadgeStyle(test, isRetestDay = false) {
    if (test.type === 'GRAMMAR') return this.grammarBadge(test);
    if (isRetestDay) {
      if (test.retestStatus === 'RETEST_PASS') {
        return { class: 'bg-emerald-100 text-emerald-800 border border-emerald-300', icon: '', tag: '재시험 통과' };
      } else if (test.retestStatus === 'RETEST_FAIL') {
        return { class: 'bg-rose-100 text-rose-800 border border-rose-300', icon: '', tag: '재시험 불합격' };
      } else {
        return { class: 'bg-amber-100 text-amber-800 border border-amber-300', icon: '', tag: '재시험 예정' };
      }
    }

    // 유형별 문제풀이 시험(PRACTICE)은 재시험 없이 응시만 하면 무조건 초록색(완료) 표시
    if (test.type === 'PRACTICE') {
      if (test.practiceResult || test.status === 'PASS' || test.retestStatus === 'RETEST_PASS') {
        return { class: 'bg-emerald-100 text-emerald-800 border border-emerald-300', icon: '<i class="fa-solid fa-check"></i>', tag: '응시 완료' };
      }
      return { class: 'bg-blue-100 text-blue-800 border border-blue-200', icon: '', tag: '예정' };
    }

    // 1. 통과/완료된 시험은 응시 가능 시간 여부와 무관하게 무조건 '완료'
    const tmResult = (test.type === 'TEXT_MEMORIZE') ? AppData.getTextMemorizeResult(test.studentId, test.id) : null;
    if (test.status === 'PASS' || test.retestStatus === 'RETEST_PASS' || test.practiceResult?.passed || tmResult?.passed) {
      return { class: 'bg-emerald-100 text-emerald-800 border border-emerald-300', icon: '', tag: '완료' };
    }

    // 단어 테스트 마감 처리
    if (test.type === 'VOCAB') {
      if (this.getTestTimeStatus(test).status === 'EXPIRED') {
        return { class: 'bg-rose-100 text-rose-800 border border-rose-300', icon: '', tag: '마감' };
      }
    }

    // 본문 암기 또는 일반 시험 불합격/재시험 처리
    if (test.status === 'FAIL' || (tmResult && !tmResult.passed)) {
      if (test.retestStatus === 'RETEST_PENDING' || test.allowRetest) {
        return { class: 'bg-amber-100 text-amber-800 border border-amber-300', icon: '', tag: '재시험 허용' };
      } else {
        return { class: 'bg-rose-100 text-rose-800 border border-rose-300', icon: '', tag: '불합격' };
      }
    } else {
      return { class: 'bg-blue-100 text-blue-800 border border-blue-200', icon: '', tag: '예정' };
    }
  },

  // 학생 리스트형 뷰 필터 및 렌더링
  filterStudentTests(filterType) {
    this.state.studentListFilter = filterType;
    ['ALL', 'SCHEDULED', 'PASS', 'RETEST'].forEach(f => {
      const btn = document.getElementById(`filterBtn${f}`);
      if (btn) {
        if (f === filterType) {
          btn.className = 'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-900 text-white shadow-sm transition';
        } else {
          btn.className = 'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition';
        }
      }
    });
    this.renderStudentTestsList();
  },

  renderStudentTestsList() {
    const container = document.getElementById('studentTestsListContent');
    if (!container) return;

    let tests = AppData.getTestsByStudentId(this.state.selectedStudentId).filter(t => t.status !== 'REVIEW_DATA_NEEDED');
    const filter = this.state.studentListFilter;

    if (filter === 'SCHEDULED') {
      tests = tests.filter(t => t.type === 'GRAMMAR' ? t.grammarStage !== 'done' : t.status === 'SCHEDULED' && (!t.practiceResult || t.type !== 'PRACTICE'));
    } else if (filter === 'PASS') {
      tests = tests.filter(t => t.type === 'GRAMMAR' ? t.grammarParts.some(part => GrammarLogic.partState(t, part) === 'PASS') : t.status === 'PASS' || t.retestStatus === 'RETEST_PASS' || (t.type === 'PRACTICE' && t.practiceResult));
    } else if (filter === 'RETEST') {
      tests = tests.filter(t => t.type === 'GRAMMAR' ? t.grammarParts.some(part => GrammarLogic.partState(t, part) === 'FAIL') : t.type !== 'PRACTICE' && (t.status === 'FAIL' || t.retestStatus === 'RETEST_PENDING'));
    }

    if (tests.length === 0) {
      container.innerHTML = `
        <div class="glass-card rounded-2xl p-12 text-center text-slate-400">
          <i class="fa-regular fa-folder-open text-4xl mb-3"></i>
          <p class="text-sm font-semibold">해당 조건의 시험 일정이 없습니다.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = tests.map(test => {
      const dDayBadge = this.getTestDDayBadge(test);
      const badge = this.getTestBadgeStyle(test);
      const detailHandler = test.type === 'VOCAB'
        ? `App.openVocabTestScheduleModal('${test.id}')`
        : (test.type === 'PRACTICE'
            ? `App.openPracticeTestScheduleModal('${test.id}')`
            : (test.type === 'TEXT_MEMORIZE'
                ? `App.openTextMemorizeScheduleModal('${test.id}')`
                : `App.openTestDetailModal('${test.id}')`));

      return `
        <div onclick="${detailHandler}" class="glass-card rounded-2xl p-5 hover:border-indigo-300 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${badge.class}">
                ${badge.icon} ${badge.tag}
              </span>
              <span class="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <i class="fa-regular fa-calendar"></i> ${test.date} ${(test.time && test.time !== '00:00' && test.time !== '18:00') ? `(${test.time})` : '(하루종일)'}
              </span>
              <span class="text-xs font-bold px-2 py-0.5 rounded ${dDayBadge.class}">${dDayBadge.text}</span>
            </div>
            <h4 class="text-base font-bold text-slate-900">${this.escapeHtml(test.title)}</h4>
            <p class="text-xs text-slate-600 line-clamp-1">${this.escapeHtml(test.scope || '시험 범위 미기재')}</p>
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
            <div class="text-left sm:text-right">
              <div class="text-xs text-slate-400">커트라인: <strong class="text-slate-700">${this.escapeHtml(test.type === 'VOCAB_REVIEW' ? '모든 오답 해결' : test.type === 'GRAMMAR' ? '개념·실전 각각 80점 이상' : test.cutoff)}</strong></div>
              <div class="text-xs text-slate-400">본인 점수: <strong class="${test.score ? 'text-indigo-600 font-bold' : 'text-slate-400'}">${test.type === 'GRAMMAR' ? this.grammarSummary(test) : (test.score === 0 ? '0' : test.score) || '미응시'}</strong></div>
            </div>
            ${test.type === 'PRACTICE' ? (test.practiceResult ? `
              <button type="button" onclick="event.stopPropagation(); App.viewPracticeTestResultDetail('${test.id}')" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap">
                <i class="fa-solid fa-file-circle-check"></i> 결과 확인
              </button>
            ` : `
              <button type="button" onclick="event.stopPropagation(); App.startPracticeTest('${test.id}')" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap">
                <i class="fa-solid fa-pencil"></i> 시험 응시
              </button>
            `) : (test.type === 'TEXT_MEMORIZE' ? `
              <button type="button" onclick="event.stopPropagation(); App.viewTextMemorizeExamPaper('${test.id}')" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap" title="본문암기 시험지 형태로 보기 (인쇄/정답확인)">
                <i class="fa-solid fa-file-lines"></i> 시험지 보기
              </button>
            ` : '')}
            <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <i class="fa-solid fa-chevron-right text-xs"></i>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // ========================================================
  // 4. 시험 상세 모달 (Test Detail Modal)
  // ========================================================
  openTestDetailModal(testId) {
    const allTests = AppData.getTests();
    const test = allTests.find(t => String(t.id) === String(testId) || t.id === testId);
    if (!test) return;

    if (test.type === 'VOCAB_REVIEW') { this.openWeeklyReviewModal(testId); return; }
    if (test.type === 'GRAMMAR') { this.openGrammarTestModal(testId); return; }

    if (test.type === 'VOCAB') {
      this.openVocabTestScheduleModal(testId);
      return;
    }
    const isTextMemorize = test.type === 'TEXT_MEMORIZE' || (Array.isArray(test.passageIds) && test.passageIds.length > 0) || (test.title && test.title.includes('본문'));
    if (isTextMemorize) {
      test.type = 'TEXT_MEMORIZE';
      this.openTextMemorizeScheduleModal(testId);
      return;
    }
    if (test.type === 'PRACTICE') {
      this.openPracticeTestScheduleModal(testId);
      return;
    }

    const student = AppData.getStudentById(test.studentId);
    const dDayBadge = this.getTestDDayBadge(test);

    document.getElementById('detailModalStudentBadge').innerText = student ? `${student.name} 학생` : '학생 시험 상세';
    document.getElementById('detailModalTitle').innerText = test.title;

    // 본시험 상태 포맷팅
    let statusBadge = '';
    if (test.status === 'PASS') {
      statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">1차 본시험 통과 (PASS)</span>';
    } else if (test.status === 'FAIL') {
      statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">1차 본시험 불합격 (FAIL)</span>';
    } else {
      statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">시험 예정</span>';
    }

    // 재시험 상태 포맷팅
    let retestBadge = '';
    if (test.retestStatus === 'RETEST_PASS') {
      retestBadge = '<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">재시험 통과 완료</span>';
    } else if (test.retestStatus === 'RETEST_FAIL') {
      retestBadge = '<span class="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">재시험 불합격</span>';
    } else if (test.retestStatus === 'RETEST_PENDING') {
      retestBadge = '<span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">재시험 대기 중</span>';
    } else {
      retestBadge = '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">해당없음</span>';
    }

    const modalBody = document.getElementById('detailModalBody');
    modalBody.innerHTML = `
      <!-- Schedule & D-Day Card -->
      <div class="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg">
            <i class="fa-regular fa-calendar-check"></i>
          </div>
          <div>
            <div class="text-xs text-slate-500 font-medium">시험 일정</div>
            <div class="text-sm font-bold text-slate-900">${test.date} ${(test.time && test.time !== '00:00' && test.time !== '18:00') ? `(${test.time})` : '(하루종일)'}</div>
          </div>
        </div>
        <span class="px-3 py-1 rounded-full text-xs ${dDayBadge.class}">${dDayBadge.text}</span>
      </div>

      <!-- Scope Section -->
      <div class="space-y-1.5">
        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <i class="fa-solid fa-book-open text-indigo-500"></i>
          <span>시험 범위 및 상세 설명</span>
        </h4>
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 whitespace-pre-line leading-relaxed">${this.escapeHtml((test.scope || '별도의 시험 범위 설명이 등록되지 않았습니다.').trim())}</div>
      </div>

      <!-- Cutoff vs Score Grid -->
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100">
          <div class="text-xs font-semibold text-indigo-700 flex items-center gap-1">
            <i class="fa-solid fa-flag-checkered"></i>
            <span>커트라인 (기준점)</span>
          </div>
          <div class="text-base font-extrabold text-slate-900 mt-1">${this.escapeHtml(test.cutoff || '미설정')}</div>
          ${test.type === 'VOCAB' ? `
            <div class="text-[11px] text-violet-700 font-bold mt-1.5 pt-1 border-t border-violet-100 flex items-center gap-1">
              <i class="fa-solid fa-list-ol"></i>
              <span>출제 문항: ${this.getVocabQuestionCountSummary(test)}</span>
            </div>
          ` : ''}
        </div>
        <div class="p-3.5 rounded-xl bg-slate-100 border border-slate-200">
          <div class="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <i class="fa-solid fa-award"></i>
            <span>학생 획득 점수</span>
          </div>
          <div class="text-base font-extrabold ${test.score ? 'text-indigo-600' : 'text-slate-400'} mt-1">
            ${test.score ? this.escapeHtml(test.score) : '미응시'}
          </div>
        </div>
      </div>

      <!-- Pass/Fail Status Row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <span class="text-xs font-bold text-slate-500 block">1차 본시험 결과</span>
          <div>${statusBadge}</div>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <span class="text-xs font-bold text-slate-500 block">재시험 결과 ${test.retestDate ? `(${test.retestDate})` : ''}</span>
          <div>${retestBadge}</div>
        </div>
      </div>

      ${Boolean(this.state.isAdminLoggedIn) ? `
        <div class="pt-2 border-t border-slate-100 flex items-center gap-2">
          <button onclick="App.openRescheduleModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs">
            <i class="fa-solid fa-calendar-days"></i> 일정 이동
          </button>
          <button onclick="App.openExtendTestModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs">
            <i class="fa-solid fa-clock-rotate-left"></i> 시간 연장
          </button>
          <button onclick="App.closeTestDetailModal(); App.openEditTestModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-pen-to-square"></i> 전체 수정
          </button>
        </div>
      ` : ''}
    `;

    this.showModal('testDetailModal');
  },

  closeTestDetailModal() {
    this.hideModal('testDetailModal');
  },

  // ── 단어 시험 제목 간결화 포맷터 (교재명은 알아볼 수 있게 온전히 유지) ──
  formatCleanVocabTitle(rawTitle) {
    if (!rawTitle) return '단어 테스트';
    let t = String(rawTitle).trim();


    // 2. 단어 테스트 / 시험 등 불필요한 사족 접미사 및 설명 괄호 제거
    t = t.replace(/\s*단어\s*(?:테스트|시험)/gi, '');
    t = t.replace(/\s*\([^)]*(?:Part|part|문항|출제|세트|합격|랜덤|통과|선|대비|단어)[^)]*\)/gi, '');

    // 3. Day 06 + Day 07 -> Day 06~07 연속 축약 (교재명은 원본 그대로 명확히 유지!)
    const dayMatches = [...t.matchAll(/Day\s*(\d+)/gi)];
    if (dayMatches.length > 1) {
      const nums = dayMatches.map(m => parseInt(m[1], 10));
      const isConsecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
      const pad = (n) => String(n).padStart(2, '0');
      let rangeStr = '';
      if (isConsecutive) {
        rangeStr = `Day ${pad(nums[0])}~${pad(nums[nums.length - 1])}`;
      } else {
        rangeStr = `Day ${nums.map(pad).join(', ')}`;
      }
      t = t.replace(/Day\s*\d+(\s*\+\s*Day\s*\d+)+/gi, rangeStr);
    }

    return t.trim();
  },

  openVocabTestScheduleModal(testId) {
    const test = AppData.getTests().find(item => item.id === testId);
    if (!test) { this.toast('시험 정보를 찾을 수 없습니다.', 'error'); return; }

    const setIds = Array.isArray(test.vocabSetIds) && test.vocabSetIds.length > 0
      ? test.vocabSetIds
      : (test.vocabSetId ? [test.vocabSetId] : []);
    const allSets = AppData.getVocabSets();
    let matchingSets = setIds.map(id => allSets.find(s => s.id === id)).filter(Boolean);

    if (matchingSets.length === 0) {
      const textToSearch = `${test.title || ''} ${test.scope || ''} ${test.id || ''}`;
      const dayMatches = [...textToSearch.matchAll(/Day\s*(\d+)/gi)];
      if (dayMatches.length > 0) {
        const extractedSetIds = [...new Set(dayMatches.map(m => `wm2000_day_${String(m[1]).padStart(2, '0')}`))];
        matchingSets = extractedSetIds.map(id => allSets.find(s => s.id === id)).filter(Boolean);
        if (matchingSets.length > 0) {
          test.vocabSetIds = extractedSetIds;
          test.vocabSetId = extractedSetIds[0];
          AppData.saveOrUpdateTest(test).catch(e => console.warn('Auto-relink test notice:', e));
        }
      }
    }

    if (matchingSets.length === 0) { this.toast('연결된 단어 세트를 찾을 수 없습니다.', 'error'); return; }

    // 단어 병합
    const combinedWords = [];
    matchingSets.forEach(s => {
      if (Array.isArray(s.words)) combinedWords.push(...s.words);
    });

    const primaryBook = matchingSets[0]?.book || '기본 단어장';
    const setTitles = matchingSets.map(s => s.title).join(' + ');
    const set = {
      id: matchingSets.map(s => s.id).join(','),
      book: primaryBook,
      title: setTitles,
      words: combinedWords
    };

    const isAdmin = Boolean(this.state.isAdminLoggedIn);
    const student = AppData.getStudentById(test.studentId);
    const timeStatus = this.getTestTimeStatus(test);
    const isAllDay = !test.time || test.time === '00:00' || test.time === '18:00' || (test.endTime && test.endTime.startsWith('23:59'));
    const scheduleSummary = isAllDay
      ? `총 ${set.words.length}개 단어${test.extendedDate ? ' · 연장됨' : ''}`
      : (test.extendedDate
          ? `${test.time} ~ ${test.extendedDate} ${test.extendedEndTime || '23:59'} (연장됨)`
          : (test.time ? (test.endTime ? `${test.time} ~ ${test.endTime}` : test.time) : '하루종일 응시 가능'));

    const bookName = (primaryBook || '').trim();
    const hasSpecialBook = bookName && bookName !== '기본 단어장';


    // 제목을 간결하고 짧고 깔끔하게 정리
    const rawTitle = test.title || (hasSpecialBook ? `[${bookName}] ${set.title}` : set.title);
    const cleanModalTitle = this.formatCleanVocabTitle(rawTitle);

    let cleanCardTitle = '';
    {
      const dayOnly = cleanModalTitle.replace(/\[[^\]]+\]\s*/g, '').trim();
      cleanCardTitle = dayOnly || set.title;
    }

    document.getElementById('detailModalStudentBadge').innerText = student ? `${student.name} 학생 · 단어 테스트` : '단어 테스트';
    document.getElementById('detailModalTitle').innerText = cleanModalTitle;
    document.getElementById('detailModalBody').innerHTML = `
      <div class="pace-schedule-resource relative p-4 rounded-2xl bg-violet-50 border border-violet-200">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-0 ${'pr-28'}">
          <div class="flex items-center gap-1 flex-wrap">
            ${hasSpecialBook ? `
              <span class="pace-vocab-book-badge" title="${this.escapeHtml(bookName)}">
                <i class="fa-solid fa-book text-[9px]" aria-hidden="true"></i>
                <span>${this.escapeHtml(bookName)}</span>
              </span>
            ` : ''}
            <p class="text-xs sm:text-sm font-black text-violet-950">${this.escapeHtml(cleanCardTitle)}</p>
          </div>
        </div>
        <p class="text-xs text-slate-600 mt-0 ${'pr-28'}">
          시험일: <strong>${test.date}</strong> · ${scheduleSummary}
        </p>
        ${`
          <button type="button" onclick="App.openVocabStudyModal('${set.id}', '${test.id}')" class="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-violet-200 cursor-pointer">
            <i class="fa-solid fa-book-open text-[11px]"></i>
            <span>단어장 열기</span>
          </button>
        `}
      </div>

      ${isAdmin ? `
      <!-- 관리자 전용 시간 연장 카드 -->
      <div class="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center text-sm shadow-xs">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div>
              <h4 class="text-xs font-bold text-amber-950">시험 시간 / 마감 연장 설정</h4>
              <p class="text-[11px] text-amber-800">
                ${test.allowLate ? '상시 응시 허용 중 (마감 없음)' : (isAllDay ? `원래 시험일: ${test.date} · 하루종일 응시 가능` : `원래 시험일: ${test.date}${test.extendedDate ? ` · 마감: ${test.extendedDate} ${test.extendedEndTime || '23:59'} (연장)` : (test.endTime ? ` · 마감: ${test.endTime}` : '')}`)}
              </p>
            </div>
          </div>
          <button onclick="App.openExtendTestModal('${test.id}')" class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5">
            <i class="fa-solid fa-pen-to-square"></i>
            <span>시간 연장하기</span>
          </button>
        </div>
        <div class="flex items-center gap-2 flex-wrap pt-1 border-t border-amber-200/60">
          <span class="text-[11px] font-bold text-amber-900">빠른 연장:</span>
          <button onclick="App.quickExtendTestDirect('${test.id}', 'today_midnight')" class="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold transition">
            오늘 자정까지
          </button>
          <button onclick="App.quickExtendTestDirect('${test.id}', 'plus_1hour')" class="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold transition">
            +1시간
          </button>
          <button onclick="App.quickExtendTestDirect('${test.id}', 'tomorrow_midnight')" class="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold transition">
            내일 자정까지
          </button>
        </div>
      </div>` : ''}

      ${`
        ${test.isEnglishDefTest ? `
          <div class="grid grid-cols-1 gap-2.5">
            ${this.renderVocabTestButton(set, test.studentId, 5, '영영풀이 테스트 (주관식)', 'bg-teal-600 hover:bg-teal-700 shadow-teal-200', test.id)}
          </div>
        ` : `
          <div class="pace-schedule-stages grid gap-2.5">
            ${this.renderVocabTestButton(set, test.studentId, 2, '객관식', 'bg-violet-600 hover:bg-violet-700 shadow-violet-200', test.id)}
            ${this.renderVocabTestButton(set, test.studentId, 3, '스펠링', 'bg-blue-600 hover:bg-blue-700 shadow-blue-200', test.id)}
            ${this.renderVocabTestButton(set, test.studentId, 4, '통합', 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200', test.id)}
          </div>
        `}
      `}

      ${isAdmin ? `
        <div class="pt-2 border-t border-slate-100 flex items-center gap-2">
          <button onclick="App.openRescheduleModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs">
            <i class="fa-solid fa-calendar-days"></i> 일정 이동
          </button>
          <button onclick="App.closeTestDetailModal(); App.openEditTestModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs">
            <i class="fa-solid fa-pen-to-square"></i> 전체 수정
          </button>
        </div>
      ` : ''}
    `;
    this.showModal('testDetailModal');
    this.startVocabRetryCountdown(test.id);
  },

  startVocabRetryCountdown(testId) {
    if (this.vocabRetryCountdownTimer) clearInterval(this.vocabRetryCountdownTimer);

    const updateCountdown = () => {
      const countdown = document.getElementById('vocabRetryCountdown');
      if (!countdown) {
        clearInterval(this.vocabRetryCountdownTimer);
        this.vocabRetryCountdownTimer = null;
        return;
      }

      const remainingMs = new Date(countdown.dataset.retryUntil).getTime() - Date.now();
      if (remainingMs <= 0) {
        clearInterval(this.vocabRetryCountdownTimer);
        this.vocabRetryCountdownTimer = null;
        this.openVocabTestScheduleModal(testId);
        return;
      }

      const totalSeconds = Math.ceil(remainingMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      countdown.textContent = `${minutes}:${seconds}`;
    };

    updateCountdown();
    this.vocabRetryCountdownTimer = setInterval(updateCountdown, 1000);
  },

  // ── 시험 시간 연장 모달 컨트롤러 ────────────────────────
  openExtendTestModal(testId) {
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) { this.toast('시험을 찾을 수 없습니다.', 'error'); return; }

    const student = AppData.getStudentById(test.studentId);
    const timeStatus = this.getTestTimeStatus(test);

    document.getElementById('extendTestId').value = test.id;
    document.getElementById('extendTestStudentName').innerText = student ? `${student.name} 학생` : '';
    document.getElementById('extendTestTitle').innerText = test.title || (test.type === 'VOCAB' ? '단어 테스트' : '시험');
    document.getElementById('extendModalSubtitle').innerText = `${student ? student.name : '학생'} 시험의 마감 시간 연장 (원래 시험일: ${test.date})`;

    const deadlineText = test.allowLate
      ? '상시 응시 허용 (마감 없음)'
      : (test.extendedDate
          ? `시험일: ${test.date} (연장 마감: ${test.extendedDate} ${test.extendedEndTime || '23:59'})`
          : `${test.date} ${test.endTime || '23:59'}`);
    document.getElementById('extendCurrentDeadline').innerText = deadlineText;

    const badge = document.getElementById('extendCurrentStatusBadge');
    if (test.status === 'PASS' || test.retestStatus === 'RETEST_PASS' || test.practiceResult?.passed) {
      badge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800';
      badge.innerText = '완료';
    } else if (test.allowLate) {
      badge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800';
      badge.innerText = '상시 허용';
    } else if (timeStatus.status === 'EXPIRED') {
      badge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800';
      badge.innerText = '시간 종료됨';
    } else if (timeStatus.status === 'NOT_STARTED') {
      badge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800';
      badge.innerText = '시작 전';
    } else {
      badge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800';
      badge.innerText = '응시 가능';
    }

    // 기본 타겟 날짜 & 시간 채우기 (원래 날짜는 건드리지 않고 연장일시만 세팅)
    const today = this.getTodayDateString();
    document.getElementById('extendTargetDate').value = test.extendedDate || (test.date >= today ? test.date : today);
    document.getElementById('extendTargetEndTime').value = test.extendedEndTime || test.endTime || '23:59';

    // 연장 일시 또는 상시 응시 허용이 설정된 경우에만 취소 버튼을 노출한다.
    const cancelButton = document.getElementById('cancelTestExtensionButton');
    if (cancelButton) {
      const hasExtension = Boolean(test.extendedDate || test.extendedEndTime || test.allowLate);
      cancelButton.classList.toggle('hidden', !hasExtension);
    }

    this.showModal('extendTestModal');
  },

  closeExtendTestModal() {
    this.hideModal('extendTestModal');
  },

  async quickExtendTest(preset) {
    const testId = document.getElementById('extendTestId').value;
    await this.quickExtendTestDirect(testId, preset);
    this.closeExtendTestModal();
  },

  async quickExtendTestDirect(testId, preset) {
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) return;

    const today = this.getTodayDateString();
    let extendedDate = test.extendedDate || today;
    let extendedEndTime = test.extendedEndTime || test.endTime || '23:59';
    let allowLate = false;

    const now = new Date();

    if (preset === 'today_midnight') {
      extendedDate = today;
      extendedEndTime = '23:59';
      allowLate = false;
    } else if (preset === 'plus_1hour') {
      const future = new Date(now.getTime() + 60 * 60 * 1000);
      const y = future.getFullYear();
      const m = String(future.getMonth() + 1).padStart(2, '0');
      const d = String(future.getDate()).padStart(2, '0');
      const hh = String(future.getHours()).padStart(2, '0');
      const mm = String(future.getMinutes()).padStart(2, '0');
      extendedDate = `${y}-${m}-${d}`;
      extendedEndTime = `${hh}:${mm}`;
      allowLate = false;
    } else if (preset === 'tomorrow_midnight') {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');
      extendedDate = `${y}-${m}-${d}`;
      extendedEndTime = '23:59';
      allowLate = false;
    } else if (preset === 'unlimited') {
      allowLate = true;
    }

    try {
      await AppData.writeDocument('tests', testId, {
        ...test,
        // 원래 test.date는 보존하고 연장 일시만 별도 필드로 저장
        extendedDate: extendedDate,
        extendedEndTime: extendedEndTime,
        allowLate: allowLate
      });
      await AppData.loadCollection('tests');

      this.toast(`'${test.title || '시험'}' 시험일(${test.date})은 유지되며 마감이 ${allowLate ? '상시 응시 가능으로' : `${extendedDate} ${extendedEndTime}까지`} 연장되었습니다!`, 'success');

      // 화면 갱신
      if (this.state.isAdminLoggedIn) {
        this.renderAdminTestsTab();
      }
      if (this.state.selectedStudentId) {
        this.renderStudentDashboard(this.state.selectedStudentId);
      }

      // 모달이 열려있다면 새로고침
      const detailModal = document.getElementById('testDetailModal');
      if (detailModal && !detailModal.classList.contains('hidden')) {
        if (test.type === 'VOCAB') {
          this.openVocabTestScheduleModal(testId);
        } else if (test.type === 'PRACTICE') {
          this.openPracticeTestScheduleModal(testId);
        }
      }
    } catch (err) {
      console.error(err);
      this.toast('시간 연장에 실패했습니다.', 'error');
    }
  },

  async applyCustomExtendTest() {
    const testId = document.getElementById('extendTestId').value;
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) return;

    const targetDate = document.getElementById('extendTargetDate').value;
    const targetEndTime = document.getElementById('extendTargetEndTime').value;

    if (!targetDate) {
      this.toast('마감 날짜를 선택해주세요.', 'error');
      return;
    }

    try {
      await AppData.writeDocument('tests', testId, {
        ...test,
        // 원래 test.date는 보존
        extendedDate: targetDate,
        extendedEndTime: targetEndTime || '23:59',
        allowLate: false
      });
      await AppData.loadCollection('tests');

      this.toast(`'${test.title || '시험'}' 시험일(${test.date})은 유지되며 마감이 ${targetDate} ${targetEndTime || '23:59'}까지 연장되었습니다.`, 'success');
      this.closeExtendTestModal();

      if (this.state.isAdminLoggedIn) {
        this.renderAdminTestsTab();
      }
      if (this.state.selectedStudentId) {
        this.renderStudentDashboard(this.state.selectedStudentId);
      }

      const detailModal = document.getElementById('testDetailModal');
      if (detailModal && !detailModal.classList.contains('hidden')) {
        if (test.type === 'VOCAB') {
          this.openVocabTestScheduleModal(testId);
        } else if (test.type === 'PRACTICE') {
          this.openPracticeTestScheduleModal(testId);
        }
      }
    } catch (err) {
      console.error(err);
      this.toast('시간 연장 저장에 실패했습니다.', 'error');
    }
  },

  async cancelTestExtension() {
    const testId = document.getElementById('extendTestId').value;
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) return;

    const hasExtension = Boolean(test.extendedDate || test.extendedEndTime || test.allowLate);
    if (!hasExtension) {
      this.toast('취소할 연장 설정이 없습니다.', 'info');
      return;
    }

    if (!confirm(`'${test.title || '시험'}'의 연장을 취소하고 원래 마감(${test.date} ${test.endTime || '23:59'})으로 되돌릴까요?`)) {
      return;
    }

    try {
      await AppData.writeDocument('tests', testId, {
        ...test,
        extendedDate: null,
        extendedEndTime: null,
        allowLate: false
      });
      await AppData.loadCollection('tests');

      this.toast(`'${test.title || '시험'}'의 연장이 취소되어 원래 마감(${test.date} ${test.endTime || '23:59'})이 적용되었습니다.`, 'success');
      this.closeExtendTestModal();

      if (this.state.isAdminLoggedIn) {
        this.renderAdminTestsTab();
      }
      if (this.state.selectedStudentId) {
        this.renderStudentDashboard(this.state.selectedStudentId);
      }

      const detailModal = document.getElementById('testDetailModal');
      if (detailModal && !detailModal.classList.contains('hidden')) {
        if (test.type === 'VOCAB') {
          this.openVocabTestScheduleModal(testId);
        } else if (test.type === 'PRACTICE') {
          this.openPracticeTestScheduleModal(testId);
        }
      }
    } catch (err) {
      console.error(err);
      this.toast('연장 취소에 실패했습니다.', 'error');
    }
  },

  // ── 시험 일정 이동 모달 컨트롤러 (관리자용) ───────────────
  openRescheduleModal(testId) {
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) {
      this.toast('시험을 찾을 수 없습니다.', 'error');
      return;
    }

    const student = AppData.getStudentById(test.studentId);
    document.getElementById('rescheduleTestId').value = test.id;
    document.getElementById('rescheduleStudentName').innerText = student ? `${student.name} 학생` : '학생 시험';
    document.getElementById('rescheduleTestTitle').innerText = test.title || (test.type === 'VOCAB' ? '단어 테스트' : '시험');
    document.getElementById('rescheduleModalSubtitle').innerText = `${student ? student.name : '학생'}의 시험 일정을 원하는 날짜로 이동합니다.`;

    const badgeEl = document.getElementById('rescheduleTestTypeBadge');
    if (badgeEl) {
      const typeLabel = test.type === 'VOCAB' ? '단어 테스트' : (test.type === 'TEXT_MEMORIZE' ? '본문 암기' : (test.type === 'PRACTICE' ? '문제 풀이' : '일반 시험'));
      badgeEl.innerText = typeLabel;
    }

    const currentScheduleText = `${test.date}${test.time ? ` (${test.time} ~ ${test.endTime || '23:59'})` : (test.endTime ? ` (~ ${test.endTime})` : '')}`;
    document.getElementById('rescheduleCurrentSchedule').innerText = currentScheduleText;

    // 인풋 기본값 세팅
    document.getElementById('rescheduleTargetDate').value = test.date || this.formatDate(new Date());
    document.getElementById('rescheduleTargetTime').value = test.time || '';
    document.getElementById('rescheduleTargetEndTime').value = test.endTime || '';

    this.showModal('rescheduleTestModal');
  },

  closeRescheduleModal() {
    this.hideModal('rescheduleTestModal');
  },

  setQuickRescheduleDate(daysFromNow) {
    const target = new Date();
    target.setDate(target.getDate() + Number(daysFromNow));
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const dateInput = document.getElementById('rescheduleTargetDate');
    if (dateInput) dateInput.value = dateStr;
  },

  async confirmRescheduleTest() {
    const testId = document.getElementById('rescheduleTestId')?.value;
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) {
      this.toast('시험 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    const newDate = document.getElementById('rescheduleTargetDate')?.value;
    if (!newDate) {
      this.toast('이동할 새 시험 날짜를 선택해주세요.', 'warning');
      return;
    }

    const newTime = document.getElementById('rescheduleTargetTime')?.value || '';
    const newEndTime = document.getElementById('rescheduleTargetEndTime')?.value || '';

    const oldDate = test.date;
    test.date = newDate;
    if (newTime) test.time = newTime;
    if (newEndTime) test.endTime = newEndTime;

    // 만약 연장 날짜가 원래 날짜보다 이전이 되면 연장 정보 초기화
    if (test.extendedDate && test.extendedDate < newDate) {
      test.extendedDate = null;
      test.extendedEndTime = null;
    }

    try {
      await AppData.saveOrUpdateTest(test);
      this.toast(`'${test.title || '시험'}' 일정이 ${oldDate}에서 ${newDate}(으)로 이동되었습니다!`, 'success');
      this.closeRescheduleModal();

      // 열려있는 시험 상세 모달 닫기
      this.closeTestDetailModal();
      this.hideModal('textMemorizeExamModal');

      // 화면 갱신
      if (this.state.isAdminLoggedIn) {
        this.renderAdminTestsTab();
      }
      if (this.state.selectedStudentId) {
        this.renderStudentDashboard(this.state.selectedStudentId);
      }
    } catch (err) {
      console.error(err);
      this.toast('일정 이동 저장 중 오류가 발생했습니다.', 'error');
    }
  },

  // ========================================================
  // 시험 시간 범위 및 응시 가능 여부 판별 헬퍼
  // ========================================================
  parseDateTime(dateStr, timeStr, isEnd = false) {
    if (!dateStr) return null;
    const cleanDate = String(dateStr).trim();
    let cleanTime = timeStr ? String(timeStr).trim() : (isEnd ? '23:59:59' : '00:00:00');
    // 콜론 개수 파싱 (HH:MM 또는 HH:MM:SS)
    const parts = cleanTime.split(':');
    const hh = parts[0].padStart(2, '0');
    const mm = (parts[1] || '00').padStart(2, '0');
    const ss = (parts[2] || (isEnd ? '59' : '00')).padStart(2, '0');
    const isoString = `${cleanDate}T${hh}:${mm}:${ss}`;
    const parsed = new Date(isoString);
    return isNaN(parsed.getTime()) ? null : parsed;
  },

  getTestTimeStatus(test) {
    if (!test || !test.date) {
      return { status: 'IN_PROGRESS', label: '응시 가능', canStart: true, message: '' };
    }

    const now = new Date();
    const testDate = String(test.date).trim();

    // 시작 시간
    const startDateTime = this.parseDateTime(testDate, test.time, false) || new Date(`${testDate}T00:00:00`);

    // 종료 시간 (연장일시가 있으면 연장일시 우선, 없으면 기본 마감일시)
    const effectiveEndDate = (test.extendedDate && String(test.extendedDate).trim()) ? String(test.extendedDate).trim() : testDate;
    const effectiveEndTime = (test.extendedEndTime && String(test.extendedEndTime).trim()) ? String(test.extendedEndTime).trim() : (test.endTime || '23:59:59');
    const endDateTime = this.parseDateTime(effectiveEndDate, effectiveEndTime, true) || new Date(`${effectiveEndDate}T23:59:59`);

    // 1. 이미 통과(PASS) 또는 문제풀이 응시 완료된 경우 시간과 무관하게 무조건 '완료' (COMPLETED)
    if (test.status === 'PASS' || test.retestStatus === 'RETEST_PASS' || test.practiceResult?.passed || (test.type === 'PRACTICE' && test.practiceResult)) {
      return { status: 'COMPLETED', label: '응시 완료', canStart: false, message: '이미 응시를 완료한 시험입니다.' };
    }

    // 2. 마감이 지난 경우 (미통과 상태에서 종료 시간 초과) - 단어 테스트 포함 모든 시험에 철저히 적용
    if (now > endDateTime) {
      if (test.allowLate) {
        return { status: 'IN_PROGRESS', label: '지각 응시 허용', canStart: true, message: '' };
      }
      return {
        status: 'EXPIRED',
        label: '마감',
        canStart: false,
        message: `시험 응시 기한(${effectiveEndDate})이 지났습니다. 관리자에게 시간 연장을 요청하세요.`
      };
    }

    // 3. 문제풀이 시험(PRACTICE) 및 단어 테스트(VOCAB)는 마감 전 상시/사전 응시 가능
    if (test.type === 'PRACTICE' || test.type === 'VOCAB') {
      return {
        status: 'IN_PROGRESS',
        label: test.type === 'PRACTICE' ? '응시 가능 (하루종일 / 상시 응시)' : '응시 가능',
        canStart: true,
        message: ''
      };
    }

    // 4. 하루종일 시험은 당일 00:00부터 23:59까지 자유롭게 응시 가능
    const isAllDayExam = test.time === '00:00' || test.time === '18:00';
    const dayStartDateTime = new Date(`${testDate}T00:00:00`);
    if (isAllDayExam && now >= dayStartDateTime && now <= endDateTime) {
      return {
        status: 'IN_PROGRESS',
        label: '응시 가능 (하루종일)',
        canStart: true,
        message: ''
      };
    }

    // 5. 시험 시작 전 여부 체크 (지정 날짜 이전인 경우)
    const effectiveStartDateTime = isAllDayExam ? dayStartDateTime : startDateTime;
    if (now < effectiveStartDateTime) {
      const timeStr = isAllDayExam ? '시험 당일' : (test.time ? `${test.time}` : '시험 당일');
      return {
        status: 'NOT_STARTED',
        label: `시작 전 (${timeStr}부터 가능)`,
        canStart: false,
        message: `시험 시작 시간이 아닙니다. ${test.date} ${timeStr}부터 응시할 수 있습니다.`
      };
    }

    return {
      status: 'IN_PROGRESS',
      label: '응시 가능',
      canStart: true,
      message: ''
    };
  },

  openPracticeTestScheduleModal(testId) {
    const test = AppData.getTests().find(item => item.id === testId);
    if (!test) { this.toast('시험 정보를 찾을 수 없습니다.', 'error'); return; }

    const student = AppData.getStudentById(test.studentId);
    let questions = test.questions || [];

    const timeStatus = this.getTestTimeStatus(test);
    const result = test.practiceResult;
    const isCompleted = Boolean(test.status === 'PASS' || test.retestStatus === 'RETEST_PASS' || test.practiceResult?.passed);
    const isAllDay = !test.time || test.time === '00:00' || test.time === '18:00' || (test.endTime && test.endTime.startsWith('23:59'));
    const timeDisplay = isAllDay ? '하루종일 응시 가능 (00:00 ~ 23:59)' : (test.time ? (test.endTime ? `${test.time} ~ ${test.endTime}` : `${test.time}`) : '하루종일');
    const isAdmin = Boolean(this.state.isAdminLoggedIn);

    document.getElementById('detailModalStudentBadge').innerText = student ? `${student.name} 학생 · 문제풀이 시험` : '문제풀이 시험';
    document.getElementById('detailModalTitle').innerText = test.title;

    let actionButtonHtml = '';
    if (isAdmin) {
      actionButtonHtml = `
        <div class="space-y-3 pt-2">
          <!-- 관리자/선생님 시험 직접 시작 & 체험하기 버튼 (언제든 즉시 열기 가능) -->
          <button type="button" onclick="App.startPracticeTest('${test.id}')" class="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-black transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 cursor-pointer">
            <i class="fa-solid fa-play"></i> 문제풀이 시험 바로 열기 (체험 및 풀이)
          </button>
          <button type="button" onclick="App.viewPracticeTestResultDetail('${test.id}')" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
            <i class="fa-solid fa-file-lines"></i> 문제풀이 시험지 형태로 보기 (인쇄 및 정답·해설)
          </button>

          ${result ? `
            <div class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
              <span>학생 점수: <strong>${result.score}점 (${result.correctCount}/${result.totalCount} 정답)</strong></span>
              <span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-200 text-emerald-900">응시 완료 (PASS)</span>
            </div>

            <button type="button" onclick="App.viewPracticeTestResultDetail('${test.id}')" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-file-circle-check"></i> 학생 풀이 답안 & 정답·해설 결과 보기
            </button>
          ` : (isCompleted ? `
            <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center">
              <i class="fa-solid fa-circle-check mr-1"></i>본시험 통과 처리됨 · 완료
            </div>
          ` : `
            <div class="p-3 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold text-center">
              <i class="fa-solid fa-clock mr-1"></i>아직 학생이 시험에 응시하지 않았습니다. (위 버튼으로 직접 풀어보실 수 있습니다.)
            </div>
          `)}

          <div class="flex items-center gap-2 pt-1 border-t border-slate-100">
            <button type="button" onclick="App.openRescheduleModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs">
              <i class="fa-solid fa-calendar-days"></i> 일정 이동
            </button>
            <button type="button" onclick="App.openExtendTestModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs">
              <i class="fa-solid fa-clock-rotate-left"></i> 시간 연장
            </button>
            <button type="button" onclick="App.closeTestDetailModal(); App.openEditTestModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5">
              <i class="fa-solid fa-pen-to-square"></i> 전체 수정
            </button>
          </div>
        </div>
      `;
    } else {
      if (result) {
        actionButtonHtml = `
          <div class="space-y-2.5 pt-2">
            <div class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
              <span>내 점수: <strong>${result.score}점 (${result.correctCount}/${result.totalCount} 정답)</strong></span>
              <span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-200 text-emerald-900">응시 완료 (PASS)</span>
            </div>

            <!-- 풀이 답안 및 해설 보기 (항상 바로 확인 가능) -->
            <button type="button" onclick="App.viewPracticeTestResultDetail('${test.id}')" class="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-black transition flex items-center justify-center gap-2 shadow-md shadow-emerald-200 cursor-pointer">
              <i class="fa-solid fa-file-circle-check"></i> 나의 풀이 답안 및 정답·해설 결과 확인하기
            </button>

            <!-- 다시 풀기 (복습 연습) 지원 -->
            <button type="button" onclick="App.startPracticeTest('${test.id}', true)" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-rotate-right"></i> 다시 풀기 (복습 연습)
            </button>
          </div>
        `;
      } else if (isCompleted) {
        actionButtonHtml = `
          <div class="space-y-2.5 pt-2">
            <div class="w-full py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-center gap-2">
              <i class="fa-solid fa-circle-check"></i> 문제풀이 시험 완료
            </div>
            <button type="button" onclick="App.viewPracticeTestResultDetail('${test.id}')" class="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-file-circle-check"></i> 풀이 답안 및 정답·해설 결과 확인하기
            </button>
            <button type="button" onclick="App.startPracticeTest('${test.id}', true)" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-rotate-right"></i> 다시 풀기 (복습 연습)
            </button>
          </div>
        `;
      } else if (timeStatus.status === 'EXPIRED' && !test.allowLate) {
        actionButtonHtml = `
          <div class="space-y-2 pt-2">
            <button disabled class="w-full py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold flex items-center justify-center gap-2 cursor-not-allowed">
              <i class="fa-solid fa-clock"></i> 응시 시간이 종료되었습니다
            </button>
            <p class="text-[11px] text-center text-slate-400">지정된 시험 종료 시각(${test.endTime || test.date})이 지났습니다.</p>
          </div>
        `;
      } else {
        actionButtonHtml = `
          <div class="space-y-2 pt-2">
            <button type="button" onclick="App.viewPracticeTestResultDetail('${test.id}')" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-file-lines"></i> 출제 문항 시험지로 미리보기
            </button>
            <button type="button" onclick="App.startPracticeTest('${test.id}')" class="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-black transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 cursor-pointer">
              <i class="fa-solid fa-pencil"></i> 문제풀이 시험 시작하기
            </button>
          </div>
        `;
      }
    }

    document.getElementById('detailModalBody').innerHTML = `
      <div class="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-emerald-900"><i class="fa-solid fa-file-lines mr-1 text-emerald-600"></i>${this.escapeHtml(test.title)}</span>
          <div class="flex items-center gap-1.5">
            ${isCompleted ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">완료</span>' : ''}
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">총 ${questions.length}문항</span>
          </div>
        </div>
        <p class="text-xs text-slate-600 leading-relaxed">${this.escapeHtml(test.scope || '5지선다 객관식 문제입니다.')}</p>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <span class="text-slate-400 font-bold block mb-0.5">응시 가능 일시</span>
          <strong class="text-slate-800 font-extrabold">${test.date} (${timeDisplay})</strong>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <span class="text-slate-400 font-bold block mb-0.5">통과 커트라인</span>
          <strong class="text-slate-800 font-extrabold">${this.escapeHtml(test.cutoff || '80점 이상')}</strong>
        </div>
      </div>

      ${questions.length > 0 && isAdmin ? `
        <details class="text-xs border border-slate-200 rounded-xl p-3 bg-slate-50">
          <summary class="cursor-pointer font-bold text-slate-700 flex items-center justify-between">
            <span>출제된 문제 목록 미리보기 (${questions.length}문항)</span>
            <span class="text-[11px] text-indigo-600">열기/닫기</span>
          </summary>
          <div class="mt-2 space-y-2 pt-2 border-t border-slate-200 max-h-48 overflow-y-auto pr-1">
            ${questions.map((q, idx) => {
              const qType = q.type || 'CHOICE';
              const typeLabel = qType === 'SHORT' ? '<span class="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded mr-1">주관식</span>' : (qType === 'ESSAY' ? '<span class="text-[10px] font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded mr-1">서술형</span>' : (qType === 'MULTI_CHOICE' ? '<span class="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded mr-1">모두고르기</span>' : ''));
              const choiceLabels = ['①', '②', '③', '④', '⑤'];
              let answerText = '';
              if (qType === 'SHORT' || qType === 'ESSAY') {
                answerText = `정답/모범답안: ${this.escapeHtml(q.answer || '')}`;
              } else if (qType === 'MULTI_CHOICE') {
                const ansArr = Array.isArray(q.answer) ? q.answer : [q.answer];
                const labels = ansArr.map(n => choiceLabels[n - 1] || `${n}번`).join(', ');
                answerText = `정답(복수): ${labels}`;
              } else {
                answerText = `정답: ${q.answer}번 (${this.renderRichText(q.choices?.[q.answer - 1] || '')})`;
              }
              return `
                <div class="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] leading-snug">
                  <div>${typeLabel}<span class="font-black text-slate-800">${idx + 1}번.</span> <div class="mt-1">${this.renderRichText(q.question)}</div></div>
                  <div class="text-slate-600 mt-1.5 font-mono pt-1 border-t border-slate-100">${answerText}</div>
                </div>
              `;
            }).join('')}
          </div>
        </details>
      ` : ''}

      ${actionButtonHtml}
    `;

    this.showModal('testDetailModal');
  },

  // ========================================================
  // 4-1. 공지사항 특별 테스트 (지구과학 지질 시대 & 화석 빈칸 50제)
  // ========================================================
  getLocalSpecialScienceResults() {
    try {
      const raw = localStorage.getItem('yem_special_science_results_v1');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error(e);
      return {};
    }
  },

  getSpecialScienceResults() {
    return this.state.specialScienceResults || {};
  },

  async loadSpecialScienceResults(forceRefresh = false) {
    const studentId = Number(this.state.selectedStudentId);
    if (!studentId) return {};
    if (!forceRefresh && this.state.specialScienceResultsStudentId === studentId) {
      return this.getSpecialScienceResults();
    }

    try {
      const isFirebaseReady = await AppData.waitForFirebase(6000);
      if (!isFirebaseReady) {
        throw new Error('Firebase 연결 준비 시간이 초과되었습니다.');
      }
      let results = await AppData.getSpecialScienceResultsByStudentId(studentId);

      // 기존 단말기 전용 결과는 현재 로그인한 학생의 클라우드 기록으로 한 번만 이전한다.
      if (Object.keys(results).length === 0) {
        const localResults = this.getLocalSpecialScienceResults();
        const legacyEntries = Object.entries(localResults)
          .filter(([round, result]) => Number(round) >= 1 && Number(round) <= 5 && result);
        if (legacyEntries.length > 0) {
          const savedResults = await Promise.all(legacyEntries.map(async ([round, result]) => {
            const saved = await AppData.saveSpecialScienceResult(studentId, Number(round), result);
            return [Number(round), saved];
          }));
          results = Object.fromEntries(savedResults);
          localStorage.removeItem('yem_special_science_results_v1');
        }
      }

      this.state.specialScienceResults = results;
      this.state.specialScienceResultsStudentId = studentId;
      return results;
    } catch (error) {
      console.error('지구과학 특별 테스트 결과 클라우드 로드 실패:', error);
      this.toast('지구과학 특별 테스트 기록을 클라우드에서 불러오지 못했습니다.', 'error');
      // 다른 학생의 메모리상 결과가 노출되지 않도록 실패 시 빈 상태로 시작한다.
      this.state.specialScienceResults = {};
      this.state.specialScienceResultsStudentId = studentId;
      return {};
    }
  },

  async saveSpecialScienceResult(round, result) {
    const studentId = Number(this.state.selectedStudentId);
    const savedResult = await AppData.saveSpecialScienceResult(studentId, round, result);
    this.state.specialScienceResults = {
      ...this.getSpecialScienceResults(),
      [Number(round)]: savedResult
    };
    this.state.specialScienceResultsStudentId = studentId;
    return savedResult;
  },

  async openSpecialScienceTestModal(selectedRound = 1) {
    try {
      localStorage.removeItem('yem_special_science_results_v1');
      this.state.specialScienceResults = {};
    } catch (e) {}
    this.toast('지구과학 특별 테스트는 응시 기간(10/16)이 마감되어 시험 응시 및 결과 확인이 종료되었습니다.', 'info');
  },

  startSpecialScienceTest(round = 1, isForce = false) {
    this.toast('지구과학 특별 테스트는 응시 기간(10/16)이 마감되었습니다.', 'info');
  },

  async viewSpecialScienceResult(round = 1) {
    this.toast('지구과학 특별 테스트는 응시 기간(10/16)이 마감되어 결과 조회가 종료되었습니다.', 'info');
  },

  async togglePracticeTestAllowRetest(testId) {
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) return;
    const newVal = !test.allowRetest;
    test.allowRetest = newVal;
    try {
      await AppData.saveOrUpdateTest(test);
      this.toast(newVal ? '학생의 재시험 응시가 허용되었습니다.' : '재시험 허용이 취소되었습니다.', newVal ? 'success' : 'info');

      const detailModal = document.getElementById('testDetailModal');
      if (detailModal && !detailModal.classList.contains('hidden')) {
        this.openPracticeTestScheduleModal(testId);
      }
      if (this.state.isAdminLoggedIn) {
        this.renderAdminTestsTab();
      }
      if (this.state.selectedStudentId) {
        this.renderStudentDashboard(this.state.selectedStudentId);
      }
    } catch (err) {
      console.error(err);
      this.toast('재시험 설정 변경에 실패했습니다.', 'error');
    }
  },

  // ── 학생/선생님: 문제풀이 시험 응시 엔진 ──────────────────────────
  startPracticeTest(testId, isForce = false) {
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) { this.toast('시험 정보를 찾을 수 없습니다.', 'error'); return; }

    let questions = test.questions || [];

    if (questions.length === 0) {
      this.toast('출제된 문제를 불러올 수 없습니다.', 'error');
      return;
    }

    const isAdmin = Boolean(this.state.isAdminLoggedIn);
    const timeStatus = this.getTestTimeStatus(test);

    // 이미 응시 완료된 시험인 경우 강제 다시풀기(isForce)가 아니면 바로 결과 확인 화면으로 안내
    if (test.practiceResult && !isForce && !isAdmin) {
      this.viewPracticeTestResultDetail(testId);
      return;
    }

    // 일반 학생 최초 응시 시간 검사
    if (!isAdmin && !isForce && !test.practiceResult) {
      if (!timeStatus.canStart) {
        this.toast(timeStatus.message || '현재 응시할 수 없는 시간입니다.', 'error');
        return;
      }
    }

    // 모달 즉시 닫기 (백드롭 잔상 및 스크롤 락 즉시 해제)
    const detailModal = document.getElementById('testDetailModal');
    if (detailModal) {
      detailModal.classList.add('hidden');
    }
    this.closeTestDetailModal();
    this.closeAllModals();

    const cutoffScore = Math.min(100, Math.max(1, Number(test.practiceCutoff || test.cutoffScore || (test.cutoff ? parseInt(test.cutoff, 10) : 80) || 80)));
    this.state.practiceTest = {
      testId: test.id,
      studentId: Number(test.studentId),
      title: test.title,
      questions: questions,
      cutoffScore: cutoffScore,
      currentIndex: 0,
      answers: {},
      startedAt: new Date().toISOString(),
      isCompleted: false,
      isReviewOnly: Boolean(test.practiceResult?.passed || isAdmin || isForce)
    };

    this.showPracticeTestView();
    this.renderPracticeQuestion(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  renderSpecialScienceInlinePassage(passage, answer, questionIndex) {
    const blanks = String(passage).match(/\(\s{3,}\)/g) || [];
    const savedAnswers = blanks.length > 1
      ? String(answer || '').split(',').map(value => value.trim())
      : [String(answer || '')];
    let blankIndex = 0;

    return String(passage).split(/(\(\s{3,}\))/).map(part => {
      if (!/^\(\s{3,}\)$/.test(part)) return this.renderRichText(part);
      const value = this.escapeHtml(savedAnswers[blankIndex] || '');
      const index = blankIndex++;
      return `<input type="text" data-special-science-blank="${questionIndex}" value="${value}" aria-label="빈칸 ${index + 1} 답안" placeholder="입력" oninput="App.updateSpecialScienceInlineAnswer(${questionIndex})" class="inline-block align-middle mx-1 px-2 py-1 min-w-24 w-28 sm:w-36 rounded-md border-b-2 border-indigo-500 bg-white text-center text-sm font-black text-indigo-950 outline-none focus:ring-2 focus:ring-indigo-200" autocomplete="off" spellcheck="false">`;
    }).join('');
  },

  updateSpecialScienceInlineAnswer(questionIndex) {
    const pt = this.state.practiceTest;
    if (!pt) return;
    const inputs = [...document.querySelectorAll(`[data-special-science-blank="${questionIndex}"]`)];
    const answer = inputs.map(input => input.value.trim()).join(', ');
    this.updatePracticeTextAnswer(answer);
  },

  renderPracticeQuestion(index) {
    const pt = this.state.view === 'grammarTest' ? this.state.grammarPractice : this.state.practiceTest;
    if (!pt || !pt.questions || pt.questions.length === 0) return;

    if (index < 0) index = 0;
    if (index >= pt.questions.length) index = pt.questions.length - 1;
    pt.currentIndex = index;
    if (pt.isGrammar) this.state.grammarTest.index = index;

    const total = pt.questions.length;
    const q = pt.questions[index];
    const qType = q.type || 'CHOICE';
    const choices = q.choices || ['', '', '', '', ''];
    const currentAnswer = pt.answers[index] != null ? pt.answers[index] : '';
    const choiceLabels = ['①', '②', '③', '④', '⑤'];
    const answeredCount = Object.keys(pt.answers).filter(k => pt.answers[k] != null && (Array.isArray(pt.answers[k]) ? pt.answers[k].length > 0 : String(pt.answers[k]).trim() !== '')).length;

    document.getElementById(pt.isGrammar ? 'grammarPracticeTopInfo' : 'practiceTestTopInfo').innerHTML = `
      <div class="flex items-center justify-between gap-4 flex-wrap w-full">
        <div>
          <span class="font-bold text-slate-800 text-sm">${this.escapeHtml(pt.title)}</span>
          <span class="text-xs text-slate-500 ml-2">문항 ${index + 1} / ${total}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-500 font-semibold">커트라인: <strong>${pt.cutoffScore}점 이상</strong></span>
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5 mt-3">
        ${pt.questions.map((_, i) => {
          const isCurrent = i === index;
          const ans = pt.answers[i];
          const isAnswered = ans != null && (Array.isArray(ans) ? ans.length > 0 : String(ans).trim() !== '');
          const btnClass = isCurrent
            ? 'bg-slate-900 text-white border-slate-900 font-black ring-2 ring-slate-400'
            : isAnswered
              ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
              : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50';
          return `<button id="practiceTopBtn_${i}" onclick="App.goToPracticeQuestion(${i})" class="w-8 h-8 rounded-lg border text-xs transition ${btnClass}">${i + 1}</button>`;
        }).join('')}
      </div>
    `;

    // 문항 유형 뱃지
    const typeBadge = qType === 'CHOICE'
      ? '<span class="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">5지선다</span>'
      : (qType === 'MULTI_CHOICE'
        ? '<span class="text-[10px] font-black text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">모두 고르기 (복수 선택)</span>'
        : (qType === 'SHORT'
          ? '<span class="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">주관식 단답형</span>'
          : '<span class="text-[10px] font-black text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">서술형 영작</span>'));

    // 특별 과학 시험은 지문 안의 빈칸에 바로 답을 작성한다.
    const isInlineBlankTest = Boolean(pt.isSpecialScience && qType === 'SHORT' && q.passage && /\(\s{3,}\)/.test(q.passage));
    const inlinePassageHtml = isInlineBlankTest
      ? this.renderSpecialScienceInlinePassage(q.passage, currentAnswer, index)
      : '';

    // 답안 작성 컨트롤 (객관식 / 모두 고르기 / 단답형 / 서술형)
    let answerControlHtml = '';
    if (qType === 'CHOICE') {
      answerControlHtml = `
        <div class="space-y-2.5 pt-2">
          ${choices.map((choice, cIdx) => {
            const choiceNum = cIdx + 1;
            const isSelected = Number(currentAnswer) === choiceNum;
            return `
              <button type="button" onclick="App.selectPracticeChoice(${choiceNum})" class="w-full text-left p-3.5 rounded-xl border transition flex items-center space-x-3 ${isSelected ? 'bg-indigo-50 border-indigo-600 text-indigo-950 font-bold shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}">
                <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}">
                  ${choiceLabels[cIdx]}
                </span>
                <span class="flex-1 font-clean text-sm sm:text-[15px] leading-relaxed text-slate-900">${this.renderRichText(choice)}</span>
              </button>
            `;
          }).join('')}
        </div>
      `;
    } else if (qType === 'MULTI_CHOICE') {
      const selectedAnswers = Array.isArray(currentAnswer) ? currentAnswer : (currentAnswer ? [Number(currentAnswer)] : []);
      answerControlHtml = `
        <div class="space-y-2.5 pt-2">
          <div class="p-2.5 rounded-xl bg-teal-50/80 border border-teal-200 flex items-center justify-between text-xs text-teal-900 font-bold mb-1">
            <span class="flex items-center gap-1.5"><i class="fa-solid fa-square-check text-teal-600"></i>정답을 모두 선택하세요 (복수 선택 가능)</span>
            <span class="text-teal-700 font-black">${selectedAnswers.length}개 선택됨</span>
          </div>
          ${choices.map((choice, cIdx) => {
            const choiceNum = cIdx + 1;
            const isSelected = selectedAnswers.includes(choiceNum);
            return `
              <button type="button" onclick="App.togglePracticeStudentChoice(${choiceNum})" class="w-full text-left p-3.5 rounded-xl border transition flex items-center space-x-3 ${isSelected ? 'bg-teal-50 border-teal-600 text-teal-950 font-bold shadow-xs ring-2 ring-teal-200' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}">
                <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}">
                  ${isSelected ? '<i class="fa-solid fa-check text-xs"></i>' : choiceLabels[cIdx]}
                </span>
                <span class="flex-1 font-clean text-sm sm:text-[15px] leading-relaxed text-slate-900">${this.renderRichText(choice)}</span>
              </button>
            `;
          }).join('')}
        </div>
      `;
    } else if (qType === 'SHORT' && !isInlineBlankTest) {
      answerControlHtml = `
        <div class="pt-2 space-y-2">
          <div class="flex items-center justify-between">
            <label class="block text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <i class="fa-solid fa-i-cursor text-indigo-600"></i> 주관식 답안 입력
            </label>
            <span class="text-[11px] text-slate-400 font-medium">영문 대소문자 무관 / 철자 유의</span>
          </div>
          <div class="relative">
            <input
              type="text"
              id="practiceAnswerInput"
              value="${this.escapeHtml(currentAnswer)}"
              placeholder="답안을 입력하세요 (예: 본문에서 찾은 영어 단어/어구)"
              oninput="App.updatePracticeTextAnswer(this.value)"
              class="w-full py-3 px-4 rounded-xl border-2 border-indigo-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 text-sm font-semibold transition bg-white shadow-xs font-sans"
              style="font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif !important;"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </div>
      `;
    } else if (qType === 'ESSAY') {
      const wordsCount = String(currentAnswer).trim() ? String(currentAnswer).trim().split(/\s+/).length : 0;
      answerControlHtml = `
        <div class="pt-2 space-y-2">
          <div class="flex items-center justify-between">
            <label class="block text-xs font-bold text-violet-950 flex items-center gap-1.5">
              <i class="fa-solid fa-pen-nib text-violet-600"></i> 서술형 영작 답안 작성
            </label>
            <span id="practiceWordCountBadge" class="text-[11px] text-violet-700 bg-violet-100 px-2.5 py-0.5 rounded-full font-bold">
              ${wordsCount}단어 작성
            </span>
          </div>
          <div class="relative">
            <textarea
              id="practiceAnswerInput"
              rows="4"
              placeholder="<조건>에 맞추어 완전한 영어 문장으로 작성하세요."
              oninput="App.updatePracticeTextAnswer(this.value)"
              class="w-full p-3.5 rounded-xl border-2 border-violet-200 focus:border-violet-600 focus:ring-4 focus:ring-violet-100 text-sm font-semibold transition bg-white shadow-xs font-sans leading-relaxed"
              style="font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif !important;"
              spellcheck="false"
            >${this.escapeHtml(currentAnswer)}</textarea>
          </div>
          <p class="text-[11px] text-slate-500 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-info text-indigo-500"></i> 조건에 제시된 필수 어휘, 어형 변화, 단어 수, 구두점(마침표 등)에 유의하여 완전한 문장으로 작성하세요.
          </p>
        </div>
      `;
    }

    // 문제 뷰 본문
    document.getElementById(pt.isGrammar ? 'grammarTestContent' : 'practiceTestContent').innerHTML = `
      <div class="space-y-6 max-w-3xl mx-auto">
        <!-- Question Progress Bar -->
        ${!pt.isGrammar ? `<div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
          <div class="bg-indigo-600 h-2 rounded-full transition-all duration-300" style="width: ${Math.round(((index + 1) / total) * 100)}%"></div>
        </div>` : ''}

        <!-- Question Card -->
        <div class="glass-card rounded-2xl p-6 sm:p-8 space-y-6">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">문제 ${index + 1}</span>
              ${typeBadge}
            </div>
            <span class="text-xs text-slate-400 font-medium">${answeredCount} / ${total}문제 작성 완료</span>
          </div>

          <!-- Question Text & Structured Boxes -->
          <div class="space-y-2">
            <div class="text-base sm:text-lg font-bold text-slate-900 leading-relaxed">${this.renderRichText(q.question)}</div>
          </div>

          <!-- Passage (제시문) 있을 경우만 노출 -->
          ${q.passage && q.passage.trim() ? `
            <div class="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 leading-[2.4] font-exam">${isInlineBlankTest ? inlinePassageHtml : this.renderRichText(q.passage.trim())}</div>
          ` : ''}

          <!-- Answer Control (Choices or Text/Essay Input) -->
          ${answerControlHtml}

          <div class="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <button
              onclick="App.goToPracticeQuestion(${index - 1})"
              ${index === 0 ? 'disabled' : ''}
              class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <i class="fa-solid fa-arrow-left"></i> 이전 문제
            </button>

            ${index < total - 1 ? `
              <button
                onclick="App.goToPracticeQuestion(${index + 1})"
                class="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
              >
                다음 문제 <i class="fa-solid fa-arrow-right"></i>
              </button>
            ` : `
              <button
                onclick="App.submitPracticeTest()"
                class="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-200"
              >
                <i class="fa-solid fa-check"></i> 답안 최종 제출하기
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  },

  selectPracticeChoice(choiceNum) {
    if (this.state.view === 'grammarTest') { this.updateGrammarChoice(this.state.grammarPractice.currentIndex, choiceNum); return; }
    const pt = this.state.practiceTest;
    if (!pt) return;
    pt.answers[pt.currentIndex] = choiceNum;
    this.renderPracticeQuestion(pt.currentIndex);
  },

  togglePracticeStudentChoice(choiceNum) {
    const pt = this.state.practiceTest;
    if (!pt) return;
    let curr = pt.answers[pt.currentIndex];
    if (!Array.isArray(curr)) {
      curr = curr != null && curr !== '' ? [Number(curr)] : [];
    } else {
      curr = [...curr];
    }
    const idx = curr.indexOf(choiceNum);
    if (idx > -1) {
      curr.splice(idx, 1);
    } else {
      curr.push(choiceNum);
      curr.sort((a, b) => a - b);
    }
    pt.answers[pt.currentIndex] = curr.length > 0 ? curr : null;
    this.renderPracticeQuestion(pt.currentIndex);
  },

  updatePracticeTextAnswer(value) {
    const pt = this.state.practiceTest;
    if (!pt) return;
    const trimmed = String(value || '').trim();
    pt.answers[pt.currentIndex] = trimmed ? value : null;

    const topBtn = document.getElementById(`practiceTopBtn_${pt.currentIndex}`);
    if (topBtn) {
      if (trimmed) {
        topBtn.className = 'w-8 h-8 rounded-lg border text-xs transition bg-indigo-600 text-white border-indigo-600 font-bold ring-2 ring-slate-400';
      } else {
        topBtn.className = 'w-8 h-8 rounded-lg border text-xs transition bg-slate-900 text-white border-slate-900 font-black ring-2 ring-slate-400';
      }
    }

    const wordBadge = document.getElementById('practiceWordCountBadge');
    if (wordBadge) {
      const words = trimmed ? trimmed.split(/\s+/).length : 0;
      wordBadge.innerText = `${words}단어 작성`;
    }
  },

  goToPracticeQuestion(index) {
    this.renderPracticeQuestion(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ── 정답 정규화 및 단답형/서술형 채점 알고리즘 ────────────────────
  normalizeAnswer(str) {
    if (!str) return '';
    return String(str)
      .trim()
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/[.,;!?]+$/, '');
  },

  checkShortAnswer(studentAnswer, correctAnswer, acceptableAnswers = []) {
    if (!studentAnswer) return false;
    const normStudent = this.normalizeAnswer(studentAnswer);
    if (!normStudent) return false;

    const candidates = [
      correctAnswer,
      ...(Array.isArray(acceptableAnswers) ? acceptableAnswers : [])
    ].map(a => String(a || ''))
     .map(s => this.normalizeAnswer(s))
     .filter(Boolean);

    return candidates.some(cand => cand === normStudent);
  },

  checkEssayAnswer(studentAnswer, modelAnswer, acceptableAnswers = [], keywords = []) {
    if (!studentAnswer) return false;
    const normStudent = this.normalizeAnswer(studentAnswer);
    if (!normStudent) return false;

    const candidates = [
      modelAnswer,
      ...(Array.isArray(acceptableAnswers) ? acceptableAnswers : [])
    ].flatMap(a => String(a || '').split(/[/|\n]/))
     .map(s => this.normalizeAnswer(s))
     .filter(Boolean);

    // 1. 후보 정답과의 정규화 일치
    if (candidates.some(cand => cand === normStudent)) return true;

    // 2. 내부 문장부호 제거 후 일치 비교 (쉼표 등 부호 차이 허용)
    const stripPunct = s => s.replace(/[,;:"'?!]/g, '').replace(/\s+/g, ' ').trim();
    const strippedStudent = stripPunct(normStudent);
    if (candidates.some(cand => stripPunct(cand) === strippedStudent)) return true;

    // 3. 필수 키워드 포함 검증
    const kwList = Array.isArray(keywords) && keywords.length > 0
      ? keywords
      : (typeof keywords === 'string' && keywords.trim() ? keywords.split(/[,/]/).map(k => k.trim()).filter(Boolean) : []);

    if (kwList.length > 0) {
      const allKeywordsPresent = kwList.every(kw => normStudent.includes(this.normalizeAnswer(kw)));
      if (allKeywordsPresent) {
        const minLen = Math.min(...candidates.map(c => c.length));
        if (normStudent.length >= minLen * 0.75) {
          return true;
        }
      }
    }

    return false;
  },

  async submitPracticeTest() {
    if (this.state.view === 'grammarTest') return this.submitGrammarPractice();
    const pt = this.state.practiceTest;
    if (!pt) return;

    const total = pt.questions.length;
    const answeredCount = Object.keys(pt.answers).filter(k => pt.answers[k] != null && (Array.isArray(pt.answers[k]) ? pt.answers[k].length > 0 : String(pt.answers[k]).trim() !== '')).length;
    const unAnsweredCount = total - answeredCount;

    if (unAnsweredCount > 0) {
      if (!confirm(`아직 풀지 않은 문제가 ${unAnsweredCount}개 남아있습니다.\n그대로 시험을 제출하시겠습니까?`)) {
        return;
      }
    } else {
      if (!confirm('모든 문제를 다 푸셨습니까?\n답안을 제출하고 채점을 진행하시겠습니까?')) {
        return;
      }
    }

    // 채점 진행 (객관식, 모두 고르기, 주관식 단답형, 서술형 영작 지원)
    let correctCount = 0;
    const reviewItems = pt.questions.map((q, idx) => {
      const studentAnswer = pt.answers[idx] != null ? pt.answers[idx] : null;
      const qType = q.type || 'CHOICE';
      let isCorrect = false;

      if (qType === 'CHOICE') {
        isCorrect = Number(studentAnswer) === Number(q.answer);
      } else if (qType === 'MULTI_CHOICE') {
        const sArr = Array.isArray(studentAnswer) ? studentAnswer.map(Number).sort((a, b) => a - b) : (studentAnswer ? [Number(studentAnswer)] : []);
        const cArr = Array.isArray(q.answer) ? q.answer.map(Number).sort((a, b) => a - b) : [Number(q.answer)];
        isCorrect = sArr.length === cArr.length && sArr.every((val, i) => val === cArr[i]);
      } else if (qType === 'SHORT') {
        isCorrect = this.checkShortAnswer(studentAnswer, q.answer, q.acceptableAnswers);
      } else if (qType === 'ESSAY') {
        isCorrect = this.checkEssayAnswer(studentAnswer, q.answer, q.acceptableAnswers, q.keywords);
      }

      if (isCorrect) correctCount++;

      return {
        questionNumber: idx + 1,
        type: qType,
        question: q.question,
        passage: q.passage || '',
        choices: q.choices || [],
        studentAnswer: qType === 'MULTI_CHOICE' ? (Array.isArray(studentAnswer) ? studentAnswer.map(Number).sort((a, b) => a - b) : (studentAnswer ? [Number(studentAnswer)] : [])) : studentAnswer,
        correctAnswer: (qType === 'SHORT' || qType === 'ESSAY') ? q.answer : (qType === 'MULTI_CHOICE' ? (Array.isArray(q.answer) ? q.answer.map(Number).sort((a, b) => a - b) : [Number(q.answer)]) : Number(q.answer)),
        acceptableAnswers: q.acceptableAnswers || [],
        keywords: q.keywords || [],
        isCorrect,
        explanation: q.explanation || ''
      };
    });

    const score = Math.round((correctCount / total) * 100);
    // 유형별 문제풀이 시험은 재시험 없이 응시만 완료하면 100% 통과(PASS) 처리
    const passed = true;
    const completedAt = new Date().toISOString();

    const practiceResult = {
      studentId: pt.studentId,
      testId: pt.testId,
      score,
      correctCount,
      totalCount: total,
      passed: true,
      cutoffScore: pt.cutoffScore,
      answers: pt.answers,
      reviewItems,
      startedAt: pt.startedAt || completedAt,
      completedAt
    };

    // 특별 과학 테스트 결과는 학생·회차별 Firestore 문서에 저장
    if (pt.isSpecialScience && pt.round) {
      try {
        await this.saveSpecialScienceResult(pt.round, practiceResult);
      } catch (error) {
        console.error(error);
        this.toast('지구과학 특별 테스트 결과를 클라우드에 저장하지 못했습니다. 다시 제출해주세요.', 'error');
        return;
      }
    }

    // 시험 객체 업데이트
    const allTests = AppData.getTests();
    const test = allTests.find(t => t.id === pt.testId);
    if (test && !this.state.isAdminLoggedIn && !pt.isReviewOnly) {
      test.practiceResult = practiceResult;
      test.status = 'PASS';
      test.retestStatus = 'NONE';
      test.score = `${score}점 (${correctCount}/${total})`;
      test.allowRetest = false;
      try {
        await AppData.saveOrUpdateTest(test);
      } catch (error) {
        console.error(error);
        this.toast('결과 저장에 실패했습니다. 다시 시도해주세요.', 'error');
        return;
      }
    }

    pt.isCompleted = true;
    this.renderPracticeResult(practiceResult, test);
  },

  renderPracticeResult(result, test) {
    const reviewItems = result.reviewItems || [];
    const choiceLabels = ['①', '②', '③', '④', '⑤'];
    const pt = this.state.practiceTest || {};
    const isSpecialScience = Boolean(pt.isSpecialScience);
    const round = Number(pt.round || 1);

    document.getElementById('practiceTestTopInfo').innerHTML = `
      <span class="font-bold text-slate-800 text-sm">${this.escapeHtml(test?.title || pt.title || '문제풀이 시험')} — 시험 응시 완료</span>
    `;

    document.getElementById('practiceTestContent').innerHTML = `
      <div class="space-y-6">
        <!-- Result Summary Card -->
        <div class="glass-card rounded-2xl p-8 text-center space-y-4">
          <div class="mx-auto w-20 h-20 rounded-full flex items-center justify-center text-4xl bg-emerald-100 text-emerald-600 shadow-md shadow-emerald-100">
            <i class="fa-solid fa-circle-check"></i>
          </div>

          <div>
            <h3 class="text-2xl font-black text-emerald-700">
              ${isSpecialScience ? `지구과학 특별 시험 [제 ${round}회차] 응시 완료!` : '문제풀이 시험 응시 완료!'}
            </h3>
            <p class="text-slate-500 text-xs mt-1">답안 제출이 정상 완료되었습니다. 아래에서 문항별 정답과 오답 해설을 바로 확인하세요.</p>
          </div>

          <div class="flex items-center justify-center gap-4 pt-2">
            <div class="px-5 py-3 rounded-2xl bg-emerald-50 border border-emerald-200">
              <span class="text-[11px] text-emerald-700 font-bold block">획득 점수</span>
              <strong class="text-2xl font-black text-emerald-800">${result.score}점</strong>
            </div>
            <div class="px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200">
              <span class="text-[11px] text-slate-400 font-bold block">정답 수</span>
              <strong class="text-2xl font-black text-slate-800">${result.correctCount} / ${result.totalCount}</strong>
            </div>
          </div>

          <div class="pt-2 flex items-center justify-center flex-wrap gap-2.5">
            ${isSpecialScience ? `
              ${round < 5 ? `
                <button onclick="App.startSpecialScienceTest(${round + 1})" class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-black text-xs transition inline-flex items-center gap-2 shadow-md shadow-sky-200 cursor-pointer">
                  <span>다음 10문제 도전하기 (제 ${round + 1}회차 응시)</span>
                  <i class="fa-solid fa-arrow-right"></i>
                </button>
              ` : `
                <div class="px-4 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 font-black text-xs">
                  🏆 50문항 전 회차(1~5회) 완주 달성을 축하합니다!
                </div>
              `}
              <button onclick="App.startSpecialScienceTest(${round}, true)" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-rotate-right"></i> 다시 풀기
              </button>
              <button onclick="App.exitPracticeTest()" class="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer">
                <i class="fa-solid fa-bullhorn"></i> 공지사항으로 돌아가기
              </button>
            ` : `
              <button onclick="App.exitPracticeTest()" class="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition inline-flex items-center gap-2 shadow-sm cursor-pointer">
                <i class="fa-solid fa-arrow-left"></i> 학습 대시보드로 돌아가기
              </button>
            `}
          </div>
        </div>

        <!-- Detailed Review / Answer Key Card -->
        <div class="glass-card rounded-2xl p-6 space-y-4">
          <h4 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <i class="fa-solid fa-list-check text-indigo-600"></i>
            문항별 정답 및 오답노트 해설
          </h4>

          <div class="space-y-4">
            ${reviewItems.map((item, idx) => {
              const qType = item.type || 'CHOICE';
              const isChoice = qType === 'CHOICE';
              const isMultiChoice = qType === 'MULTI_CHOICE';

              let answerDisplayHtml = '';
              if (isChoice) {
                answerDisplayHtml = `
                  <div class="space-y-1 text-xs">
                    ${(item.choices || []).map((ch, cIdx) => {
                      const cNum = cIdx + 1;
                      const isCorrectChoice = cNum === item.correctAnswer;
                      const isStudentChoice = cNum === Number(item.studentAnswer);
                      let choiceStyle = 'bg-white text-slate-700 border-slate-200';
                      if (isCorrectChoice) choiceStyle = 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold';
                      else if (isStudentChoice && !item.isCorrect) choiceStyle = 'bg-rose-100 text-rose-900 border-rose-300 line-through';

                      return `
                        <div class="p-2 rounded-lg border flex items-center gap-2 ${choiceStyle}">
                          <span class="font-bold flex-shrink-0">${choiceLabels[cIdx]}</span>
                          <span class="flex-1 font-clean text-xs sm:text-sm leading-relaxed">${this.renderRichText(ch)}</span>
                          ${isCorrectChoice ? '<span class="text-[10px] font-black text-emerald-700">★ 정답</span>' : ''}
                          ${isStudentChoice && !item.isCorrect ? '<span class="text-[10px] font-black text-rose-600">내 오답</span>' : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
              } else if (isMultiChoice) {
                const studentAnsArr = Array.isArray(item.studentAnswer) ? item.studentAnswer.map(Number) : (item.studentAnswer != null && item.studentAnswer !== '' ? [Number(item.studentAnswer)] : []);
                const correctAnsArr = Array.isArray(item.correctAnswer) ? item.correctAnswer.map(Number) : [Number(item.correctAnswer)];
                answerDisplayHtml = `
                  <div class="space-y-1 text-xs">
                    ${(item.choices || []).map((ch, cIdx) => {
                      const cNum = cIdx + 1;
                      const isCorrectChoice = correctAnsArr.includes(cNum);
                      const isStudentChoice = studentAnsArr.includes(cNum);
                      let choiceStyle = 'bg-white text-slate-700 border-slate-200';
                      if (isCorrectChoice && isStudentChoice) {
                        choiceStyle = 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold';
                      } else if (isCorrectChoice && !isStudentChoice) {
                        choiceStyle = 'bg-teal-50 text-teal-900 border-teal-300 font-bold';
                      } else if (!isCorrectChoice && isStudentChoice) {
                        choiceStyle = 'bg-rose-100 text-rose-900 border-rose-300 line-through';
                      }

                      return `
                        <div class="p-2 rounded-lg border flex items-center gap-2 ${choiceStyle}">
                          <span class="font-bold flex-shrink-0">${choiceLabels[cIdx]}</span>
                          <span class="flex-1 font-clean text-xs sm:text-sm leading-relaxed">${this.renderRichText(ch)}</span>
                          ${isCorrectChoice ? '<span class="text-[10px] font-black text-teal-700">★ 정답</span>' : ''}
                          ${isStudentChoice ? (isCorrectChoice ? '<span class="text-[10px] font-black text-emerald-700">내 선택(정답)</span>' : '<span class="text-[10px] font-black text-rose-600">내 선택(오답)</span>') : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
              } else {
                answerDisplayHtml = `
                  <div class="space-y-2 p-3.5 rounded-xl ${item.isCorrect ? 'bg-emerald-50/70 border border-emerald-200' : 'bg-rose-50/70 border border-rose-200'}">
                    <div>
                      <div class="flex items-center justify-between text-xs mb-1">
                        <span class="font-bold text-slate-700"><i class="fa-solid fa-pencil mr-1 text-slate-500"></i>학생 작성 답안:</span>
                        <span class="font-black ${item.isCorrect ? 'text-emerald-700' : 'text-rose-600'}">${item.isCorrect ? '✓ 정답 인정' : '✗ 오답'}</span>
                      </div>
                      <div class="p-2.5 rounded-lg bg-white border border-slate-200 text-xs font-mono font-bold ${item.isCorrect ? 'text-emerald-950' : 'text-rose-950'} whitespace-pre-wrap">
                        ${item.studentAnswer && String(item.studentAnswer).trim() ? this.escapeHtml(item.studentAnswer) : '<span class="text-slate-400 font-normal italic">미작성 (빈칸 제출)</span>'}
                      </div>
                    </div>

                    <div>
                      <div class="text-xs font-bold text-indigo-900 mb-1 flex items-center gap-1">
                        <i class="fa-solid fa-star text-amber-500"></i>정답 / 모범 답안:
                      </div>
                      <div class="p-2.5 rounded-lg bg-white border border-indigo-200 text-xs font-mono font-bold text-indigo-950 whitespace-pre-wrap">
                        ${this.escapeHtml(item.correctAnswer || '')}
                      </div>
                    </div>

                    ${(item.keywords && item.keywords.length > 0) ? `
                      <div class="text-[11px] text-slate-600 pt-1">
                        <strong>채점 기준 / 필수 포함 어구:</strong> <span class="text-indigo-700 font-semibold">${Array.isArray(item.keywords) ? item.keywords.join(', ') : item.keywords}</span>
                      </div>
                    ` : ''}
                  </div>
                `;
              }

              return `
                <div class="p-4 rounded-xl border ${item.isCorrect ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'} space-y-3">
                  <div class="flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                      <span class="w-6 h-6 rounded-full ${item.isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'} text-xs font-black flex items-center justify-center">${idx + 1}</span>
                      <span class="font-bold text-xs ${item.isCorrect ? 'text-emerald-900' : 'text-rose-900'}">${item.isCorrect ? '정답' : '오답'}</span>
                      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${qType === 'SHORT' ? 'bg-indigo-100 text-indigo-800' : (qType === 'ESSAY' ? 'bg-violet-100 text-violet-800' : (qType === 'MULTI_CHOICE' ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-700'))}">
                        ${qType === 'SHORT' ? '주관식 단답형' : (qType === 'ESSAY' ? '서술형 영작' : (qType === 'MULTI_CHOICE' ? '모두 고르기 (복수정답)' : '5지선다'))}
                      </span>
                    </div>
                    <span class="text-xs font-bold ${item.isCorrect ? 'text-emerald-700' : 'text-rose-600'}">
                      ${isChoice ? (item.studentAnswer ? `선택: ${choiceLabels[item.studentAnswer - 1]} (${item.studentAnswer}번) · 정답: ${choiceLabels[item.correctAnswer - 1]} (${item.correctAnswer}번)` : `미응답 · 정답: ${choiceLabels[item.correctAnswer - 1]} (${item.correctAnswer}번)`) : (isMultiChoice ? `선택: ${(Array.isArray(item.studentAnswer) && item.studentAnswer.length > 0) ? item.studentAnswer.map(n => choiceLabels[n - 1] || `${n}번`).join(', ') : '미응답'} · 정답: ${(Array.isArray(item.correctAnswer) ? item.correctAnswer : [item.correctAnswer]).map(n => choiceLabels[n - 1] || `${n}번`).join(', ')}` : (item.isCorrect ? '채점 결과: PASS' : '채점 결과: FAIL'))}
                    </span>
                  </div>

                  <!-- 1. 문제 -->
                  <div class="text-xs sm:text-sm font-bold text-slate-900 leading-snug">${this.renderRichText(item.question)}</div>

                  <!-- 2. 제시문 (있을 때만) -->
                  ${item.passage && item.passage.trim() ? `
                    <div class="py-2.5 px-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed font-exam break-words">
                      ${this.renderRichText(item.passage)}
                    </div>
                  ` : ''}

                  <!-- 3. 답안 영역 (객관식 선지 or 주관식/서술형 카드) -->
                  ${answerDisplayHtml}

                  <!-- 4. 해설 -->
                  ${item.explanation ? `
                    <div class="p-3 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-950 space-y-1">
                      <strong class="font-bold text-indigo-700 flex items-center gap-1"><i class="fa-solid fa-lightbulb"></i> 해설:</strong>
                      <div class="text-xs text-slate-700 leading-relaxed">${this.renderRichText(item.explanation)}</div>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  },

  viewPracticeTestResultDetail(testId) {
    const test = AppData.getTests().find(t => String(t.id) === String(testId) || t.id === testId);
    if (!test) {
      this.toast('시험 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    // 본문암기 테스트인 경우 본문암기 전용 시험지 뷰어로 전달
    if (test.type === 'TEXT_MEMORIZE' || (Array.isArray(test.passageIds) && test.passageIds.length > 0) || (test.title && test.title.includes('본문'))) {
      this.viewTextMemorizeExamPaper(test.id);
      return;
    }

    this.closeAllModals();
    this.closeTestDetailModal();
    this.state.practiceTest = {
      testId: test.id,
      studentId: Number(test.studentId),
      isCompleted: true
    };
    this.showPracticeTestView();

    if (test.practiceResult) {
      this.renderPracticeResult(test.practiceResult, test);
    } else {
      let questions = test.questions || [];
      const previewResult = {
        score: test.score ? parseInt(test.score) || 0 : 0,
        totalCount: questions.length,
        correctCount: 0,
        passed: Boolean(test.status === 'PASS'),
        isPreview: true,
        items: questions.map((q, idx) => ({
          questionIndex: idx,
          question: q.question,
          passage: q.passage || '',
          type: q.type || 'CHOICE',
          choices: q.choices || [],
          correctAnswer: q.answer,
          explanation: q.explanation || '',
          studentAnswer: '',
          isCorrect: false
        }))
      };
      this.renderPracticeResult(previewResult, test);
    }
  },

  // 시험 도중 나가기 시 상태 처리
  forceFailPracticeTest() {
    const pt = this.state.practiceTest;
    if (!pt || !pt.testId || pt.isCompleted) return;
    pt.isCompleted = true;
  },

  exitPracticeTest() {
    const pt = this.state.practiceTest;
    if (pt && pt.testId && !pt.isCompleted && !pt.isReviewOnly && !this.state.isAdminLoggedIn) {
      if (!confirm('시험 진행 중입니다. 지금 나가시면 작성 중인 답안이 저장되지 않습니다.\n정말 나가시겠습니까?')) return;
    }

    const wasSpecialScience = Boolean(pt?.isSpecialScience);
    const studentId = Number(pt?.studentId || this.state.selectedStudentId || this.state.adminSelectedStudentId || 1);
    this.state.practiceTest = {
      testId: null,
      studentId: null,
      title: '',
      questions: [],
      cutoffScore: 80,
      currentIndex: 0,
      answers: {},
      startedAt: null,
      isCompleted: false
    };
    if (this.state.isStudentLoggedIn) {
      this.selectStudent(studentId);
    } else if (this.state.isAdminLoggedIn) {
      this.selectStudent(studentId);
    } else {
      if (studentId && AppData.getStudentById(studentId)) {
        this.state.isStudentLoggedIn = true;
        this.selectStudent(studentId);
      } else {
        this.showLanding();
      }
    }

    // 특별 과학 시험이었을 경우 공지사항 탭으로 복귀
    if (wasSpecialScience && typeof AcademicManager !== 'undefined' && typeof AcademicManager.switchStudentTab === 'function') {
      setTimeout(() => {
        AcademicManager.switchStudentTab('notice');
      }, 50);
    }
  },



  // ========================================================
  // 5. 관리자 대시보드 (Admin Management)
  // ========================================================
  logoutAdmin() {
    if (this.blockGrammarExit?.()) return;
    if (window.PaceAuth) return PaceAuth.logout();
    this.clearSession();
    this.state.isAdminLoggedIn = false;
    this.toast('관리자 모드를 종료했습니다.', 'info');
    this.showLanding();
  },

  switchAdminTab(tabName) {
    if (!['tests', 'students', 'vocab', 'backup'].includes(tabName)) tabName = 'tests';
    this.state.adminTab = tabName;
    // 모든 관리자 탭을 한 곳에서 토글해, 이전 카테고리 내용이 함께 남지 않게 한다.
    ['Tests', 'Assessment', 'SchoolGrade', 'TargetUniv', 'Overview', 'Students', 'Backup', 'Vocab'].forEach(t => {
      const btn = document.getElementById(`adminTabBtn${t}`);
      const content = document.getElementById(`adminTabContent${t}`);
      if (t.toLowerCase() === tabName) {
        if (btn) btn.className = 'pb-3 px-2 border-b-2 border-indigo-600 font-bold text-xs sm:text-sm text-indigo-600 flex items-center gap-2 whitespace-nowrap';
        if (content) content.classList.remove('hidden');
      } else {
        if (btn) btn.className = 'pb-3 px-2 border-b-2 border-transparent font-medium text-xs sm:text-sm text-slate-500 hover:text-slate-800 flex items-center gap-2 whitespace-nowrap';
        if (content) content.classList.add('hidden');
      }
    });

    this.renderAdminDashboard();
  },

  renderAdminDashboard() {
    if (this.state.adminTab === 'tests') {
      this.renderAdminTestsTab();
    } else if (this.state.adminTab === 'overview') {
      this.renderAdminOverviewTab();
    } else if (this.state.adminTab === 'students') {
      this.renderAdminStudentsTab();
    } else if (this.state.adminTab === 'vocab') {
      this.renderAdminVocabTab();
    }
  },


  // 관리자 탭 1: 학생별 시험 목록 & CRUD
  renderAdminExamBadge(label, tone = 'slate') {
    const tones = {
      slate: 'bg-slate-100 text-slate-600 border-slate-200',
      blue: 'bg-blue-50 text-blue-700 border-blue-200',
      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      rose: 'bg-rose-50 text-rose-700 border-rose-200',
      amber: 'bg-amber-50 text-amber-700 border-amber-200'
    };
    return `<span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold border ${tones[tone] || tones.slate}">${this.escapeHtml(label)}</span>`;
  },

  renderAdminExamAction(label, handler, icon, tone = 'indigo', disabled = false) {
    const colors = tone === 'rose' ? 'text-rose-600 hover:bg-rose-50' : 'text-indigo-600 hover:bg-indigo-50';
    return `<button type="button" onclick="${this.escapeHtml(handler)}" title="${this.escapeHtml(label)}" aria-label="${this.escapeHtml(label)}" class="p-1.5 rounded-lg ${colors} transition disabled:opacity-50" ${disabled ? 'disabled' : ''}><i class="fa-solid ${icon}" aria-hidden="true"></i></button>`;
  },

  renderAdminExamRow(test, options) {
    const e = value => this.escapeHtml(String(value ?? ''));
    const review = test.type === 'VOCAB_REVIEW';
    const types = { VOCAB: '단어', TEXT_MEMORIZE: '본문암기', PRACTICE: '문제풀이', GRAMMAR: '문법', VOCAB_REVIEW: '주간 복습' };
    const allDay = !test.time || test.time === '00:00' || test.time === '18:00';
    const time = review ? '마감 없음' : allDay ? '하루종일' : `${test.time}${test.endTime ? ` ~ ${test.endTime}` : ''}`;
    const timeStatus = review ? null : this.getTestTimeStatus(test);
    const cutoff = options.cutoff ?? test.cutoff;
    const score = options.score ?? (test.type === 'PRACTICE' ? test.practiceResult?.score : null) ?? test.score;
    return `<tr class="hover:bg-slate-50/80 transition">
      <td class="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
        <div class="flex items-center gap-1.5"><span>${e(test.date || '-')}</span>${!review && test.allowLate ? this.renderAdminExamBadge('상시', 'emerald') : timeStatus?.status === 'EXPIRED' ? this.renderAdminExamBadge('마감', 'rose') : ''}</div>
        <div class="text-[11px] font-normal text-slate-400 mt-0.5">${e(time)}</div>
        ${!review && test.extendedDate ? `<div class="text-[11px] text-amber-700 mt-0.5">~${e(test.extendedDate)} ${e(test.extendedEndTime || '23:59')} (연장)</div>` : ''}
      </td>
      <td class="py-3.5 px-4 max-w-xs">
        <button type="button" onclick="${e(options.open || `App.openTestDetailModal('${test.id}')`)}" class="font-bold text-slate-900 text-sm hover:text-indigo-600 text-left flex items-center gap-1.5">
          <span class="admin-exam-type px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 whitespace-nowrap">${e(types[test.type] || '기존 시험')}</span><span>${e(test.title || types[test.type] || '시험')}</span>
        </button>
        <div class="text-xs text-slate-500 mt-0.5">${e(options.scope ?? test.scope ?? '-')}</div>
      </td>
      <td class="py-3.5 px-4 whitespace-nowrap">
        <div class="text-xs text-slate-600">기준: <strong class="text-slate-800">${e(cutoff === '' || cutoff == null ? '-' : cutoff)}</strong></div>
        <div class="text-xs text-slate-600 mt-0.5">점수: <strong class="${score === '' || score == null ? 'text-slate-400' : 'text-indigo-600'}">${e(score === '' || score == null ? '-' : score)}</strong></div>
        ${test.type === 'VOCAB' && test.vocabQuestionCounts ? `<div class="text-[10px] text-slate-500 mt-0.5">문항: ${e(this.getVocabQuestionCountSummary(test))}</div>` : ''}
      </td>
      <td class="py-3.5 px-4 whitespace-nowrap">${options.status}</td>
      <td class="py-3.5 px-4 text-center whitespace-nowrap"><div class="admin-exam-actions flex items-center justify-center gap-1.5">${options.actions}</div></td>
    </tr>`;
  },

  renderAdminTestsTab() {
    const students = AppData.getStudents();
    const pills = document.getElementById('adminStudentPills');
    if (!students || students.length === 0) {
      if (pills) pills.innerHTML = '<p class="text-xs text-slate-400">등록된 학생이 없습니다.</p>';
      document.getElementById('adminSelectedStudentInfo').innerHTML = '';
      document.getElementById('adminTableTitle').innerText = '등록된 시험 일정 목록';
      document.getElementById('adminTestCountBadge').innerText = '총 0개';
      document.getElementById('adminTestsTableBody').innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">등록된 학생이 없습니다.</td></tr>';
      return;
    }

    let currentStudent = AppData.getStudentById(this.state.adminSelectedStudentId);
    if (!currentStudent) {
      this.state.adminSelectedStudentId = students[0].id;
      currentStudent = students[0];
    }

    // 학생 선택 필 렌더링
    pills.innerHTML = students.map(s => {
      const isSelected = s.id === this.state.adminSelectedStudentId;
      return `
        <button onclick="App.setAdminSelectedStudent(${s.id})" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
          <span class="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-[10px] text-white inline-flex"><i class="fa-solid fa-user"></i></span>
          <span>${this.escapeHtml(s.name)}</span>
        </button>
      `;
    }).join('');

    // 선택된 학생 정보 바
    const infoBar = document.getElementById('adminSelectedStudentInfo');
    infoBar.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center space-x-3">
          <div class="w-12 h-12 rounded-full bg-gradient-to-b from-slate-300 to-slate-400 text-white flex items-center justify-center text-lg shadow flex-shrink-0 border border-slate-200">
            <i class="fa-solid fa-user text-white/90"></i>
          </div>
          <div>
            <h4 class="font-extrabold text-slate-900 text-base">${this.escapeHtml(currentStudent.name)} 학생 시험 관리</h4>
            <p class="text-xs text-slate-500">목표: ${this.escapeHtml(currentStudent.target)}</p>
          </div>
        </div>
        <button onclick="App.selectStudent(${currentStudent.id})" class="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition flex items-center gap-1.5">
          <i class="fa-solid fa-eye text-indigo-600"></i>
          <span>학생 캘린더 뷰 미리보기</span>
        </button>
      </div>
    `;

    // 테이블 렌더링
    const tests = AppData.getTestsByStudentId(currentStudent.id);
    document.getElementById('adminTableTitle').innerText = `${currentStudent.name} 학생의 시험 일정 (${tests.length}건)`;
    document.getElementById('adminTestCountBadge').innerText = `총 ${tests.length}개`;

    const tbody = document.getElementById('adminTestsTableBody');
    if (tests.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-slate-400">
            등록된 시험 일정이 없습니다. 우측 상단의 '새 시험 일정 추가' 버튼을 눌러보세요!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = tests.map(test => {
      if (test.type === 'VOCAB_REVIEW') return this.renderWeeklyReviewAdminRow(test);
      if (test.type === 'GRAMMAR') return this.renderGrammarAdminRow(test);
      return this.renderAdminExamRow(test, {
        status: test.type === 'PRACTICE'
          ? this.renderAdminExamBadge(test.practiceResult || test.status === 'PASS' ? '응시 완료' : '미응시', test.practiceResult || test.status === 'PASS' ? 'emerald' : 'slate')
          : `
              <div class="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-xs">
                <button onclick="App.quickUpdateTestStatus('${test.id}', 'SCHEDULED')" class="px-2 py-1 rounded-md font-semibold transition ${test.status === 'SCHEDULED' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}">대기</button>
                <button onclick="App.quickUpdateTestStatus('${test.id}', 'PASS')" class="px-2 py-1 rounded-md font-semibold transition ${test.status === 'PASS' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}">통과</button>
                <button onclick="App.quickUpdateTestStatus('${test.id}', 'FAIL')" class="px-2 py-1 rounded-md font-semibold transition ${test.status === 'FAIL' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}">불합격</button>
              </div>
            `,
        actions: `
              ${test.type === 'PRACTICE' ? `
                ${test.practiceResult || test.status === 'PASS' ? `
                  <button type="button" onclick="App.viewPracticeTestResultDetail('${test.id}')" class="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition" title="학생 답안 및 정답·해설 결과 확인">
                    <i class="fa-solid fa-file-circle-check"></i>
                  </button>
                ` : `
                  <button type="button" onclick="App.startPracticeTest('${test.id}')" class="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition" title="문제풀이 시험 바로 열기 (체험/풀이)">
                    <i class="fa-solid fa-play"></i>
                  </button>
                `}
              ` : (test.type === 'TEXT_MEMORIZE' ? `
                <button type="button" onclick="App.viewTextMemorizeExamPaper('${test.id}')" class="p-1.5 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition" title="본문암기 시험지 형태로 보기 (인쇄 및 정답/해설)">
                  <i class="fa-solid fa-file-lines"></i>
                </button>
              ` : '')}
              <button onclick="App.openRescheduleModal('${test.id}')" class="p-1.5 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition" title="시험 일정 이동">
                <i class="fa-solid fa-calendar-days"></i>
              </button>
              <button onclick="App.openExtendTestModal('${test.id}')" class="p-1.5 rounded-lg text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition" title="마감 시간 연장">
                <i class="fa-solid fa-clock-rotate-left"></i>
              </button>
              <button onclick="App.openEditTestModal('${test.id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition" title="수정">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button onclick="App.confirmDeleteTest('${test.id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition" title="삭제">
                <i class="fa-solid fa-trash-can"></i>
              </button>
        `
      });
    }).join('');
  },

  setAdminSelectedStudent(studentId) {
    this.state.adminSelectedStudentId = Number(studentId);
    this.renderAdminTestsTab();
  },

  async renderAdminSpecialScienceResults(student) {
    // 관리자 창에서 지구과학 특별 테스트 일정 및 결과 섹션 비활성화
    const container = document.getElementById('adminSpecialScienceResults');
    if (container) container.innerHTML = '';
  },

  // 빠른 상태 업데이트
  async quickUpdateTestStatus(testId, newStatus) {
    const allTests = AppData.getTests();
    const test = allTests.find(t => t.id === testId);
    if (!test) return;

    try {
      let resetVocabResultCount = 0;

      // 대기로 되돌릴 때는 이전 결과가 새 시험에 남지 않도록 초기화한다.
      // 단어 테스트는 방향별 응시 이력도 함께 지워야 다시 처음부터 응시할 수 있다.
      if (newStatus === 'SCHEDULED') {
        if (test.type === 'VOCAB') {
          resetVocabResultCount = await AppData.deleteVocabTestResultsByTestId(testId);
        }
        test.score = '';
        test.retestStatus = 'NONE';
        test.retestDate = '';
        test.practiceResult = null;
        test.allowRetest = false;
      }

      test.status = newStatus;
      // 불합격 선택 시 재시험 대기로 자동 편의 설정
      if (newStatus === 'FAIL' && test.retestStatus === 'NONE') {
        test.retestStatus = 'RETEST_PENDING';
      } else if (newStatus === 'PASS') {
        test.retestStatus = 'NONE';
      }

      await AppData.saveOrUpdateTest(test);
      this.renderAdminTestsTab();
      const resetMessage = newStatus === 'SCHEDULED'
        ? ` 대기로 되돌리고${resetVocabResultCount > 0 ? ` 단어 응시 기록 ${resetVocabResultCount}건을` : ' 이전 결과를'} 초기화했습니다.`
        : ' 상태가 업데이트되었습니다.';
      this.toast(`'${test.title}'${resetMessage}`, 'success');
    } catch (error) {
      console.error(error);
    }
  },

  async quickUpdateRetestStatus(testId, newRetestStatus) {
    const allTests = AppData.getTests();
    const test = allTests.find(t => t.id === testId);
    if (!test) return;

    test.retestStatus = newRetestStatus;
    try {
      await AppData.saveOrUpdateTest(test);
      this.renderAdminTestsTab();
      this.toast(`'${test.title}' 재시험 상태가 업데이트되었습니다.`, 'success');
    } catch (error) {
      console.error(error);
    }
  },

  // 관리자 탭 2: 전체 학생 현황판 (Overview Matrix)
  renderAdminOverviewTab() {
    const container = document.getElementById('adminOverviewCards');
    if (!container) return;

    const students = AppData.getStudents();
    const allTests = AppData.getTests();
    const todayStr = this.getTodayDateString();

    container.innerHTML = students.map(student => {
      const tests = allTests.filter(t => t.studentId === student.id);
      const grammarStats = this.grammarStatistics(tests);
      const total = tests.filter(t => t.type !== 'GRAMMAR').length + grammarStats.total;
      const passed = tests.filter(t => t.type !== 'GRAMMAR' && (t.status === 'PASS' || t.retestStatus === 'RETEST_PASS')).length + grammarStats.passed;
      const pendingRetests = tests.filter(t => t.type !== 'GRAMMAR' && (t.retestStatus === 'RETEST_PENDING' || (t.status === 'FAIL' && t.retestStatus !== 'RETEST_PASS'))).length + grammarStats.failed;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

      const typeOrder = { 'PRACTICE': 1, 'TEXT_MEMORIZE': 2, 'REGULAR': 3, 'VOCAB': 4 };
      const upcoming = tests
        .filter(t => t.date >= todayStr && (t.type === 'GRAMMAR' ? t.grammarStage !== 'done' : t.status === 'SCHEDULED'))
        .sort((a, b) => {
          const dateDiff = new Date(a.date) - new Date(b.date);
          if (dateDiff !== 0) return dateDiff;
          const ordA = typeOrder[a.type] || 5;
          const ordB = typeOrder[b.type] || 5;
          return ordA - ordB;
        })[0];

      return `
        <div class="glass-card rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="w-12 h-12 rounded-full bg-gradient-to-b from-slate-300 to-slate-400 text-white flex items-center justify-center text-lg shadow flex-shrink-0 border border-slate-200">
                  <i class="fa-solid fa-user text-white/90"></i>
                </div>
                <div>
                  <h4 class="font-extrabold text-slate-900">${this.escapeHtml(student.name)}</h4>
                  <span class="text-xs font-medium text-slate-400">학생 #${student.id}</span>
                </div>
              </div>
              <span class="text-sm font-black px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700">${passRate}%</span>
            </div>

            <!-- Stats Mini Grid -->
            <div class="grid grid-cols-3 gap-2 mt-4 text-center">
              <div class="p-2 rounded-xl bg-slate-50">
                <span class="text-[11px] text-slate-400 block">전체${grammarStats.total ? ' (문법 영역별)' : ''}</span>
                <span class="text-xs font-bold text-slate-800">${total}회</span>
              </div>
              <div class="p-2 rounded-xl bg-emerald-50">
                <span class="text-[11px] text-emerald-600 block">통과</span>
                <span class="text-xs font-bold text-emerald-700">${passed}회</span>
              </div>
              <div class="p-2 rounded-xl bg-amber-50">
                <span class="text-[11px] text-amber-600 block">재시험</span>
                <span class="text-xs font-bold text-amber-700">${pendingRetests}건</span>
              </div>
            </div>

            <!-- Next Schedule -->
            <div class="mt-4 pt-3 border-t border-slate-100 text-xs">
              <span class="text-slate-400 block text-[11px]">다음 일정</span>
              ${upcoming ? `
                <div class="font-bold text-slate-800 mt-0.5 truncate">${this.escapeHtml(upcoming.title)}</div>
                <div class="text-slate-500 text-[11px]">${upcoming.date} (${this.calculateDDay(upcoming.date)})</div>
              ` : `
                <div class="text-slate-400 mt-0.5">예정된 시험 없음</div>
              `}
            </div>
          </div>

          <div class="flex items-center gap-2 pt-2">
            <button onclick="App.setAdminSelectedStudent(${student.id}); App.switchAdminTab('tests');" class="w-full py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition">
              시험 관리하기
            </button>
            <button onclick="App.selectStudent(${student.id})" class="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition" title="학생 캘린더 이동">
              <i class="fa-regular fa-calendar"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  // 관리자 탭 3: 학생 프로필 정보 수정
  renderAdminStudentsTab() {
    const container = document.getElementById('adminStudentsEditGrid');
    if (!container) return;

    const students = AppData.getStudents();
    container.innerHTML = `
      ${students.map(student => {
      return `
        <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-b from-slate-300 to-slate-400 text-white flex items-center justify-center text-sm shadow-sm flex-shrink-0 border border-slate-200">
              <i class="fa-solid fa-user text-white/90"></i>
            </div>
            <div>
              <span class="text-xs font-bold text-indigo-600">학생 #${student.id}</span>
              <h4 class="font-bold text-slate-900">${this.escapeHtml(student.name)}</h4>
            </div>
          </div>

          <div class="space-y-2 text-xs">
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">학생 이름</label>
              <input type="text" id="editStudentName_${student.id}" value="${this.escapeHtml(student.name)}" class="w-full py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white" />
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">학습 목표</label>
              <input type="text" id="editStudentTarget_${student.id}" value="${this.escapeHtml(student.target)}" class="w-full py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white" />
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">사용 권한</label>
              <select id="editStudentAccessMode_${student.id}" class="w-full py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="FULL" ${student.accessMode === 'CALENDAR_ONLY' ? '' : 'selected'}>전체 기능 사용</option>
                <option value="CALENDAR_ONLY" ${student.accessMode === 'CALENDAR_ONLY' ? 'selected' : ''}>영어 학습 캘린더만 사용</option>
              </select>
            </div>
          </div>

          <div class="pt-2 flex items-center justify-between gap-3">
            <button onclick="App.confirmDeleteStudentProfile(${student.id})" class="px-3 py-2 rounded-xl text-rose-600 border border-rose-200 bg-white font-bold text-xs hover:bg-rose-50 transition">
              <i class="fa-solid fa-trash-can mr-1"></i>삭제
            </button>
            <button onclick="App.handleSaveStudentProfile(${student.id})" class="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition shadow-sm">
              프로필 저장
            </button>
          </div>
        </div>
      `;
      }).join('')}
    `;
  },

  async handleSaveStudentProfile(studentId) {
    const name = document.getElementById(`editStudentName_${studentId}`).value.trim();
    const target = document.getElementById(`editStudentTarget_${studentId}`).value.trim();
    const accessMode = document.getElementById(`editStudentAccessMode_${studentId}`).value;
    if (!name) { this.toast('학생 이름을 입력해주세요.', 'error'); return; }

    try {
      await AppData.updateStudent({ id: studentId, name, target, accessMode });
      this.toast(`학생 #${studentId} 프로필이 저장되었습니다.`, 'success');
    } catch (error) {
      console.error(error);
      this.toast('학생 프로필 저장에 실패했습니다.', 'error');
    }
  },

  async confirmDeleteStudentProfile(studentId) {
    const student = AppData.getStudentById(studentId);
    if (!student) return;
    if (!confirm(`'${student.name}' 학생 계정을 삭제할까요?\n해당 학생의 시험 일정, 응시 결과와 학업관리 기록도 함께 삭제되며 되돌릴 수 없습니다.`)) return;

    try {
      await AppData.deleteStudent(studentId);
      const remainingStudents = AppData.getStudents();
      this.state.adminSelectedStudentId = remainingStudents[0]?.id || null;
      this.toast(`${student.name} 학생 계정과 관련 기록이 삭제되었습니다.`, 'info');
      this.renderAdminStudentsTab();
    } catch (error) {
      console.error(error);
      this.toast('학생 계정 삭제에 실패했습니다.', 'error');
    }
  },

  // ========================================================
  // 6. 시험 등록 / 수정 모달 (Test Form Modal)
  // ========================================================
  renderStudentCheckboxes(selectedStudentIds = []) {
    const grid = document.getElementById('formStudentCheckboxGrid');
    if (!grid) return;

    const students = AppData.getStudents();
    const allBtn = document.getElementById('formStudentSelectAllBtn');
    if (allBtn) {
      allBtn.innerHTML = `<i class="fa-solid fa-check-double mr-1"></i>전체 선택 (${students.length}명)`;
    }

    if (!students || students.length === 0) {
      grid.innerHTML = `<p class="col-span-full text-xs text-slate-400 text-center py-3">등록된 학생이 없습니다.</p>`;
      this.updateFormStudentSelectCount();
      return;
    }

    const normalizedSelectedIds = (Array.isArray(selectedStudentIds) ? selectedStudentIds : [selectedStudentIds])
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0);

    grid.innerHTML = students.map(s => {
      const isChecked = normalizedSelectedIds.includes(Number(s.id));
      return `
        <label class="flex items-center space-x-2 p-2.5 rounded-xl border transition cursor-pointer select-none ${isChecked ? 'bg-indigo-50 border-indigo-500 text-indigo-950 font-bold' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}">
          <input type="checkbox" name="formStudentCheckbox" value="${s.id}" ${isChecked ? 'checked' : ''} onchange="App.onFormStudentCheckboxChange()" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer" />
          <div class="w-6 h-6 rounded-full bg-gradient-to-b from-slate-300 to-slate-400 text-white flex items-center justify-center text-[10px] flex-shrink-0">
            <i class="fa-solid fa-user"></i>
          </div>
          <span class="text-xs font-bold truncate">${this.escapeHtml(s.name)}</span>
        </label>
      `;
    }).join('');
    this.updateFormStudentSelectCount();
  },

  onFormStudentCheckboxChange() {
    this.updateFormStudentSelectCount();
    const checkboxes = document.querySelectorAll('input[name="formStudentCheckbox"]');
    checkboxes.forEach(cb => {
      const label = cb.closest('label');
      if (!label) return;
      if (cb.checked) {
        label.className = 'flex items-center space-x-2 p-2.5 rounded-xl border transition cursor-pointer select-none bg-indigo-50 border-indigo-500 text-indigo-950 font-bold';
      } else {
        label.className = 'flex items-center space-x-2 p-2.5 rounded-xl border transition cursor-pointer select-none bg-white border-slate-200 text-slate-700 hover:bg-slate-50';
      }
    });
  },

  updateFormStudentSelectCount() {
    const countEl = document.getElementById('formStudentSelectCount');
    if (!countEl) return;
    const selectedCount = document.querySelectorAll('input[name="formStudentCheckbox"]:checked').length;
    countEl.innerText = `${selectedCount}명 선택됨`;
  },

  toggleAllFormStudents(select) {
    const checkboxes = document.querySelectorAll('input[name="formStudentCheckbox"]');
    checkboxes.forEach(cb => {
      cb.checked = select;
    });
    this.onFormStudentCheckboxChange();
  },

  openAddTestModal() {
    document.getElementById('adminFormModalTitle').innerText = '새 시험 일정 등록';
    document.getElementById('formTestId').value = '';

    // 다중 선택 모드 활성화 (체크박스 그리드 노출)
    const selectAllActions = document.getElementById('formStudentSelectAllActions');
    const checkboxGrid = document.getElementById('formStudentCheckboxGrid');
    if (selectAllActions) selectAllActions.classList.remove('hidden');
    if (checkboxGrid) checkboxGrid.classList.remove('hidden');

    // 처음엔 모두 해제 상태로 시작
    this.renderStudentCheckboxes([]);

    // 기본 폼 값 초기화
    document.getElementById('formTitle').value = '';
    document.getElementById('formDate').value = this.getTodayDateString();
    document.getElementById('formTime').value = '18:00';
    document.getElementById('formEndTime').value = '19:00';
    document.getElementById('formScope').value = '';
    document.getElementById('formCutoff').value = '90점 이상';
    if (document.getElementById('formVocabCutoff_2')) document.getElementById('formVocabCutoff_2').value = '80';
    if (document.getElementById('formVocabCutoff_3')) document.getElementById('formVocabCutoff_3').value = '80';
    if (document.getElementById('formVocabCutoff_4')) document.getElementById('formVocabCutoff_4').value = '80';
    if (document.getElementById('formVocabCutoff_5')) document.getElementById('formVocabCutoff_5').value = '80';
    if (document.getElementById('formVocabQuestionCount_2')) document.getElementById('formVocabQuestionCount_2').value = '';
    if (document.getElementById('formVocabQuestionCount_3')) document.getElementById('formVocabQuestionCount_3').value = '';
    if (document.getElementById('formVocabQuestionCount_4')) document.getElementById('formVocabQuestionCount_4').value = '';
    if (document.getElementById('formVocabQuestionCount_5')) document.getElementById('formVocabQuestionCount_5').value = '';
    if (document.getElementById('formIsEnglishDefTest')) document.getElementById('formIsEnglishDefTest').checked = false;
    this.onEnglishDefTestToggle();
    document.getElementById('formPracticeCutoff').value = '80';
    if (document.getElementById('formTextMemorizeDescriptiveOnly')) {
      document.getElementById('formTextMemorizeDescriptiveOnly').checked = false;
    }
    document.getElementById('formScore').value = '';
    document.getElementById('formRetestDate').value = '';
    document.getElementById('formTeacherNote').value = '';
    this.renderFormVocabSetSelect('', '');
    this.initPracticeQuestionsForm([]);
    this.renderTextMemorizePassages('YBM(박준언) 공통영어 2', []);

    // 라디오 버튼 초기화
    document.querySelector('input[name="formStatus"][value="SCHEDULED"]').checked = true;
    document.querySelector('input[name="formRetestStatus"][value="NONE"]').checked = true;
    document.querySelector('input[name="formTestType"][value="VOCAB"]').checked = true;
    this.initUnifiedGrammarForm();
    this.toggleTestFormType();

    this.showModal('adminTestFormModal');
  },

  openEditTestModal(testId) {
    const allTests = AppData.getTests();
    const test = allTests.find(t => t.id === testId);
    if (test?.type === 'VOCAB_REVIEW') { this.openWeeklyReviewModal(testId); return; }
    if (test?.type === 'GRAMMAR') { this.openGrammarAssignmentModal(testId); return; }
    if (!test) {
      this.toast('수정할 시험을 찾을 수 없습니다.', 'error');
      return;
    }

    // 모달 제목 & hidden 필드
    document.getElementById('adminFormModalTitle').innerText = '시험 일정 및 성적 수정';
    document.getElementById('formTestId').value = test.id;

    // 체크박스 섹션 항상 표시
    const selectAllActions = document.getElementById('formStudentSelectAllActions');
    const checkboxGrid = document.getElementById('formStudentCheckboxGrid');
    if (selectAllActions) selectAllActions.classList.remove('hidden');
    if (checkboxGrid) checkboxGrid.classList.remove('hidden');

    // 이 시험과 같은 제목+날짜+타입(또는 단어세트)을 가진 모든 학생의 시험을 자동 탐색 → 복수 체크
    const testSetIds = Array.isArray(test.vocabSetIds) && test.vocabSetIds.length > 0 ? test.vocabSetIds : (test.vocabSetId ? [test.vocabSetId] : []);
    const relatedTests = allTests.filter(t => {
      if (test.type === 'VOCAB') {
        const tSetIds = Array.isArray(t.vocabSetIds) && t.vocabSetIds.length > 0 ? t.vocabSetIds : (t.vocabSetId ? [t.vocabSetId] : []);
        const isSameSet = (testSetIds.length > 0 && tSetIds.length > 0 && testSetIds.slice().sort().join(',') === tSetIds.slice().sort().join(',')) ||
                          (test.vocabSetId && t.vocabSetId === test.vocabSetId);
        return t.type === 'VOCAB' && isSameSet && t.date === test.date;
      }
      if (test.type === 'PRACTICE') {
        return t.type === 'PRACTICE' && t.title === test.title && t.date === test.date;
      }
      if (test.type === 'TEXT_MEMORIZE') {
        return t.type === 'TEXT_MEMORIZE' && t.title === test.title && t.date === test.date;
      }
      // REGULAR
      return (t.type === 'REGULAR' || !t.type) && t.title === test.title && t.date === test.date;
    });

    const preselectedIds = relatedTests.length > 0
      ? [...new Set(relatedTests.map(t => Number(t.studentId)))]
      : [Number(test.studentId)];

    // 체크박스 렌더링 (복수 선택)
    this.renderStudentCheckboxes(preselectedIds);

    // 폼 필드 채우기
    document.getElementById('formTitle').value = test.title || '';
    document.getElementById('formDate').value = test.date || '';
    document.getElementById('formTime').value = test.time || '';
    document.getElementById('formEndTime').value = test.endTime || '';
    document.getElementById('formScope').value = test.scope || '';
    document.getElementById('formCutoff').value = test.cutoff || '';
    if (document.getElementById('formVocabCutoff_2')) document.getElementById('formVocabCutoff_2').value = this.getBaseVocabCutoffScore(test, 2);
    if (document.getElementById('formVocabCutoff_3')) document.getElementById('formVocabCutoff_3').value = this.getBaseVocabCutoffScore(test, 3);
    if (document.getElementById('formVocabCutoff_4')) document.getElementById('formVocabCutoff_4').value = this.getBaseVocabCutoffScore(test, 4);
    if (document.getElementById('formVocabCutoff_5')) document.getElementById('formVocabCutoff_5').value = this.getBaseVocabCutoffScore(test, 5);
    const testQC = test.vocabQuestionCounts || {};
    if (document.getElementById('formVocabQuestionCount_2')) document.getElementById('formVocabQuestionCount_2').value = testQC[2] ?? test.vocabQuestionCount_2 ?? '';
    if (document.getElementById('formVocabQuestionCount_3')) document.getElementById('formVocabQuestionCount_3').value = testQC[3] ?? test.vocabQuestionCount_3 ?? '';
    if (document.getElementById('formVocabQuestionCount_4')) document.getElementById('formVocabQuestionCount_4').value = testQC[4] ?? test.vocabQuestionCount_4 ?? '';
    if (document.getElementById('formVocabQuestionCount_5')) document.getElementById('formVocabQuestionCount_5').value = testQC[5] ?? test.vocabQuestionCount_5 ?? '';
    if (document.getElementById('formIsEnglishDefTest')) {
      document.getElementById('formIsEnglishDefTest').checked = Boolean(test.isEnglishDefTest);
    }
    this.onEnglishDefTestToggle();
    document.getElementById('formPracticeCutoff').value = test.cutoffScore || test.practiceCutoff || 80;
    if (document.getElementById('formTextMemorizeCutoff')) {
      document.getElementById('formTextMemorizeCutoff').value = test.textMemorizeCutoff || test.cutoffScore || 80;
    }
    if (document.getElementById('formTextMemorizeMaxWrong')) {
      document.getElementById('formTextMemorizeMaxWrong').value = test.textMemorizeMaxWrong ?? 3;
    }
    const cutoffType = test.textMemorizeCutoffType || 'SCORE';
    this.toggleTextMemorizeCutoffType(cutoffType);

    const tmMode = test.textMemorizeMode || 'CLOZE';
    const tmModeRadio = document.querySelector(`input[name="formTextMemorizeMode"][value="${tmMode}"]`);
    if (tmModeRadio) tmModeRadio.checked = true;

    if (document.getElementById('formTextMemorizeDescriptiveOnly')) {
      document.getElementById('formTextMemorizeDescriptiveOnly').checked = Boolean(test.textMemorizeDescriptiveOnly);
    }

    document.getElementById('formScore').value = test.score || '';
    document.getElementById('formRetestDate').value = test.retestDate || '';
    document.getElementById('formTeacherNote').value = test.teacherNote || '';
    this.renderFormVocabSetSelect(testSetIds[0] || '', testSetIds[1] || '');
    this.initPracticeQuestionsForm(test.questions || []);

    // 본문 암기 범위 체크박스 복원
    const passageBook = test.passageBook || 'YBM(박준언) 공통영어 2';
    const bookSelect = document.getElementById('formTextMemorizeBookSelect');
    if (bookSelect) bookSelect.value = passageBook;
    this.renderTextMemorizePassages(passageBook, test.passageIds || []);

    // 라디오 버튼 설정
    const statusVal = test.status || 'SCHEDULED';
    const retestVal = test.retestStatus || 'NONE';
    const typeVal = ['VOCAB', 'PRACTICE', 'TEXT_MEMORIZE'].includes(test.type) ? test.type : 'REGULAR';

    const statusRadio = document.querySelector(`input[name="formStatus"][value="${statusVal}"]`);
    if (statusRadio) statusRadio.checked = true;
    const retestRadio = document.querySelector(`input[name="formRetestStatus"][value="${retestVal}"]`);
    if (retestRadio) retestRadio.checked = true;
    const typeRadio = document.querySelector(`input[name="formTestType"][value="${typeVal}"]`);
    if (typeRadio) typeRadio.checked = true;

    this.toggleTestFormType();
    this.showModal('adminTestFormModal');
  },

  renderFormVocabSetSelect(selectedSetId = '', selectedSetId2 = '') {
    const select1 = document.getElementById('formVocabSetId');
    const select2 = document.getElementById('formVocabSetId2');
    if (!select1) return;
    const sets = AppData.getVocabSets();

    // 교재(폴더)별 그룹화
    const booksMap = {};
    sets.forEach(set => {
      const bookName = (set.book || '기본 단어장').trim();
      if (!booksMap[bookName]) booksMap[bookName] = [];
      booksMap[bookName].push(set);
    });

    let options1Html = '<option value="">단어 테스트 미연결</option>';
    let options2Html = '<option value="">(선택 안 함 - 1개 세트만 출제)</option>';

    Object.keys(booksMap).forEach(bookName => {
      // 자연어 숫자 정렬 (Day 01, Day 02, ... Day 10 ...)
      const bookSets = booksMap[bookName].slice().sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      const optgroupLabel = `📁 ${this.escapeHtml(bookName)} (${bookSets.length}개 세트)`;

      options1Html += `<optgroup label="${optgroupLabel}">`;
      options2Html += `<optgroup label="${optgroupLabel}">`;

      bookSets.forEach(set => {
        const wordCount = (set.words || []).length;
        const optText = `${this.escapeHtml(set.title)} (${wordCount}단어)`;
        options1Html += `<option value="${set.id}" ${set.id === selectedSetId ? 'selected' : ''}>${optText}</option>`;
        options2Html += `<option value="${set.id}" ${set.id === selectedSetId2 ? 'selected' : ''}>${optText}</option>`;
      });

      options1Html += `</optgroup>`;
      options2Html += `</optgroup>`;
    });

    select1.innerHTML = options1Html;
    if (select2) select2.innerHTML = options2Html;

    this.onVocabSetSelectionChange();
  },

  onVocabSetSelectionChange() {
    const select1 = document.getElementById('formVocabSetId');
    const select2 = document.getElementById('formVocabSetId2');
    if (!select1) return;

    const id1 = select1.value;
    const id2 = select2 ? select2.value : '';
    const allSets = AppData.getVocabSets();

    const selectedIds = [id1, id2].filter(Boolean);
    const uniqueIds = [...new Set(selectedIds)];
    const matchingSets = uniqueIds.map(id => allSets.find(s => s.id === id)).filter(Boolean);

    const badgeEl = document.getElementById('formVocabSummaryBadge');
    const totalWordsEl = document.getElementById('formVocabTotalWordsCount');
    const listTextEl = document.getElementById('formVocabSelectedListText');

    if (matchingSets.length === 0) {
      if (badgeEl) badgeEl.innerText = '단어 세트 미선택';
      if (totalWordsEl) totalWordsEl.innerText = '0단어';
      if (listTextEl) listTextEl.innerText = '선택된 단어 세트가 없습니다.';
    } else {
      const totalWords = matchingSets.reduce((sum, s) => sum + (s.words?.length || 0), 0);
      const setTitles = matchingSets.map(s => s.title).join(' + ');
      const bookName = matchingSets[0]?.book || '기본 단어장';
      const isRandom40 = totalWords > 40;

      if (badgeEl) badgeEl.innerText = `${matchingSets.length}개 세트 연결됨`;
      if (totalWordsEl) totalWordsEl.innerText = isRandom40 ? `총 ${totalWords}단어 중 40단어 랜덤 출제` : `총 ${totalWords}단어 출제`;
      if (listTextEl) {
        listTextEl.innerHTML = matchingSets.map(s =>
          `<span class="inline-flex items-center gap-1 bg-violet-100/80 text-violet-900 px-2 py-0.5 rounded-md font-bold text-[11px] mr-1 mb-0.5 border border-violet-200">
            <i class="fa-solid fa-file-lines text-[10px] text-violet-600"></i> ${this.escapeHtml(s.title)} (${(s.words || []).length}단어)
          </span>`
        ).join('');
      }

      // 출제 범위 및 시험 제목 자동 안내
      const testType = document.querySelector('input[name="formTestType"]:checked')?.value;
      if (testType === 'VOCAB') {
        const formTitle = document.getElementById('formTitle');
        const formScope = document.getElementById('formScope');
        const rawTitle = bookName && bookName !== '기본 단어장' ? `[${bookName}] ${setTitles}` : `${setTitles}`;
        const combinedTitle = this.formatCleanVocabTitle(rawTitle);
        const wordsText = isRandom40 ? `(총 ${totalWords}단어 / 40단어 랜덤 출제)` : `(총 ${totalWords}단어)`;
        const combinedScope = bookName && bookName !== '기본 단어장' ? `[${bookName}] ${matchingSets.map(s => s.title).join(', ')} ${wordsText}` : `${matchingSets.map(s => s.title).join(', ')} ${wordsText}`;

        if (formTitle && (!formTitle.value || formTitle.value === '단어 테스트' || formTitle.value.includes('단어 테스트') || formTitle.value.includes('워드마스터'))) {
          formTitle.value = combinedTitle;
        }
        if (formScope) {
          formScope.value = combinedScope;
        }
      }
    }

    // 영영풀이 데이터 포함 여부에 따른 옵션 체크박스 노출 및 상태 갱신
    const hasDefEn = matchingSets.some(s => Array.isArray(s.words) && s.words.some(w => w.defEn && w.defEn.trim().length > 0));
    const engDefOptionContainer = document.getElementById('formEnglishDefOptionContainer');
    const isEngDefCheckbox = document.getElementById('formIsEnglishDefTest');
    if (engDefOptionContainer) {
      if (hasDefEn) {
        engDefOptionContainer.classList.remove('hidden');
      } else {
        engDefOptionContainer.classList.add('hidden');
        if (isEngDefCheckbox) isEngDefCheckbox.checked = false;
      }
    }
    this.onEnglishDefTestToggle();
  },

  onEnglishDefTestToggle() {
    const isEngDefCheckbox = document.getElementById('formIsEnglishDefTest');
    const isChecked = isEngDefCheckbox ? isEngDefCheckbox.checked : false;

    const card2 = document.getElementById('formVocabCutoffCard_2');
    const card3 = document.getElementById('formVocabCutoffCard_3');
    const card4 = document.getElementById('formVocabCutoffCard_4');
    const card5 = document.getElementById('formVocabCutoffCard_5');
    const cutoffSectionLabel = document.getElementById('formVocabCutoffSectionLabel');
    const cutoffGrid = document.getElementById('formVocabCutoffGrid');

    if (isChecked) {
      if (card2) card2.classList.add('hidden');
      if (card3) card3.classList.add('hidden');
      if (card4) card4.classList.add('hidden');
      if (card5) card5.classList.remove('hidden');
      if (cutoffGrid) {
        cutoffGrid.classList.remove('sm:grid-cols-3');
        cutoffGrid.classList.add('sm:grid-cols-1');
      }
      if (cutoffSectionLabel) {
        cutoffSectionLabel.innerHTML = '<i class="fa-solid fa-graduation-cap mr-1 text-teal-600"></i>영영풀이 통과 커트라인 & 출제 문항 수 설정 <span class="text-rose-500">*</span>';
      }

      const formTitle = document.getElementById('formTitle');
      if (formTitle && formTitle.value && !formTitle.value.includes('(영영풀이)')) {
        formTitle.value = formTitle.value.trim() + ' (영영풀이)';
      }
    } else {
      if (card2) card2.classList.remove('hidden');
      if (card3) card3.classList.remove('hidden');
      if (card4) card4.classList.remove('hidden');
      if (card5) card5.classList.add('hidden');
      if (cutoffGrid) {
        cutoffGrid.classList.add('sm:grid-cols-3');
        cutoffGrid.classList.remove('sm:grid-cols-1');
      }
      if (cutoffSectionLabel) {
        cutoffSectionLabel.innerHTML = '<i class="fa-solid fa-sliders mr-1 text-violet-600"></i>유형별 통과 커트라인 & 출제 문항 수 설정 <span class="text-rose-500">*</span>';
      }

      const formTitle = document.getElementById('formTitle');
      if (formTitle && formTitle.value && formTitle.value.includes('(영영풀이)')) {
        formTitle.value = formTitle.value.replace(/\s*\(영영풀이\)/g, '').trim();
      }
    }
  },

  autoSelectNextVocabDay() {
    const select1 = document.getElementById('formVocabSetId');
    const select2 = document.getElementById('formVocabSetId2');
    if (!select1 || !select2) return;

    const allSets = AppData.getVocabSets();
    if (allSets.length === 0) {
      this.toast('등록된 단어 세트가 없습니다.', 'warning');
      return;
    }

    let id1 = select1.value;

    // 만약 1번째 세트가 선택되어 있지 않다면 첫 번째 세트와 두 번째 세트를 기본 선택
    if (!id1) {
      const firstBook = (allSets[0].book || '기본 단어장').trim();
      const firstBookSets = allSets.filter(s => (s.book || '기본 단어장').trim() === firstBook).sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      select1.value = firstBookSets[0].id;
      id1 = select1.value;
      if (firstBookSets.length >= 2) {
        select2.value = firstBookSets[1].id;
        this.onVocabSetSelectionChange();
        this.toast(`'${firstBookSets[0].title}' + '${firstBookSets[1].title}' 2개 세트가 자동 지정되었습니다!`, 'success');
        return;
      }
    }

    const currentSet = allSets.find(s => s.id === id1);
    if (!currentSet) return;

    const book = (currentSet.book || '기본 단어장').trim();
    const bookSets = allSets.filter(s => (s.book || '기본 단어장').trim() === book).sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
    );
    const currentIndex = bookSets.findIndex(s => s.id === id1);

    if (currentIndex >= 0 && currentIndex < bookSets.length - 1) {
      const nextSet = bookSets[currentIndex + 1];
      select2.value = nextSet.id;
      this.onVocabSetSelectionChange();
      this.toast(`2번째 세트로 '${nextSet.title}'이(가) 자동 선택되었습니다!`, 'success');
    } else {
      this.toast(`'${book}' 교재의 마지막 세트입니다. 다음 Day가 없습니다.`, 'info');
    }
  },

  openVocabSetFromTestForm() {
    this.state.vocabSetReturnToTestForm = true;
    this.openVocabSetModal(null, true);
  },

  toggleTextMemorizeCutoffType(type) {
    const isScore = type === 'SCORE';
    const btnScore = document.getElementById('btnCutoffTypeScore');
    const btnWrong = document.getElementById('btnCutoffTypeWrong');
    const wrapScore = document.getElementById('formTmCutoffScoreWrap');
    const wrapWrong = document.getElementById('formTmCutoffWrongWrap');
    const hiddenType = document.getElementById('formTextMemorizeCutoffType');

    if (hiddenType) hiddenType.value = type;

    if (btnScore && btnWrong) {
      if (isScore) {
        btnScore.className = 'px-2.5 py-1 rounded-md text-xs font-bold transition bg-indigo-600 text-white shadow-2xs';
        btnWrong.className = 'px-2.5 py-1 rounded-md text-xs font-bold transition text-slate-600 hover:bg-slate-100';
      } else {
        btnWrong.className = 'px-2.5 py-1 rounded-md text-xs font-bold transition bg-indigo-600 text-white shadow-2xs';
        btnScore.className = 'px-2.5 py-1 rounded-md text-xs font-bold transition text-slate-600 hover:bg-slate-100';
      }
    }

    if (wrapScore) wrapScore.classList.toggle('hidden', !isScore);
    if (wrapWrong) wrapWrong.classList.toggle('hidden', isScore);
  },

  onTextMemorizeModeChange() {
    const mode = document.querySelector('input[name="formTextMemorizeMode"]:checked')?.value || 'CLOZE';
    const labelCloze = document.getElementById('labelTmModeCloze');
    const labelFull = document.getElementById('labelTmModeFull');

    if (labelCloze && labelFull) {
      if (mode === 'CLOZE') {
        labelCloze.className = 'flex items-center justify-center p-2 rounded-lg border border-indigo-300 bg-indigo-50/80 cursor-pointer text-xs font-bold text-indigo-950';
        labelFull.className = 'flex items-center justify-center p-2 rounded-lg border border-slate-200 bg-white cursor-pointer text-xs font-bold text-slate-700 hover:bg-slate-50';
      } else {
        labelFull.className = 'flex items-center justify-center p-2 rounded-lg border border-indigo-300 bg-indigo-50/80 cursor-pointer text-xs font-bold text-indigo-950';
        labelCloze.className = 'flex items-center justify-center p-2 rounded-lg border border-slate-200 bg-white cursor-pointer text-xs font-bold text-slate-700 hover:bg-slate-50';
      }
    }
  },

  toggleTestFormType() {
    const testType = document.querySelector('input[name="formTestType"]:checked')?.value || 'VOCAB';
    const isGrammar = testType === 'GRAMMAR';
    // Existing non-grammar records cannot be converted into a new grammar assignment.
    document.querySelector('.test-type-options input[value="GRAMMAR"]').disabled = Boolean(document.getElementById('formTestId').value);
    document.getElementById('formGrammarSection').classList.toggle('hidden', !isGrammar);
    document.getElementById('formStudentSection').classList.toggle('hidden', isGrammar);
    if (isGrammar) this.renderGrammarAssignmentParts(true);
    const isVocab = testType === 'VOCAB';
    const isPractice = testType === 'PRACTICE';
    const isTextMemorize = testType === 'TEXT_MEMORIZE';
    const isRegular = testType === 'REGULAR';

    document.querySelectorAll('.form-regular-only').forEach(element => element.classList.toggle('hidden', !isRegular));
    document.getElementById('formTeacherNoteSection').classList.toggle('hidden', !isRegular && !isGrammar);
    document.querySelectorAll('.form-regular-or-practice').forEach(element => element.classList.toggle('hidden', isVocab || isTextMemorize || isGrammar));
    document.querySelectorAll('.form-time-applicable').forEach(element => element.classList.remove('hidden'));

    // 본문 암기 및 단어 테스트는 제목 입력창 숨김 및 자동 고정
    const formTitleSection = document.getElementById('formTitleSection');
    if (formTitleSection) {
      formTitleSection.classList.toggle('hidden', isVocab || isTextMemorize || isGrammar);
    }

    document.getElementById('formVocabSetSection').classList.toggle('hidden', !isVocab);
    document.getElementById('formVocabCutoffSection').classList.toggle('hidden', !isVocab);
    document.getElementById('formPracticeCutoffSection').classList.toggle('hidden', !isPractice);
    document.getElementById('formPracticeSection').classList.toggle('hidden', !isPractice);
    document.getElementById('formTextMemorizeSection').classList.toggle('hidden', !isTextMemorize);
    document.getElementById('formTextMemorizeCutoffSection').classList.toggle('hidden', !isTextMemorize);

    const title = document.getElementById('formTitle');
    if (title) {
      if (isGrammar) {
        title.required = false;
      } else if (isTextMemorize) {
        title.value = '본문암기 테스트';
        title.required = false;
      } else if (isVocab) {
        title.value = '단어 테스트';
        title.required = false;
      } else {
        title.required = true;
        if (title.value === '본문암기 테스트' || title.value === '본문 암기 테스트' || title.value === '단어 테스트') {
          title.value = '';
        }
      }
    }

    if (isTextMemorize) {
      const bookVal = document.getElementById('formTextMemorizeBookSelect')?.value || 'YBM(박준언) 공통영어 2';
      const currentSelected = Array.from(document.querySelectorAll('input[name="formPassageCheckbox"]:checked')).map(cb => cb.value);
      this.renderTextMemorizePassages(bookVal, currentSelected);
      this.onTextMemorizeModeChange();
    }

    const regularCutoff = document.getElementById('formCutoff');
    const practiceCutoff = document.getElementById('formPracticeCutoff');

    if (regularCutoff) regularCutoff.required = isRegular;
    if (practiceCutoff) practiceCutoff.required = isPractice;
  },

  initPracticeQuestionsForm(questions = []) {
    this.state.editingPracticeQuestions = Array.isArray(questions) && questions.length > 0
      ? JSON.parse(JSON.stringify(questions))
      : [];
    if (this.state.editingPracticeQuestions.length === 0) {
      this.addPracticeQuestionRow();
    } else {
      this.renderPracticeQuestionsForm();
    }
  },

  addPracticeQuestionRow(data = null) {
    const newQuestion = data || {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: 'CHOICE',
      question: '',
      passage: '',
      choices: ['', '', '', '', ''],
      answer: 1,
      acceptableAnswers: [],
      keywords: [],
      explanation: ''
    };
    if (!newQuestion.type) newQuestion.type = 'CHOICE';
    this.state.editingPracticeQuestions.push(newQuestion);
    this.renderPracticeQuestionsForm();
  },

  updatePracticeQuestionType(qIndex, newType) {
    const q = this.state.editingPracticeQuestions[qIndex];
    if (!q) return;
    q.type = newType;
    if (newType === 'CHOICE') {
      if (!Array.isArray(q.choices) || q.choices.length !== 5) {
        q.choices = ['', '', '', '', ''];
      }
      if (Array.isArray(q.answer)) {
        q.answer = q.answer[0] || 1;
      } else if (typeof q.answer !== 'number' || q.answer < 1 || q.answer > 5) {
        q.answer = 1;
      }
    } else if (newType === 'MULTI_CHOICE') {
      if (!Array.isArray(q.choices) || q.choices.length !== 5) {
        q.choices = ['', '', '', '', ''];
      }
      if (!Array.isArray(q.answer)) {
        q.answer = typeof q.answer === 'number' ? [q.answer] : [1];
      }
    } else {
      if (typeof q.answer === 'number' || Array.isArray(q.answer)) {
        q.answer = '';
      }
    }
    this.renderPracticeQuestionsForm();
  },

  togglePracticeChoiceAnswer(qIndex, choiceNum) {
    const q = this.state.editingPracticeQuestions[qIndex];
    if (!q) return;
    if (!Array.isArray(q.answer)) {
      q.answer = typeof q.answer === 'number' ? [q.answer] : [];
    } else {
      q.answer = [...q.answer];
    }
    const idx = q.answer.indexOf(choiceNum);
    if (idx > -1) {
      q.answer.splice(idx, 1);
    } else {
      q.answer.push(choiceNum);
      q.answer.sort((a, b) => a - b);
    }
    this.renderPracticeQuestionsForm();
  },

  updatePracticeQuestionKeywords(qIndex, value) {
    const q = this.state.editingPracticeQuestions[qIndex];
    if (!q) return;
    q.keywords = String(value || '').split(',').map(k => k.trim()).filter(Boolean);
  },

  removePracticeQuestionRow(index) {
    if (this.state.editingPracticeQuestions.length <= 1) {
      this.toast('문제풀이 시험은 최소 1개 이상의 문제가 필요합니다.', 'info');
      return;
    }
    this.state.editingPracticeQuestions.splice(index, 1);
    this.renderPracticeQuestionsForm();
  },

  updatePracticeQuestionField(qIndex, field, value) {
    const q = this.state.editingPracticeQuestions[qIndex];
    if (!q) return;
    q[field] = value;
  },

  updatePracticeChoice(qIndex, choiceIndex, value) {
    const q = this.state.editingPracticeQuestions[qIndex];
    if (!q) return;
    if (!Array.isArray(q.choices)) q.choices = ['', '', '', '', ''];
    q.choices[choiceIndex] = value;
  },

  updatePracticeAnswer(qIndex, answerNumber) {
    const q = this.state.editingPracticeQuestions[qIndex];
    if (!q) return;
    q.answer = Number(answerNumber);
    this.renderPracticeQuestionsForm();
  },

  // ── 서식 파서 및 텍스트 편집 툴바 헬퍼 ────────────────────────
  renderRichText(text) {
    if (!text) return '';
    let trimmed = String(text).trim();
    // 0. <보 기> 등 공백 태그 정규화
    trimmed = trimmed.replace(/&lt;\s*보\s*기\s*&gt;/g, '<보기>');
    trimmed = trimmed.replace(/<\s*보\s*기\s*>/g, '<보기>');
    trimmed = trimmed.replace(/&lt;\s*영영\s*풀이\s*&gt;/g, '<영영풀이>');
    trimmed = trimmed.replace(/<\s*영영\s*풀이\s*>/g, '<영영풀이>');
    trimmed = trimmed.replace(/&lt;\s*조\s*건\s*&gt;/g, '<조건>');
    trimmed = trimmed.replace(/<\s*조\s*건\s*>/g, '<조건>');
    trimmed = trimmed.replace(/&lt;\s*우리\s*말\s*&gt;/g, '<우리말>');
    trimmed = trimmed.replace(/<\s*우리\s*말\s*>/g, '<우리말>');

    // <보기>, <조건>, <우리말>, <영영풀이> 등 독립 섹션 블록 추출
    const blockRegex = /(?:^|\n)\s*(?:&lt;|<)(보기|조건|우리말|영영 풀이|영영풀이|도움말)(?:&gt;|>)\s*\n([\s\S]*?)(?=(?:\n\s*(?:&lt;|<)(?:보기|조건|우리말|영영 풀이|영영풀이|도움말)(?:&gt;|>))|$)/gi;

    const blocks = [];
    trimmed = trimmed.replace(blockRegex, (match, tag, content) => {
      let normalizedTag = tag.trim().replace(/\s+/g, '');
      const idx = blocks.length;
      blocks.push({ tag: normalizedTag, content: content.trim() });
      return `\n%%RICH_BLOCK_${idx}%%\n`;
    });

    let escaped = this.escapeHtml(trimmed);

    // 1. 긴 빈칸 밑줄 렌더링: 4개 이상의 연속된 _ 또는 [ (A) _____ ]
    escaped = escaped.replace(/\[\s*\((A|B|C|\d+)\)\s*_{4,}\s*\]/g, '<span class="inline-flex items-baseline gap-1 font-bold text-slate-900 font-serif">[ ($1) <span class="inline-block border-b-2 border-slate-900 min-w-[220px] sm:min-w-[320px] mx-2 align-baseline"></span> ]</span>');
    escaped = escaped.replace(/_{4,}/g, '<span class="inline-block border-b-2 border-slate-900 min-w-[180px] sm:min-w-[260px] mx-2 align-baseline"></span>');

    // 2. 가로 구분선: ---...---
    escaped = escaped.replace(/(?:^|<br>)\s*-{3,}\s*(?:<br>|$)/g, '<hr class="my-3 border-slate-300">');

    // 3. 볼드: **text**
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong class="font-black text-slate-950">$1</strong>');
    // 4. 밑줄: __text__ → 보라색 절대 없는 진회색/검정 인쇄용 밑줄 (인라인 스타일 강제)
    escaped = escaped.replace(/__(.+?)__/g, '<u class="underline text-slate-900" style="text-decoration: underline !important; text-decoration-color: #0f172a !important; text-underline-offset: 3px !important; text-decoration-thickness: 1.5px !important;">$1</u>');
    // 5. 이탤릭: *text* (단, **는 제외)
    escaped = escaped.replace(/(?<!\*)\*(?!\*)([^\*\n]+?)(?<!\*)\*(?!\*)/g, '<em class="italic text-slate-800">$1</em>');
    // 6. 형광펜: ==text==
    escaped = escaped.replace(/==(.+?)==/g, '<mark class="bg-amber-200/90 text-amber-950 px-1 py-0.5 rounded font-medium">$1</mark>');
    // 7. 줄바꿈 지원
    escaped = escaped.replace(/\n/g, '<br>');

    // 8. 플레이스홀더를 심플하고 예쁜 전용 카드 박스로 복원
    blocks.forEach((block, idx) => {
      const rawContent = block.content;
      let contentHtml = this.escapeHtml(rawContent);
      contentHtml = contentHtml.replace(/\*\*(.+?)\*\*/g, '<strong class="font-black text-slate-950">$1</strong>');
      contentHtml = contentHtml.replace(/__(.+?)__/g, '<u class="underline text-slate-900" style="text-decoration: underline !important; text-decoration-color: #0f172a !important; text-underline-offset: 3px !important; text-decoration-thickness: 1.5px !important;">$1</u>');
      contentHtml = contentHtml.replace(/(?<!\*)\*(?!\*)([^\*\n]+?)(?<!\*)\*(?!\*)/g, '<em class="italic text-slate-800">$1</em>');

      let boxHtml = '';
      if (block.tag === '보기') {
        let innerContent = '';
        if (/\([A-C]\)/.test(rawContent)) {
          const parts = rawContent.split(/(\([A-C]\))/g).filter(Boolean);
          let itemsHtml = '';
          for (let i = 0; i < parts.length; i++) {
            if (/^\([A-C]\)$/.test(parts[i].trim())) {
              const label = parts[i].trim();
              const text = parts[i + 1] ? parts[i + 1].trim() : '';
              i++;
              itemsHtml += `
                <div class="flex items-start gap-2.5 py-1.5 font-exam text-xs sm:text-sm text-slate-900 leading-relaxed">
                  <span class="font-bold text-slate-950 font-serif text-sm sm:text-base tracking-tight flex-shrink-0">${label}</span>
                  <div class="flex-1 font-exam text-slate-900 leading-relaxed">${this.escapeHtml(text)}</div>
                </div>
              `;
            } else if (parts[i].trim()) {
              itemsHtml += `<div class="text-xs text-slate-700 mb-1 font-exam">${this.escapeHtml(parts[i].trim())}</div>`;
            }
          }
          innerContent = `<div class="space-y-1 divide-y divide-slate-200/60">${itemsHtml}</div>`;
        } else if (rawContent.includes('/')) {
          const words = rawContent.split('/').map(w => w.trim()).filter(Boolean);
          const chips = words.map(w => `
            <span class="inline-flex items-center px-2.5 py-1 m-0.5 rounded-md bg-white border border-slate-200 text-slate-900 font-exam text-xs sm:text-sm font-medium shadow-2xs">${this.escapeHtml(w)}</span>
          `).join('');
          innerContent = `<div class="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-100/70 border border-slate-200/80 font-exam">${chips}</div>`;
        } else {
          innerContent = `<div class="text-xs sm:text-sm text-slate-900 leading-relaxed font-exam pl-0.5">${contentHtml.replace(/\n/g, '<br>')}</div>`;
        }

        boxHtml = `
          <div class="my-3 p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 font-exam">
            <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-200 text-slate-800 text-[11px] font-bold mb-2 font-sans">
              <i class="fa-solid fa-layer-group text-slate-500"></i> 보기
            </div>
            ${innerContent}
          </div>
        `;
      } else if (block.tag === '조건') {
        const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean);
        const conditionItems = lines.map(line => `
          <div class="flex items-start gap-2 text-xs sm:text-sm text-slate-800 font-sans leading-relaxed">
            <i class="fa-solid fa-check text-amber-600 text-xs mt-1 flex-shrink-0"></i>
            <span>${this.escapeHtml(line)}</span>
          </div>
        `).join('');

        boxHtml = `
          <div class="my-3 p-3.5 sm:p-4 rounded-xl bg-amber-50/50 border border-amber-200/80">
            <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-bold mb-2">
              <i class="fa-solid fa-list-check text-amber-600"></i> 조건
            </div>
            <div class="space-y-1.5">
              ${conditionItems}
            </div>
          </div>
        `;
      } else if (block.tag === '우리말' || block.tag === '해석') {
        boxHtml = `
          <div class="my-3 p-3.5 sm:p-4 rounded-xl bg-indigo-50/50 border border-indigo-200/80">
            <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-900 text-[11px] font-bold mb-2">
              <i class="fa-solid fa-language text-indigo-600"></i> 우리말
            </div>
            <div class="text-xs sm:text-sm font-semibold text-slate-900 leading-relaxed font-sans pl-0.5">
              ${contentHtml.replace(/\n/g, '<br>')}
            </div>
          </div>
        `;
      } else if (block.tag.includes('영영')) {
        // 영어 정의문만 깔끔하게 추출 (한글 번역/해설 및 단어추론힌트 등 제거)
        let cleanEng = rawContent
          .replace(/단어\s*(?:추론|찾기)?\s*힌트/gi, '')
          .replace(/\([가-힣\s,.;·~!?]+\)/g, '')
          .replace(/\[[가-힣\s,.;·~!?]+\]/g, '')
          .split('\n')
          .map(l => l.trim())
          .filter(l => l && !/^[가-힣\s,.;·~!?]+$/.test(l))
          .join(' ')
          .trim();
        if (!cleanEng) cleanEng = rawContent;

        boxHtml = `
          <div class="my-3 p-3.5 sm:p-4 rounded-xl bg-sky-50/50 border border-sky-200/80">
            <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-100 text-sky-900 text-[11px] font-bold mb-2 font-sans">
              <i class="fa-solid fa-book text-sky-600"></i> 영영풀이
            </div>
            <div class="text-xs sm:text-sm font-medium text-slate-900 leading-relaxed font-sans pl-0.5">
              ${this.escapeHtml(cleanEng)}
            </div>
          </div>
        `;
      } else {
        boxHtml = `
          <div class="my-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div class="inline-flex items-center gap-1.5 font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded text-[11px] mb-2">
              <i class="fa-solid fa-circle-info text-slate-500"></i> ${this.escapeHtml(block.tag)}
            </div>
            <div class="text-xs sm:text-sm text-slate-800 pl-0.5 leading-relaxed font-sans">${contentHtml.replace(/\n/g, '<br>')}</div>
          </div>
        `;
      }

      const placeholderPattern = new RegExp(`(?:<br>)?%%RICH_BLOCK_${idx}%%(?:<br>)?`, 'g');
      escaped = escaped.replace(placeholderPattern, boxHtml.trim());
    });

    return escaped;
  },

  renderTextFormatToolbar(qIndex, field) {
    return `
      <div class="flex items-center gap-1 mb-1.5 flex-wrap">
        <span class="text-[10px] font-bold text-slate-400 mr-1 flex items-center gap-1"><i class="fa-solid fa-pen-nib"></i> 서식:</span>
        <button type="button" onmousedown="event.preventDefault(); App.applyFormatToField(${qIndex}, '${field}', 'bold')" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black border border-slate-200 transition active:scale-95" title="굵게 (**굵은글씨**)">
          <strong class="font-black">B</strong> 굵게
        </button>
        <button type="button" onmousedown="event.preventDefault(); App.applyFormatToField(${qIndex}, '${field}', 'underline')" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold border border-slate-200 transition active:scale-95" title="밑줄 (__밑줄__)">
          <u class="underline decoration-1">U</u> 밑줄
        </button>
        <button type="button" onmousedown="event.preventDefault(); App.applyFormatToField(${qIndex}, '${field}', 'italic')" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold border border-slate-200 transition active:scale-95" title="기울임 (*기울임*)">
          <em class="italic">I</em> 기울임
        </button>
        <button type="button" onmousedown="event.preventDefault(); App.applyFormatToField(${qIndex}, '${field}', 'blank')" class="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 transition active:scale-95" title="빈칸 밑줄 만들기">
          <span class="font-mono tracking-tight font-bold">________</span> 빈칸
        </button>
        <button type="button" onmousedown="event.preventDefault(); App.applyFormatToField(${qIndex}, '${field}', 'highlight')" class="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-200 transition active:scale-95" title="형광펜 강조 (==강조==)">
          <i class="fa-solid fa-highlighter text-[10px]"></i> 형광펜
        </button>
      </div>
    `;
  },

  applyFormatToField(qIndex, field, formatType) {
    const inputEl = document.getElementById(`practice_${field}_${qIndex}`);
    if (!inputEl) return;

    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    const val = inputEl.value || '';
    const selected = val.substring(start, end);

    let before = '', after = '', insertText = '';
    switch (formatType) {
      case 'bold':
        before = '**';
        after = '**';
        insertText = selected || '굵은글씨';
        break;
      case 'underline':
        before = '__';
        after = '__';
        insertText = selected || '밑줄';
        break;
      case 'italic':
        before = '*';
        after = '*';
        insertText = selected || '기울임';
        break;
      case 'blank':
        before = '';
        after = '';
        insertText = selected ? `(${selected})` : '(          )';
        break;
      case 'highlight':
        before = '==';
        after = '==';
        insertText = selected || '강조';
        break;
    }

    const newVal = val.substring(0, start) + before + insertText + after + val.substring(end);
    inputEl.value = newVal;
    this.updatePracticeQuestionField(qIndex, field, newVal);

    // 커서 위치 재설정 & 포커스 유지
    inputEl.focus();
    if (selected) {
      inputEl.setSelectionRange(start + before.length, start + before.length + insertText.length);
    } else {
      inputEl.setSelectionRange(start + before.length, start + before.length + insertText.length);
    }
  },

  renderPracticeQuestionsForm() {
    const container = document.getElementById('formPracticeQuestionsList');
    const badge = document.getElementById('formPracticeQuestionCountBadge');
    if (!container) return;

    const questions = this.state.editingPracticeQuestions;
    if (badge) badge.innerText = `${questions.length}문항`;

    container.innerHTML = questions.map((q, qIndex) => {
      const qType = q.type || 'CHOICE';
      const choices = Array.isArray(q.choices) && q.choices.length === 5 ? q.choices : ['', '', '', '', ''];
      const qAnswer = Number(q.answer) || 1;

      return `
        <div class="p-4 rounded-xl border border-emerald-200 bg-white shadow-xs space-y-3">
          <div class="flex items-center justify-between gap-2 border-b border-emerald-100 pb-2.5 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center">${qIndex + 1}</span>
              <span class="text-xs font-bold text-slate-800">문제 ${qIndex + 1}</span>
            </div>

            <!-- 문제 유형 선택 (5지선다 / 모두고르기 / 단답형 / 서술형) -->
            <div class="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button type="button" onclick="App.updatePracticeQuestionType(${qIndex}, 'CHOICE')" class="px-2.5 py-1 rounded-md font-bold transition ${qType === 'CHOICE' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}">
                <i class="fa-solid fa-list-ol mr-1"></i>5지선다
              </button>
              <button type="button" onclick="App.updatePracticeQuestionType(${qIndex}, 'MULTI_CHOICE')" class="px-2.5 py-1 rounded-md font-bold transition ${qType === 'MULTI_CHOICE' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}">
                <i class="fa-solid fa-square-check mr-1"></i>모두고르기
              </button>
              <button type="button" onclick="App.updatePracticeQuestionType(${qIndex}, 'SHORT')" class="px-2.5 py-1 rounded-md font-bold transition ${qType === 'SHORT' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}">
                <i class="fa-solid fa-i-cursor mr-1"></i>주관식(단답)
              </button>
              <button type="button" onclick="App.updatePracticeQuestionType(${qIndex}, 'ESSAY')" class="px-2.5 py-1 rounded-md font-bold transition ${qType === 'ESSAY' ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}">
                <i class="fa-solid fa-pen-nib mr-1"></i>서술형(영작)
              </button>
            </div>

            <button type="button" onclick="App.removePracticeQuestionRow(${qIndex})" class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition text-xs flex items-center gap-1">
              <i class="fa-solid fa-trash-can"></i> 문제 삭제
            </button>
          </div>

          <!-- 문제 질문 (Question) -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-[11px] font-bold text-slate-700">문제 질문 <span class="text-rose-500">*</span></label>
              <span class="text-[10px] text-slate-400 font-medium">드래그 후 서식 버튼 클릭 가능</span>
            </div>
            ${this.renderTextFormatToolbar(qIndex, 'question')}
            <textarea id="practice_question_${qIndex}" rows="2" placeholder="예: 다음 글의 밑줄 친 우리말 뜻에 맞게 조건에 따라 영작하시오." oninput="App.updatePracticeQuestionField(${qIndex}, 'question', this.value)" class="w-full py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs font-semibold leading-relaxed">${this.escapeHtml(q.question || '')}</textarea>
          </div>

          <!-- 지문 / 본문 (선택) -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-[11px] font-bold text-slate-600">지문 / 제시문 (선택사항)</label>
              <span class="text-[10px] text-slate-400 font-medium">지문이 없는 문항은 비워두세요</span>
            </div>
            ${this.renderTextFormatToolbar(qIndex, 'passage')}
            <textarea id="practice_passage_${qIndex}" rows="3" placeholder="예: In 1990, she **was born** in London. She wanted to __study__ math." oninput="App.updatePracticeQuestionField(${qIndex}, 'passage', this.value)" class="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-xs bg-slate-50 font-mono leading-relaxed">${this.escapeHtml(q.passage || '')}</textarea>
          </div>

          <!-- 정답 및 보기 입력 영역 (유형별) -->
          ${qType === 'CHOICE' ? `
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-[11px] font-bold text-slate-700">5지선다 보기 입력 & 정답 체크 <span class="text-rose-500">*</span></label>
                <span class="text-[10px] text-emerald-700 font-semibold">정답인 번호의 라디오를 선택하세요</span>
              </div>
              <div class="space-y-1.5">
                ${choices.map((choice, cIndex) => {
                  const choiceNum = cIndex + 1;
                  const isCorrect = qAnswer === choiceNum;
                  const choiceLabels = ['①', '②', '③', '④', '⑤'];
                  return `
                    <div class="flex items-center gap-2 p-1.5 rounded-lg border transition ${isCorrect ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 bg-white'}">
                      <label class="flex items-center gap-1.5 cursor-pointer flex-shrink-0 px-1">
                        <input type="radio" name="practiceAnswer_${qIndex}" value="${choiceNum}" ${isCorrect ? 'checked' : ''} onchange="App.updatePracticeAnswer(${qIndex}, ${choiceNum})" class="text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer" />
                        <span class="text-xs font-bold ${isCorrect ? 'text-emerald-800' : 'text-slate-600'}">${choiceLabels[cIndex]} 정답</span>
                      </label>
                      <input type="text" placeholder="${choiceNum}번 보기 입력 (서식 지원: **굵게**, __밑줄__)" value="${this.escapeHtml(choice || '')}" oninput="App.updatePracticeChoice(${qIndex}, ${cIndex}, this.value)" class="flex-1 py-1.5 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-emerald-500 text-xs bg-white" />
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : (qType === 'MULTI_CHOICE' ? `
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-[11px] font-bold text-teal-900">모두 고르기 보기 입력 & 정답 다중 체크 <span class="text-rose-500">*</span></label>
                <span class="text-[10px] text-teal-700 font-semibold">정답에 해당하는 번호의 체크박스를 모두 선택하세요</span>
              </div>
              <div class="space-y-1.5">
                ${choices.map((choice, cIndex) => {
                  const choiceNum = cIndex + 1;
                  const ansArr = Array.isArray(q.answer) ? q.answer : [q.answer];
                  const isCorrect = ansArr.includes(choiceNum);
                  const choiceLabels = ['①', '②', '③', '④', '⑤'];
                  return `
                    <div class="flex items-center gap-2 p-1.5 rounded-lg border transition ${isCorrect ? 'border-teal-500 bg-teal-50/60' : 'border-slate-200 bg-white'}">
                      <label class="flex items-center gap-1.5 cursor-pointer flex-shrink-0 px-1">
                        <input type="checkbox" name="practiceAnswer_${qIndex}_${choiceNum}" value="${choiceNum}" ${isCorrect ? 'checked' : ''} onchange="App.togglePracticeChoiceAnswer(${qIndex}, ${choiceNum})" class="text-teal-600 focus:ring-teal-500 w-3.5 h-3.5 rounded cursor-pointer" />
                        <span class="text-xs font-bold ${isCorrect ? 'text-teal-800' : 'text-slate-600'}">${choiceLabels[cIndex]} 정답</span>
                      </label>
                      <input type="text" placeholder="${choiceNum}번 보기 입력 (서식 지원: **굵게**, __밑줄__)" value="${this.escapeHtml(choice || '')}" oninput="App.updatePracticeChoice(${qIndex}, ${cIndex}, this.value)" class="flex-1 py-1.5 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-teal-500 text-xs bg-white" />
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : (qType === 'SHORT' ? `
            <div class="space-y-1.5 p-3 rounded-xl bg-indigo-50/60 border border-indigo-200">
              <div class="flex items-center justify-between">
                <label class="block text-[11px] font-bold text-indigo-950 flex items-center gap-1.5">
                  <i class="fa-solid fa-i-cursor text-indigo-600"></i> 주관식 단답형 정답 <span class="text-rose-500">*</span>
                </label>
                <span class="text-[10px] text-indigo-600 font-medium">복수 인정 답안은 슬래시(/)나 쉼표(,)로 구분</span>
              </div>
              <input
                type="text"
                placeholder="예: deliberate / intentional (대소문자 무관 자동 채점)"
                value="${this.escapeHtml(q.answer || '')}"
                oninput="App.updatePracticeQuestionField(${qIndex}, 'answer', this.value)"
                class="w-full py-2 px-3 rounded-xl border border-indigo-300 focus:ring-2 focus:ring-indigo-500 text-xs bg-white font-mono font-bold"
              />
            </div>
          ` : `
            <div class="space-y-2.5 p-3 rounded-xl bg-violet-50/60 border border-violet-200">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-[11px] font-bold text-violet-950 flex items-center gap-1.5">
                    <i class="fa-solid fa-pen-nib text-violet-600"></i> 서술형 모범 답안 <span class="text-rose-500">*</span>
                  </label>
                  <span class="text-[10px] text-violet-600 font-medium">복수 인정 문장은 슬래시(/)로 구분</span>
                </div>
                <textarea
                  rows="2"
                  placeholder="예: Gina was embarrassed by the fact that she had spread the fake news."
                  oninput="App.updatePracticeQuestionField(${qIndex}, 'answer', this.value)"
                  class="w-full py-2 px-3 rounded-xl border border-violet-300 focus:ring-2 focus:ring-violet-500 text-xs bg-white font-mono font-bold leading-relaxed"
                >${this.escapeHtml(q.answer || '')}</textarea>
              </div>
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-[11px] font-bold text-slate-700">채점 기준 및 필수 포함 어구 (선택사항)</label>
                  <span class="text-[10px] text-slate-400">쉼표(,)로 구분</span>
                </div>
                <input
                  type="text"
                  placeholder="예: was embarrassed, by the fact that, had spread"
                  value="${Array.isArray(q.keywords) ? this.escapeHtml(q.keywords.join(', ')) : this.escapeHtml(q.keywords || '')}"
                  oninput="App.updatePracticeQuestionKeywords(${qIndex}, this.value)"
                  class="w-full py-1.5 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 text-xs bg-white"
                />
              </div>
            </div>
          `))}

          <!-- 해설 / 오답노트 코멘트 -->
          <div>
            <label class="block text-[11px] font-bold text-slate-600 mb-1">문제 해설 / 풀이 팁 (선택사항)</label>
            <textarea rows="2" placeholder="예: 관계대명사 뒤에는 불완전한 절이 와야 하므로 that이 적절합니다." oninput="App.updatePracticeQuestionField(${qIndex}, 'explanation', this.value)" class="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-xs bg-slate-50 leading-relaxed">${this.escapeHtml(q.explanation || '')}</textarea>
          </div>
        </div>
      `;
    }).join('');
  },

  closeAdminTestFormModal() {
    this.hideModal('adminTestFormModal');
  },

  async handleSaveTestForm(e) {
    e.preventDefault();

    const id = document.getElementById('formTestId').value.trim();
    const testType = document.querySelector('input[name="formTestType"]:checked')?.value || 'VOCAB';
    if (testType === 'GRAMMAR') { await this.saveUnifiedGrammarAssignment(e); return; }
    const isVocabTest = testType === 'VOCAB';
    const isPracticeTest = testType === 'PRACTICE';
    const isRegularTest = testType === 'REGULAR';
    const isTextMemorize = testType === 'TEXT_MEMORIZE';
    const isEnglishDefTest = isVocabTest && Boolean(document.getElementById('formIsEnglishDefTest')?.checked);

    const vocabSetId1 = isVocabTest ? document.getElementById('formVocabSetId')?.value : null;
    const vocabSetId2 = isVocabTest ? document.getElementById('formVocabSetId2')?.value : null;
    const vocabSetIds = isVocabTest ? [...new Set([vocabSetId1, vocabSetId2].filter(Boolean))] : [];
    const vocabSetId = vocabSetIds[0] || null;

    let title = (isVocabTest) ? (document.getElementById('formTitle')?.value?.trim() || '단어 테스트') : (isTextMemorize ? '본문암기 테스트' : document.getElementById('formTitle').value.trim());
    const date = document.getElementById('formDate').value;
    const time = document.getElementById('formTime').value.trim();
    const endTime = document.getElementById('formEndTime').value.trim();

    const regularCutoff = document.getElementById('formCutoff')?.value.trim() || '80점 이상';
    const vocabCutoff2 = Number(document.getElementById('formVocabCutoff_2')?.value ?? 80);
    const vocabCutoff3 = Number(document.getElementById('formVocabCutoff_3')?.value ?? 80);
    const vocabCutoff4 = Number(document.getElementById('formVocabCutoff_4')?.value ?? 80);
    const vocabCutoff5 = Number(document.getElementById('formVocabCutoff_5')?.value ?? 80);
    const vocabCutoffs = isVocabTest ? { 2: vocabCutoff2, 3: vocabCutoff3, 4: vocabCutoff4, 5: vocabCutoff5 } : null;
    // 출제 문항 수
    const rawQC2 = document.getElementById('formVocabQuestionCount_2')?.value;
    const rawQC3 = document.getElementById('formVocabQuestionCount_3')?.value;
    const rawQC4 = document.getElementById('formVocabQuestionCount_4')?.value;
    const rawQC5 = document.getElementById('formVocabQuestionCount_5')?.value;
    const vocabQuestionCounts = isVocabTest ? {
      2: rawQC2?.trim() ? Number(rawQC2) : null,
      3: rawQC3?.trim() ? Number(rawQC3) : null,
      4: rawQC4?.trim() ? Number(rawQC4) : null,
      5: (rawQC5 && Number(rawQC5) >= 5) ? Number(rawQC5) : null
    } : null;
    const vocabDirections = isVocabTest ? AppData.getVocabDirections({ isEnglishDefTest, vocabQuestionCounts }) : [];
    const practiceCutoff = Number(document.getElementById('formPracticeCutoff')?.value ?? 80);

    const textMemorizeMode = isTextMemorize ? (document.querySelector('input[name="formTextMemorizeMode"]:checked')?.value || 'CLOZE') : null;
    const textMemorizeCutoffType = isTextMemorize ? (document.getElementById('formTextMemorizeCutoffType')?.value || 'SCORE') : null;
    const textMemorizeCutoff = Number(document.getElementById('formTextMemorizeCutoff')?.value ?? 80);
    const textMemorizeMaxWrong = Number(document.getElementById('formTextMemorizeMaxWrong')?.value ?? 3);
    const textMemorizeDescriptiveOnly = isTextMemorize ? Boolean(document.getElementById('formTextMemorizeDescriptiveOnly')?.checked) : false;

    // TEXT_MEMORIZE: collect selected passage IDs
    const selectedPassageCheckboxes = document.querySelectorAll('input[name="formPassageCheckbox"]:checked');
    const selectedPassageIds = Array.from(selectedPassageCheckboxes).map(cb => cb.value);
    const passageBook = document.getElementById('formTextMemorizeBookSelect')?.value || '';

    let scope = document.getElementById('formScope').value.trim();
    if (isVocabTest) {
      const allSets = AppData.getVocabSets();
      const matchingSets = vocabSetIds.map(sId => allSets.find(s => s.id === sId)).filter(Boolean);
      if (matchingSets.length > 0) {
        const setTitles = matchingSets.map(s => s.title).join(', ');
        const totalWords = matchingSets.reduce((sum, s) => sum + (s.words?.length || 0), 0);
        const bookName = matchingSets[0]?.book || '';
        scope = bookName && bookName !== '기본 단어장' ? `[${bookName}] ${setTitles} (총 ${totalWords}단어)` : `${setTitles} (총 ${totalWords}단어)`;
        if (!title || title === '단어 테스트' || title.endsWith('단어 테스트') || title.includes('워드마스터')) {
          const raw = bookName && bookName !== '기본 단어장' ? `[${bookName}] ${matchingSets.map(s => s.title).join(' + ')}` : `${matchingSets.map(s => s.title).join(' + ')}`;
          title = this.formatCleanVocabTitle(raw);
        }
      } else {
        scope = '단어 세트 기반 5지선다 테스트';
      }
    } else if (isPracticeTest) {
      scope = scope || '5지선다 객관식 문제풀이';
    } else if (isTextMemorize) {
      const allPassages = this.getAllTextMemorizePassages();
      const matched = allPassages.filter(p => selectedPassageIds.includes(p.id));
      if (matched.length > 0) {
        const parts = matched.map(p => p.partTitle.replace(/\s*\(\d+문장\)/, '')).join(', ');
        let count = 0;
        if (textMemorizeDescriptiveOnly) {
          count = matched.reduce((sum, p) => sum + p.sentences.filter(s => s.isDescriptiveTarget).length, 0);
          scope = `${parts} (서술형 대비 엄선 ${count}문장)`;
        } else {
          count = matched.reduce((sum, p) => sum + p.sentences.length, 0);
          scope = `${parts} (총 ${matched.length}개 지문 / ${count}문장)`;
        }
      } else {
        scope = textMemorizeMode === 'FULL_SENTENCE'
          ? (textMemorizeDescriptiveOnly ? '본문암기 핵심 서술형 대비 영작 테스트' : '본문암기 문장 전체 영작(서술형) 테스트')
          : '본문암기 빈칸 채우기 테스트';
      }
    }

    let cutoff = regularCutoff;
    let cutoffScore = null;
    if (isVocabTest) {
      if (isEnglishDefTest) {
        cutoff = `영영풀이 ${vocabCutoff5}점`;
        cutoffScore = vocabCutoff5;
      } else {
        cutoff = vocabDirections.map(dir => `${this.getVocabDirectionLabel(dir)} ${vocabCutoffs[dir]}점`).join(' · ');
        cutoffScore = vocabDirections.length ? Math.min(...vocabDirections.map(dir => vocabCutoffs[dir])) : null;
      }
    } else if (isPracticeTest) {
      cutoff = `${practiceCutoff}점 이상`;
      cutoffScore = practiceCutoff;
    } else if (isTextMemorize) {
      if (textMemorizeCutoffType === 'WRONG_COUNT') {
        cutoff = `오답 ${textMemorizeMaxWrong}개 이하 허용`;
        cutoffScore = textMemorizeMaxWrong;
      } else {
        cutoff = `${textMemorizeCutoff}점 이상`;
        cutoffScore = textMemorizeCutoff;
      }
    } else {
      const match = String(regularCutoff).match(/(\d+)/);
      cutoffScore = match ? Number(match[1]) : null;
    }

    const score = isRegularTest ? document.getElementById('formScore').value.trim() : '';
    const retestDate = isRegularTest ? document.getElementById('formRetestDate').value : '';
    const teacherNote = isRegularTest ? document.getElementById('formTeacherNote').value.trim() : '';

    const status = isRegularTest ? (document.querySelector('input[name="formStatus"]:checked')?.value || 'SCHEDULED') : 'SCHEDULED';
    const retestStatus = isRegularTest ? (document.querySelector('input[name="formRetestStatus"]:checked')?.value || 'NONE') : 'NONE';
    const existingTest = id ? AppData.getTests().find(t => t.id === id) : null;


    // 공통 검사
    if (!title || !date) {
      this.toast('시험 제목과 날짜는 필수 입력 항목입니다.', 'error');
      return;
    }

    if (isVocabTest) {
      if (isEnglishDefTest) {
        if (vocabSetIds.length === 0 || !Number.isInteger(vocabCutoff5) || vocabCutoff5 < 1 || vocabCutoff5 > 100) {
          this.toast('단어 세트를 최소 1개 이상 선택하고 영영풀이 커트라인을 1~100점 사이로 입력해주세요.', 'error');
          return;
        }
      } else {
        const validCounts = [2, 3, 4].every(dir => {
          const count = vocabQuestionCounts[dir];
          return count === null || (Number.isInteger(count) && (count === 0 || (count >= 5 && count <= 200)));
        });
        if (!validCounts || vocabDirections.length === 0) {
          this.toast('출제 문항 수는 0(제외) 또는 5~200 사이의 정수로 입력하고, 최소 한 유형은 출제해주세요.', 'error');
          return;
        }
        const allValid = vocabDirections.every(dir => Number.isInteger(vocabCutoffs[dir]) && vocabCutoffs[dir] >= 1 && vocabCutoffs[dir] <= 100);
        if (vocabSetIds.length === 0 || !allValid) {
          this.toast('단어 세트를 최소 1개 이상 선택하고 각 유형별 커트라인을 1~100점 사이로 입력해주세요.', 'error');
          return;
        }
      }
    }

    if (isPracticeTest) {
      if (!Number.isInteger(practiceCutoff) || practiceCutoff < 1 || practiceCutoff > 100) {
        this.toast('문제풀이 커트라인은 1~100점 사이의 정수로 입력해주세요.', 'error');
        return;
      }

      const questions = this.state.editingPracticeQuestions;
      if (!Array.isArray(questions) || questions.length === 0) {
        this.toast('최소 1개 이상의 문제를 출제해야 합니다.', 'error');
        return;
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question || !q.question.trim()) {
          this.toast(`${i + 1}번 문제의 질문 내용을 입력해주세요.`, 'error');
          return;
        }
        const qType = q.type || 'CHOICE';
        if (qType === 'CHOICE') {
          if (!Array.isArray(q.choices) || q.choices.some(c => !String(c).trim())) {
            this.toast(`${i + 1}번 문제의 1~5번 보기를 모두 입력해주세요.`, 'error');
            return;
          }
          if (!q.answer || q.answer < 1 || q.answer > 5) {
            this.toast(`${i + 1}번 문제의 정답 번호를 선택해주세요.`, 'error');
            return;
          }
        } else if (qType === 'MULTI_CHOICE') {
          if (!Array.isArray(q.choices) || q.choices.some(c => !String(c).trim())) {
            this.toast(`${i + 1}번 문제의 1~5번 보기를 모두 입력해주세요.`, 'error');
            return;
          }
          if (!Array.isArray(q.answer) || q.answer.length === 0) {
            this.toast(`${i + 1}번 문제의 정답(복수 선택)을 최소 1개 이상 선택해주세요.`, 'error');
            return;
          }
        } else if (qType === 'SHORT') {
          if (!q.answer || !String(q.answer).trim()) {
            this.toast(`${i + 1}번 문제의 주관식 정답을 입력해주세요.`, 'error');
            return;
          }
        } else if (qType === 'ESSAY') {
          if (!q.answer || !String(q.answer).trim()) {
            this.toast(`${i + 1}번 문제의 서술형 모범 답안을 입력해주세요.`, 'error');
            return;
          }
        }
      }
    }

    if (isTextMemorize) {
      if (textMemorizeCutoffType === 'SCORE') {
        if (!Number.isInteger(textMemorizeCutoff) || textMemorizeCutoff < 1 || textMemorizeCutoff > 100) {
          this.toast('본문암기 커트라인 점수는 1~100점 사이의 정수로 입력해주세요.', 'error');
          return;
        }
      } else {
        if (!Number.isInteger(textMemorizeMaxWrong) || textMemorizeMaxWrong < 0 || textMemorizeMaxWrong > 100) {
          this.toast('본문암기 허용 오답 개수는 0 이상의 정수로 입력해주세요.', 'error');
          return;
        }
      }
      if (selectedPassageIds.length === 0) {
        this.toast('본문암기 출제 범위로 문단을 최소 1개 이상 선택해주세요.', 'error');
        return;
      }
    }

    const practiceQuestions = isPracticeTest ? JSON.parse(JSON.stringify(this.state.editingPracticeQuestions)) : null;

    // 대상 학생 체크박스 확인
    const checkedBoxes = document.querySelectorAll('input[name="formStudentCheckbox"]:checked');
    const selectedStudentIds = Array.from(checkedBoxes).map(cb => Number(cb.value));

    if (selectedStudentIds.length === 0) {
      this.toast('시험을 배정할 학생을 최소 1명 이상 선택해주세요.', 'error');
      return;
    }

    const allTests = AppData.getTests();

    if (id) {
      // 1. 기존 시험 수정 및 다중 학생 일괄 수정/추가 모드
      const existingTest = allTests.find(t => t.id === id);
      const originalStudentId = existingTest ? existingTest.studentId : null;
      const primaryStudentId = selectedStudentIds.includes(originalStudentId) ? originalStudentId : selectedStudentIds[0];

      const savePromises = selectedStudentIds.map(async (studentId) => {
        if (studentId === primaryStudentId) {
          // 기존 원본 시험 정보 수정
          const testData = {
            id,
            studentId,
            title,
            date,
            time,
            endTime,
            scope,
            cutoff,
            cutoffScore,
            score: isPracticeTest ? (existingTest?.score || '') : score,
            status: (isPracticeTest || isTextMemorize) ? (existingTest?.status || 'SCHEDULED') : status,
            retestStatus,
            retestDate,
            teacherNote,
            vocabSetId,
            vocabSetIds,
            vocabCutoff: isVocabTest ? cutoffScore : null,
            vocabCutoffs: isVocabTest ? vocabCutoffs : null,
            isEnglishDefTest: isVocabTest ? isEnglishDefTest : false,
            practiceCutoff: isPracticeTest ? practiceCutoff : null,
            questions: isPracticeTest ? practiceQuestions : null,
            practiceResult: isPracticeTest ? existingTest?.practiceResult : null,
            passageIds: isTextMemorize ? selectedPassageIds : (existingTest?.passageIds || null),
            passageBook: isTextMemorize ? passageBook : (existingTest?.passageBook || null),
            textMemorizeCutoff: isTextMemorize ? textMemorizeCutoff : null,
            textMemorizeCutoffType: isTextMemorize ? textMemorizeCutoffType : null,
            textMemorizeMaxWrong: isTextMemorize ? textMemorizeMaxWrong : null,
            textMemorizeMode: isTextMemorize ? textMemorizeMode : null,
            textMemorizeDescriptiveOnly: isTextMemorize ? textMemorizeDescriptiveOnly : (existingTest?.textMemorizeDescriptiveOnly || false),
            extendedDate: existingTest?.extendedDate || null,
            extendedEndTime: existingTest?.extendedEndTime || null,
            allowLate: existingTest?.allowLate || false,
            type: testType,

            vocabQuestionCounts: isVocabTest ? vocabQuestionCounts : null
          };
          return AppData.saveOrUpdateTest(testData);
        } else {
          // 다른 학생: 동일한 시험(단어세트ID 또는 제목, 날짜)이 이미 있는지 탐색
          const matchingExistingTest = allTests.find(t => {
            if (t.studentId !== studentId) return false;
            if (isVocabTest) {
              const tSetIds = Array.isArray(t.vocabSetIds) && t.vocabSetIds.length > 0 ? t.vocabSetIds : (t.vocabSetId ? [t.vocabSetId] : []);
              const isSameSet = (vocabSetIds.length > 0 && tSetIds.length > 0 && vocabSetIds.slice().sort().join(',') === tSetIds.slice().sort().join(',')) ||
                                (vocabSetId && t.vocabSetId === vocabSetId);
              return t.type === 'VOCAB' && isSameSet && (t.date === date || (existingTest && t.date === existingTest.date));
            }
            if (isPracticeTest) {
              return t.type === 'PRACTICE' && t.title === (existingTest?.title || title) && (t.date === date || (existingTest && t.date === existingTest.date));
            }
            if (isTextMemorize) {
              return t.type === 'TEXT_MEMORIZE' && t.title === (existingTest?.title || title) && (t.date === date || (existingTest && t.date === existingTest.date));
            }
            return (t.type || 'REGULAR') === 'REGULAR' && t.title === (existingTest?.title || title) && (t.date === date || (existingTest && t.date === existingTest.date));
          });

          if (matchingExistingTest) {
            // 이미 동일한 시험이 있으면 해당 학생의 시험 정보 업데이트
            const testData = {
              ...matchingExistingTest,
              title,
              date,
              time,
              endTime,
              scope,
              cutoff,
              cutoffScore,
              vocabSetId,
              vocabSetIds,
              vocabCutoff: isVocabTest ? cutoffScore : null,
              vocabCutoffs: isVocabTest ? vocabCutoffs : null,
              isEnglishDefTest: isVocabTest ? isEnglishDefTest : false,
              practiceCutoff: isPracticeTest ? practiceCutoff : null,
              questions: isPracticeTest ? practiceQuestions : null,
              passageIds: isTextMemorize ? selectedPassageIds : (matchingExistingTest.passageIds || null),
              passageBook: isTextMemorize ? passageBook : (matchingExistingTest.passageBook || null),
              textMemorizeCutoff: isTextMemorize ? textMemorizeCutoff : null,
              textMemorizeCutoffType: isTextMemorize ? textMemorizeCutoffType : null,
              textMemorizeMaxWrong: isTextMemorize ? textMemorizeMaxWrong : null,
              textMemorizeMode: isTextMemorize ? textMemorizeMode : null,
              textMemorizeDescriptiveOnly: isTextMemorize ? textMemorizeDescriptiveOnly : (matchingExistingTest.textMemorizeDescriptiveOnly || false),
              type: testType,

              vocabQuestionCounts: isVocabTest ? vocabQuestionCounts : null
            };
            if (isRegularTest) {
              if (score) testData.score = score;
              if (status !== 'SCHEDULED' || matchingExistingTest.status === 'SCHEDULED') testData.status = status;
              if (retestStatus !== 'NONE' || matchingExistingTest.retestStatus === 'NONE') testData.retestStatus = retestStatus;
              if (retestDate) testData.retestDate = retestDate;
              if (teacherNote) testData.teacherNote = teacherNote;
            }
            return AppData.saveOrUpdateTest(testData);
          } else {
            // 해당 학생에게 시험이 없으면 새로 추가
            const newTest = {
              studentId,
              title,
              date,
              time,
              endTime,
              scope,
              cutoff,
              cutoffScore,
              score: isRegularTest ? score : '',
              status: isRegularTest ? status : 'SCHEDULED',
              retestStatus: isRegularTest ? retestStatus : 'NONE',
              retestDate: isRegularTest ? retestDate : '',
              teacherNote: isRegularTest ? teacherNote : '',
              vocabSetId,
              vocabSetIds,
              vocabCutoff: isVocabTest ? cutoffScore : null,
              vocabCutoffs: isVocabTest ? vocabCutoffs : null,
              isEnglishDefTest: isVocabTest ? isEnglishDefTest : false,
              practiceCutoff: isPracticeTest ? practiceCutoff : null,
              questions: isPracticeTest ? practiceQuestions : null,
              practiceResult: null,
              passageIds: isTextMemorize ? selectedPassageIds : null,
              passageBook: isTextMemorize ? passageBook : null,
              textMemorizeCutoff: isTextMemorize ? textMemorizeCutoff : null,
              textMemorizeCutoffType: isTextMemorize ? textMemorizeCutoffType : null,
              textMemorizeMaxWrong: isTextMemorize ? textMemorizeMaxWrong : null,
              textMemorizeMode: isTextMemorize ? textMemorizeMode : null,
              textMemorizeDescriptiveOnly: isTextMemorize ? textMemorizeDescriptiveOnly : false,
              type: testType,

              vocabQuestionCounts: isVocabTest ? vocabQuestionCounts : null
            };
            return AppData.saveOrUpdateTest(newTest);
          }
        }
      });

      try {
        await Promise.all(savePromises);
      } catch (error) {
        console.error(error);
        return;
      }
      this.closeAdminTestFormModal();
      if (selectedStudentIds.length === 1) {
        this.toast(`'${title}' 일정이 성공적으로 수정되었습니다!`, 'success');
        this.state.adminSelectedStudentId = selectedStudentIds[0];
      } else {
        this.toast(`선택한 ${selectedStudentIds.length}명의 학생에게 '${title}' 일정이 일괄 수정/적용되었습니다.`, 'success');
      }
    } else {
      // 2. 새 시험 등록 모드 (다중 학생 지원)
      const newTests = selectedStudentIds.map(sId => {
        const newTest = {
          studentId: sId,
          title,
          date,
          time,
          endTime,
          scope,
          cutoff,
          cutoffScore,
          score: isRegularTest ? score : '',
          status: isRegularTest ? status : 'SCHEDULED',
          retestStatus: isRegularTest ? retestStatus : 'NONE',
          retestDate: isRegularTest ? retestDate : '',
          teacherNote: isRegularTest ? teacherNote : '',
          vocabSetId,
          vocabSetIds,
          vocabCutoff: isVocabTest ? cutoffScore : null,
          vocabCutoffs: isVocabTest ? vocabCutoffs : null,
          isEnglishDefTest: isVocabTest ? isEnglishDefTest : false,
          practiceCutoff: isPracticeTest ? practiceCutoff : null,
          questions: isPracticeTest ? practiceQuestions : null,
          practiceResult: null,
          passageIds: isTextMemorize ? selectedPassageIds : null,
          passageBook: isTextMemorize ? passageBook : null,
          textMemorizeCutoff: isTextMemorize ? textMemorizeCutoff : null,
          textMemorizeCutoffType: isTextMemorize ? textMemorizeCutoffType : null,
          textMemorizeMaxWrong: isTextMemorize ? textMemorizeMaxWrong : null,
          textMemorizeMode: isTextMemorize ? textMemorizeMode : null,
          textMemorizeDescriptiveOnly: isTextMemorize ? textMemorizeDescriptiveOnly : false,
          type: testType,

          vocabQuestionCounts: isVocabTest ? vocabQuestionCounts : null
        };
        return AppData.saveOrUpdateTest(newTest);
      });

      try {
        await Promise.all(newTests);
      } catch (error) {
        console.error(error);
        return;
      }
      this.closeAdminTestFormModal();
      if (selectedStudentIds.length === 1) {
        this.toast(`'${title}' 일정이 성공적으로 등록되었습니다!`, 'success');
        this.state.adminSelectedStudentId = selectedStudentIds[0];
      } else {
        this.toast(`선택한 ${selectedStudentIds.length}명의 학생에게 '${title}' 일정이 일괄 등록되었습니다.`, 'success');
      }
    }

    this.renderAdminDashboard();
  },

  async confirmDeleteTest(testId) {
    const allTests = AppData.getTests();
    const test = allTests.find(t => t.id === testId);
    if (!test) return;

    if (test.type === 'VOCAB_REVIEW') return this.confirmDeleteWeeklyReview(testId);

    if (confirm(`'${test.title}' 시험 일정을 정말 삭제하시겠습니까?`)) {
      try {
        await AppData.deleteTest(testId);
        this.toast('시험 일정이 삭제되었습니다.', 'info');
        this.renderAdminTestsTab();
      } catch (error) {
        console.error(error);
      }
    }
  },

  // ========================================================
  // 7. 백업 & 데이터 관리 (Export / Import / Reset)
  // ========================================================
  exportDataFile() {
    const data = AppData.exportData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `english_tutoring_backup_${this.getTodayDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast('데이터 백업 JSON 파일이 다운로드되었습니다.', 'success');
  },

  handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const ok = await AppData.importData(json);
        if (ok) {
          this.toast('데이터가 성공적으로 복원되었습니다!', 'success');
          this.renderAdminDashboard();
        } else {
          this.toast('올바르지 않은 백업 파일 형식입니다.', 'error');
        }
      } catch (err) {
        console.error(err);
        this.toast('데이터 복원 중 오류가 발생했습니다.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  },

  async confirmResetData() {
    if (confirm('모든 시험 일정 및 학생 프로필을 기본 샘플 데이터로 초기화하시겠습니까? (이 작업은 되돌릴 수 없습니다)')) {
      try {
        await AppData.resetToDefaults();
        this.toast('기본 샘플 데이터로 초기화되었습니다.', 'success');
        this.renderAdminDashboard();
      } catch (error) {
        console.error(error);
        this.toast('기본 데이터 초기화에 실패했습니다.', 'error');
      }
    }
  },

  // ========================================================
  // 8. 모달 & 유틸리티 (Modals & Utilities)
  // ========================================================
  _activeModals: new Set(),

  updateBodyScrollLock() {
    const modalIds = [
      'textMemorizeExamModal', 'textMemorizeResultModal', 'testDetailModal',
      'adminTestFormModal', 'vocabSetModal', 'extendTestModal', 'textMemorizeScheduleModal'
    ];
    const anyModalVisible = modalIds.some(id => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden') && el.style.display !== 'none';
    }) || this._activeModals.size > 0;

    if (anyModalVisible) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('overflow-hidden');
    }
  },

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    this._modalHideTimers ||= new Map();
    clearTimeout(this._modalHideTimers.get(modalId));
    this._modalHideTimers.delete(modalId);
    if (modalId === 'testDetailModal') modal.classList.toggle('grammar-detail-modal', Boolean(modal.querySelector('[data-grammar-summary]')));
    this._activeModals.add(modalId);
    modal.classList.remove('hidden');
    this.updateBodyScrollLock();
    // 부드러운 애니메이션
    setTimeout(() => {
      modal.querySelector('.modal-content')?.classList.remove('scale-95', 'opacity-0');
      modal.querySelector('.modal-content')?.classList.add('scale-100', 'opacity-100');
    }, 10);
  },

  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    this._activeModals.delete(modalId);
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.classList.remove('scale-100', 'opacity-100');
      content.classList.add('scale-95', 'opacity-0');
    }
    this._modalHideTimers ||= new Map();
    clearTimeout(this._modalHideTimers.get(modalId));
    this._modalHideTimers.set(modalId, setTimeout(() => {
      this._modalHideTimers.delete(modalId);
      modal.classList.add('hidden');
      this.updateBodyScrollLock();
    }, 200));
  },

  closeAllModals() {
    this._modalHideTimers?.forEach(timer => clearTimeout(timer));
    this._modalHideTimers?.clear();
    this._activeModals.clear();
    ['testDetailModal', 'adminTestFormModal', 'vocabSetModal', 'vocabStudyModal', 'textMemorizeExamModal', 'textMemorizeResultModal', 'textMemorizeScheduleModal', 'extendTestModal', 'grammarAssignmentModal', 'grammarGradingModal', 'grammarResultModal'].forEach(id => {
      const modal = document.getElementById(id);
      if (modal) modal.classList.add('hidden');
    });
    this.updateBodyScrollLock();
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toastEl = document.createElement('div');
    let bg = 'bg-slate-900 text-white';
    let icon = '<i class="fa-solid fa-circle-info text-blue-400"></i>';

    if (type === 'success') {
      bg = 'bg-emerald-800 text-white border border-emerald-600';
      icon = '<i class="fa-solid fa-circle-check text-emerald-300"></i>';
    } else if (type === 'error') {
      bg = 'bg-rose-800 text-white border border-rose-600';
      icon = '<i class="fa-solid fa-triangle-exclamation text-rose-300"></i>';
    }

    toastEl.className = `toast-item py-3 px-4 rounded-xl shadow-xl flex items-center gap-2.5 text-xs sm:text-sm font-semibold ${bg}`;
    toastEl.innerHTML = `${icon}<span>${this.escapeHtml(message)}</span>`;

    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease, max-height 0.4s ease, padding 0.4s ease, margin 0.4s ease';
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(-10px) scale(0.96)';
      toastEl.style.maxHeight = '0';
      toastEl.style.paddingTop = '0';
      toastEl.style.paddingBottom = '0';
      toastEl.style.marginTop = '0';
      setTimeout(() => toastEl.remove(), 420);
    }, 3000);
  },

  calculateDDay(dateStr) {
    if (!dateStr) return '-';
    const target = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'D-Day';
    if (diffDays > 0) return `D-${diffDays}`;
    return `D+${Math.abs(diffDays)}`;
  },

  getTestDDayBadge(test) {
    if (!test || !test.date) return { text: '-', class: 'bg-slate-100 text-slate-600' };
    if (test.type === 'GRAMMAR' && test.grammarStartedAt) return { text: test.grammarStage === 'done' ? '응시 완료' : '응시 중', class: 'bg-violet-100 text-violet-800' };

    const target = new Date(test.date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return { text: 'D-Day', class: 'bg-rose-500 text-white font-black' };
    }
    if (diffDays > 0) {
      return { text: `D-${diffDays}`, class: 'bg-indigo-600 text-white font-black' };
    }

    // D+1부터는 관리자가 결과를 설정했거나(응시했으면) '응시 완료', 아니면 '미응시'
    const isTaken = (test.status === 'PASS' || test.status === 'FAIL') ||
                    (test.score && test.score !== '미응시' && test.score.trim() !== '') ||
                    Boolean(test.practiceResult) ||
                    (test.retestStatus && test.retestStatus !== 'NONE');

    if (isTaken) {
      return { text: '응시 완료', class: 'bg-emerald-600 text-white font-bold' };
    } else {
      return { text: '미응시', class: 'bg-slate-500 text-white font-bold' };
    }
  },

  getTodayDateString() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  formatDate(dateObj) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // ========================================================
  // 9. 단어 세트 관리 (Admin) & 단어 테스트 (Student)
  // ========================================================

  // ── 관리자: 단어 세트 탭 렌더링 ──────────────────────────
  setVocabBookFilter(bookName) {
    this.state.selectedVocabBookFilter = bookName;
    // 특정 교재를 클릭한 경우 자동으로 해당 교재를 펼침
    if (bookName !== 'ALL') {
      if (!this.state.expandedVocabBooks) this.state.expandedVocabBooks = {};
      this.state.expandedVocabBooks[bookName] = true;
    }
    this.renderAdminVocabTab();
  },

  toggleVocabBookExpanded(bookName) {
    if (!this.state.expandedVocabBooks) this.state.expandedVocabBooks = {};
    this.state.expandedVocabBooks[bookName] = !this.state.expandedVocabBooks[bookName];
    this.renderAdminVocabTab();
  },

  renderAdminVocabTab() {
    const container = document.getElementById('adminVocabSetsList');
    if (!container) return;

    const results = AppData.getVocabTestResults();
    const tests = AppData.getTests().filter(test => test.type === 'VOCAB');
    const students = AppData.getStudents();
    const sets = AppData.getVocabSets();

    if (!this.state.expandedVocabBooks) {
      this.state.expandedVocabBooks = {};
    }

    // 교재(폴더)별 세트 그룹화
    const booksMap = {};
    sets.forEach(s => {
      const b = (s.book || '기본 단어장').trim();
      if (!booksMap[b]) booksMap[b] = [];
      booksMap[b].push(s);
    });
    const bookNames = Object.keys(booksMap);

    const activeFilter = this.state.selectedVocabBookFilter || 'ALL';
    const displayedBookNames = activeFilter === 'ALL'
      ? bookNames
      : bookNames.filter(b => b === activeFilter);

    // ── 1. 단어 세트 관리 섹션 HTML ───────────────────
    const vocabSetsHtml = `
      <div class="glass-card rounded-2xl p-5 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 class="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <i class="fa-solid fa-book-bookmark text-indigo-600"></i>
              <span>단어장 교재 & 세트 관리</span>
              <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">${sets.length}개 세트</span>
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">교재 표지를 클릭하여 하위 Day 세트를 열고 닫을 수 있습니다.</p>
          </div>
          <button onclick="App.openVocabSetModal()" class="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-sm flex items-center gap-1.5">
            <i class="fa-solid fa-plus"></i> 새 단어 세트 만들기
          </button>
        </div>

        <!-- 교재(폴더) 분류 필터 탭 바 -->
        <div class="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-100 scrollbar-none">
          <button type="button" onclick="App.setVocabBookFilter('ALL')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 ${activeFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            <i class="fa-solid fa-layer-group text-[11px]"></i>
            <span>전체 교재</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] ${activeFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}">${sets.length}</span>
          </button>
          ${bookNames.map(bName => `
            <button type="button" onclick="App.setVocabBookFilter('${this.escapeHtml(bName)}')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 ${activeFilter === bName ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
              <i class="fa-solid fa-folder text-[11px] ${activeFilter === bName ? 'text-indigo-200' : 'text-amber-500'}"></i>
              <span>${this.escapeHtml(bName)}</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] ${activeFilter === bName ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}">${booksMap[bName].length}</span>
            </button>
          `).join('')}
        </div>

        <!-- 교재(책)별 표지 아코디언 목록 -->
        ${displayedBookNames.length > 0 ? `
          <div class="space-y-3.5">
            ${displayedBookNames.map(bName => {
              const bookSets = (booksMap[bName] || []).slice().sort((a, b) =>
                (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
              );
              const totalWordsInBook = bookSets.reduce((sum, s) => sum + (s.words || []).length, 0);
              const isExpanded = activeFilter === bName ? (this.state.expandedVocabBooks[bName] !== false) : !!this.state.expandedVocabBooks[bName];
              const isWordmaster = bName.includes('워드마스터');

              return `
                <div class="rounded-2xl border ${isExpanded ? 'border-indigo-300 ring-2 ring-indigo-50 shadow-sm' : 'border-slate-200 hover:border-indigo-200'} bg-white overflow-hidden transition">
                  <!-- 교재 표지 헤더 카드 (클릭 시 토글) -->
                  <div onclick="App.toggleVocabBookExpanded('${this.escapeHtml(bName)}')" class="p-4 cursor-pointer flex items-center justify-between gap-3 ${isExpanded ? 'bg-indigo-50/60' : 'bg-slate-50/70 hover:bg-slate-100/70'} transition">
                    <div class="flex items-center gap-3.5 min-w-0">
                      <div class="w-11 h-12 rounded-xl ${isWordmaster ? 'bg-gradient-to-br from-indigo-600 to-violet-700' : 'bg-gradient-to-br from-slate-700 to-slate-900'} text-white flex items-center justify-center text-lg flex-shrink-0 shadow-xs border border-white/20">
                        <i class="fa-solid ${isWordmaster ? 'fa-book-open' : 'fa-folder-closed'}"></i>
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <h4 class="font-black text-slate-900 text-sm sm:text-base truncate">${this.escapeHtml(bName)}</h4>
                          <span class="text-[11px] font-bold ${isWordmaster ? 'text-indigo-700 bg-indigo-100' : 'text-slate-700 bg-slate-200'} px-2 py-0.5 rounded-full">
                            총 ${bookSets.length}개 세트 · ${totalWordsInBook.toLocaleString()}단어
                          </span>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5 truncate">
                          ${isExpanded ? '클릭하면 세트 목록을 접습니다.' : '클릭하여 세트 목록 및 단어 보기 (접힘 상태)'}
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${isExpanded ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}">
                        <span>${isExpanded ? '접기' : `Day 세트 열기 (${bookSets.length}개)`}</span>
                        <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]"></i>
                      </span>
                    </div>
                  </div>

                  <!-- 펼쳐졌을 때의 하위 세트 그리드 -->
                  ${isExpanded ? `
                    <div class="p-4 bg-white border-t border-slate-100">
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${bookSets.map(set => {
                          const wordCount = (set.words || []).length;

                          return `
                            <div class="rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-200 transition space-y-2.5 shadow-2xs">
                              <div class="flex items-start justify-between gap-2">
                                <div class="space-y-0.5">
                                  <h5 class="font-black text-slate-900 text-sm flex items-center gap-1.5">
                                    <i class="fa-solid fa-file-lines text-indigo-500 text-xs"></i>
                                    <span>${this.escapeHtml(set.title)}</span>
                                  </h5>
                                  <p class="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                                    <span class="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">${wordCount}단어</span>
                                  </p>
                                </div>
                                <div class="flex items-center gap-1 flex-shrink-0">
                                  <button onclick="App.openVocabStudyModal('${set.id}')" class="px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition cursor-pointer" title="단어장 크게 보기">
                                    <i class="fa-solid fa-expand text-[10px]"></i> 크게 보기
                                  </button>
                                  <button onclick="App.openVocabSetModal('${set.id}')" class="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition cursor-pointer">
                                    <i class="fa-solid fa-pen-to-square text-[10px]"></i> 수정
                                  </button>
                                  <button onclick="App.confirmDeleteVocabSet('${set.id}')" class="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-100 transition cursor-pointer">
                                    <i class="fa-solid fa-trash-can text-[10px]"></i>
                                  </button>
                                </div>
                              </div>

                              ${wordCount > 0 ? `
                                <details class="text-xs pt-1 border-t border-slate-100">
                                  <summary class="cursor-pointer font-semibold text-slate-500 hover:text-indigo-600 text-[11px] flex items-center justify-between py-0.5">
                                    <span>단어 미리보기 (${wordCount}개)</span>
                                    <span class="text-[10px] text-slate-400">펼치기</span>
                                  </summary>
                                  <div class="mt-2 max-h-36 overflow-y-auto space-y-1 pr-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    ${set.words.map((w, idx) => `
                                      <div class="flex items-center justify-between text-[11px] py-0.5 px-1 rounded hover:bg-white transition gap-2" ${w.desc ? `title="${this.escapeHtml(w.desc)}"` : ''}>
                                        <div class="flex items-center gap-1.5 min-w-0">
                                          <button type="button" onclick="App.playDictionaryAudio('${this.escapeHtml(w.en)}'); event.stopPropagation();" class="text-indigo-600 hover:text-indigo-800 flex-shrink-0" title="발음 듣기">
                                            <i class="fa-solid fa-volume-high text-[10px]"></i>
                                          </button>
                                          <span class="font-bold text-slate-800 truncate">${idx + 1}. ${this.escapeHtml(w.en)} ${w.ipa ? `<span class="text-[10px] text-slate-400 font-normal font-mono">${this.escapeHtml(w.ipa)}</span>` : ''}</span>
                                        </div>
                                        <span class="text-slate-500 font-medium text-right flex-shrink-0">${this.escapeHtml(w.ko)}</span>
                                      </div>
                                    `).join('')}
                                  </div>
                                </details>
                              ` : ''}
                            </div>`;
                        }).join('')}
                      </div>
                    </div>
                  ` : ''}
                </div>`;
            }).join('')}
          </div>
        ` : `
          <div class="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
            <i class="fa-solid fa-book-open text-3xl text-slate-300 mb-2"></i>
            <p class="text-xs font-bold text-slate-600">${activeFilter !== 'ALL' ? `'${activeFilter}' 교재에 등록된 세트가 없습니다.` : '등록된 단어 세트가 없습니다.'}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">새 단어 세트를 만들어 학생들에게 배정해보세요.</p>
            <button onclick="App.openVocabSetModal()" class="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition">
              <i class="fa-solid fa-plus mr-1"></i> 새 단어 세트 만들기
            </button>
          </div>
        `}
      </div>`;

    // ── 2. 날짜별 단어 테스트 결과 및 채점 섹션 (캘린더 기반) ────
    const dateSet = new Set();
    tests.forEach(test => {
      if (test.date) dateSet.add(test.date);
    });
    results.forEach(result => {
      const date = this.getVocabResultDate(result);
      if (date) dateSet.add(date);
    });

    const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
    let resultsSectionHtml = '';

    if (!this.state.vocabResultSelectedDate || (!dates.includes(this.state.vocabResultSelectedDate) && dates.length > 0)) {
      this.state.vocabResultSelectedDate = dates.length > 0 ? dates[0] : this.getTodayDateString();
    }
    const selectedDate = this.state.vocabResultSelectedDate || this.getTodayDateString();

    if (!this.state.adminVocabCalendarMonth) {
      if (selectedDate) {
        const [sy, sm] = selectedDate.split('-').map(Number);
        this.state.adminVocabCalendarMonth = new Date(sy, sm - 1, 1);
      } else {
        this.state.adminVocabCalendarMonth = new Date();
      }
    }

    const calYear = this.state.adminVocabCalendarMonth.getFullYear();
    const calMonth = this.state.adminVocabCalendarMonth.getMonth(); // 0-11
    const firstDayIndex = new Date(calYear, calMonth, 1).getDay(); // 0: Sun, 6: Sat
    const lastDate = new Date(calYear, calMonth + 1, 0).getDate();
    const prevLastDate = new Date(calYear, calMonth, 0).getDate();
    const todayStr = this.getTodayDateString();

    const calendarCells = [];

    const renderCell = (dayNum, dateStr, isOtherMonth) => {
      const isToday = (dateStr === todayStr);
      const isSelected = (dateStr === selectedDate);
      const [y, m, d] = dateStr.split('-').map(Number);
      const dObj = new Date(y, m - 1, d);
      const dayOfWeek = dObj.getDay();
      const isSunday = (dayOfWeek === 0);
      const isSaturday = (dayOfWeek === 6);

      const cellTests = tests.filter(test => test.date === dateStr);
      const cellResults = results.filter(result => this.getVocabResultDate(result) === dateStr);
      const uniqueStudentIds = new Set([
        ...cellResults.map(r => Number(r.studentId)),
        ...cellTests.map(t => Number(t.studentId))
      ]);
      const hasData = (cellTests.length > 0 || cellResults.length > 0);
      const passedCount = cellResults.filter(r => r.passed).length;
      const resultCount = cellResults.length;
      const hasPending = cellResults.some(r => r.direction === 4 && r.waitingGrading && !r.gradedByAdmin);
      const hasRetest = cellResults.some(r => !r.passed && !(r.direction === 4 && r.waitingGrading && !r.gradedByAdmin));

      let borderClass = 'border-slate-200';
      let bgClass = 'bg-white hover:bg-slate-50';
      let ringClass = '';

      if (isSelected) {
        borderClass = 'border-indigo-600';
        bgClass = 'bg-indigo-50/90 shadow-sm';
        ringClass = 'ring-2 ring-indigo-500 ring-offset-1 z-10';
      } else if (hasPending) {
        borderClass = 'border-amber-300';
        bgClass = 'bg-amber-50/70 hover:bg-amber-100/70 hover:border-amber-400';
      } else if (hasData && passedCount > 0 && passedCount === resultCount && resultCount >= uniqueStudentIds.size) {
        borderClass = 'border-emerald-200';
        bgClass = 'bg-emerald-50/60 hover:bg-emerald-100/60 hover:border-emerald-300';
      } else if (hasData) {
        borderClass = 'border-slate-300';
        bgClass = 'bg-slate-50/90 hover:bg-indigo-50/40 hover:border-indigo-300';
      } else if (isOtherMonth) {
        borderClass = 'border-slate-100/70';
        bgClass = 'bg-slate-50/30 text-slate-300';
      }

      const numColorClass = isSelected
        ? 'text-indigo-700 font-black'
        : isOtherMonth
        ? 'text-slate-300'
        : isSunday
        ? 'text-rose-500 font-bold'
        : isSaturday
        ? 'text-indigo-500 font-bold'
        : 'text-slate-700 font-bold';

      return `
        <div onclick="App.selectVocabResultDate('${dateStr}')"
          class="min-h-[70px] sm:min-h-[82px] p-1.5 sm:p-2 rounded-xl border ${borderClass} ${bgClass} ${ringClass} transition flex flex-col justify-between cursor-pointer group relative overflow-hidden"
          title="${dateStr}${hasData ? ` (학생 ${uniqueStudentIds.size}명 / 결과 ${resultCount}건)` : ''}">
          <!-- Top Row: Day Number & Status Indicator -->
          <div class="flex items-center justify-between gap-1">
            <span class="text-xs sm:text-sm ${numColorClass}">${dayNum}</span>
            <div class="flex items-center gap-1 flex-shrink-0">
              ${isToday ? `<span class="text-[9px] font-black text-indigo-700 bg-indigo-100 px-1 py-0.2 rounded leading-tight">오늘</span>` : ''}
              ${hasPending ? `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="채점 대기 중인 답안이 있습니다"></span>` : ''}
            </div>
          </div>

          <!-- Bottom: Test & Result Summary Badges -->
          ${hasData ? `
            <div class="space-y-0.5 mt-1">
              ${hasPending ? `
                <div class="text-[9px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded-md border border-amber-200 flex items-center justify-center gap-0.5 truncate">
                  <i class="fa-solid fa-clock text-[8px]"></i> 채점대기
                </div>
              ` : ''}
              <div class="flex items-center gap-1 flex-wrap">
                <span class="text-[9px] font-extrabold text-slate-600 bg-white/80 border border-slate-200 px-1 py-0.2 rounded leading-tight">
                  ${uniqueStudentIds.size}명
                </span>
                ${passedCount > 0 ? `
                  <span class="text-[9px] font-extrabold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-1 py-0.2 rounded leading-tight">
                    통과 ${passedCount}
                  </span>
                ` : ''}
                ${hasRetest ? `
                  <span class="text-[9px] font-extrabold text-rose-700 bg-rose-100 border border-rose-200 px-1 py-0.2 rounded leading-tight">
                    재시험
                  </span>
                ` : ''}
                ${cellTests.length > 0 && resultCount === 0 ? `
                  <span class="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 py-0.2 rounded leading-tight">
                    미응시
                  </span>
                ` : ''}
              </div>
            </div>
          ` : `
            <div></div>
          `}
        </div>
      `;
    };

    // 1. 이전 달 날짜들
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevLastDate - i;
      const prevDate = new Date(calYear, calMonth - 1, dayNum);
      calendarCells.push(renderCell(dayNum, this.formatDate(prevDate), true));
    }

    // 2. 이번 달 날짜들
    for (let dayNum = 1; dayNum <= lastDate; dayNum++) {
      const curDate = new Date(calYear, calMonth, dayNum);
      calendarCells.push(renderCell(dayNum, this.formatDate(curDate), false));
    }

    // 3. 다음 달 날짜들 (7열 그리드 마감)
    const totalCells = firstDayIndex + lastDate;
    const nextDaysNeeded = (7 - (totalCells % 7)) % 7;
    for (let dayNum = 1; dayNum <= nextDaysNeeded; dayNum++) {
      const nextDate = new Date(calYear, calMonth + 1, dayNum);
      calendarCells.push(renderCell(dayNum, this.formatDate(nextDate), true));
    }

    const calendarGridHtml = calendarCells.join('');

    const recentDates = dates.slice(0, 5);
    const recentTestJumpButtonsHtml = recentDates.length > 0 ? `
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-[11px] font-bold text-slate-500 mr-1">최근 시험일:</span>
        ${recentDates.map(d => {
          const [, m, day] = d.split('-');
          const isAct = (d === selectedDate);
          return `
            <button type="button" onclick="App.selectVocabResultDate('${d}')"
              class="px-2 py-0.5 rounded-lg text-xs font-bold transition ${isAct ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
              ${Number(m)}/${Number(day)}
            </button>
          `;
        }).join('')}
      </div>
    ` : '';

    const calMonthTitle = `${calYear}년 ${calMonth + 1}월`;

      const selectedTests = tests.filter(test => test.date === selectedDate);
      const selectedResults = results.filter(result => this.getVocabResultDate(result) === selectedDate);

      const studentCards = students.map(student => {
        const studentTests = selectedTests.filter(test => String(test.studentId) === String(student.id));
        const studentResults = selectedResults.filter(result => String(result.studentId) === String(student.id));

        if (studentTests.length === 0 && studentResults.length === 0) return '';

        if (studentResults.length === 0) {
          const testNames = studentTests.map(test => this.escapeHtml(test.title || '단어 테스트')).join(', ');
          return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="font-extrabold text-slate-900">${this.escapeHtml(student.name)}</p>
                  <p class="text-[11px] text-slate-500 mt-0.5">${testNames || '단어 테스트'}</p>
                </div>
                <span class="px-2.5 py-1 rounded-full bg-slate-200 text-slate-600 text-[11px] font-bold">미응시</span>
              </div>
            </div>`;
        }

        const resultHtml = studentResults.map(result => {
          const test = tests.find(item => String(item.id) === String(result.testId));
          const set = sets.find(item => String(item.id) === String(result.setId));
          const directionLabel = this.getVocabDirectionLabel(result.direction);
          const wrongAnswers = result.wrongAnswers || [];
          const attemptCount = result.attempts ? result.attempts.length : 1;
          const completedTime = this.getVocabResultTimeString(result);
          const canGrade = result.direction === 4;
          const isPending = result.direction === 4 && result.waitingGrading && !result.gradedByAdmin;
          const gradedBadge = result.gradedByAdmin ? `<span class="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 ml-1">채점 완료</span>` : '';

          const statusText = result.passed ? 'PASS' : (isPending ? '채점 대기' : '불합격');
          const statusColor = result.passed ? 'text-emerald-700' : (isPending ? 'text-amber-700' : 'text-rose-700');
          const cardBorder = result.passed ? 'border-emerald-200 bg-emerald-50/70' : (isPending ? 'border-amber-300 bg-amber-50/80 shadow-xs' : 'border-slate-200 bg-slate-50/70');
          let retestBadge = '';

          if (!result.passed && !isPending) {
            if (result.retryAvailableAt) {
              const diffMs = new Date(result.retryAvailableAt).getTime() - Date.now();
              if (diffMs > 0) {
                const remainMinutes = Math.ceil(diffMs / 60000);
                const remainSeconds = Math.ceil(diffMs / 1000);
                const timeText = remainSeconds < 60 ? `${remainSeconds}초 남음` : `${remainMinutes}분 남음`;
                retestBadge = `
                  <span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 ml-1 inline-flex items-center gap-1">
                    <i class="fa-solid fa-clock text-[9px]"></i>재시험까지 ${timeText}
                  </span>
                  <button type="button" onclick="App.resetVocabRetryCooldown('${result.studentId}', '${result.setId}', ${result.direction}, '${result.testId || ''}')" class="text-[10px] font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 px-2 py-0.5 rounded-full border border-amber-300 transition shadow-2xs ml-1 inline-flex items-center gap-1 cursor-pointer" title="10분 대기 시간을 즉시 없애고 바로 응시할 수 있게 합니다">
                    <i class="fa-solid fa-bolt text-[9px]"></i>재시험 허용
                  </button>
                `;
              } else {
                retestBadge = `<span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 ml-1 inline-flex items-center gap-1"><i class="fa-solid fa-rotate-right text-[9px]"></i>재시험 응시 가능</span>`;
              }
            } else {
              retestBadge = `<span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 ml-1 inline-flex items-center gap-1"><i class="fa-solid fa-rotate-right text-[9px]"></i>재시험 응시 가능</span>`;
            }
          }

          return `
            <div class="rounded-xl border ${cardBorder} p-3.5 space-y-2">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <p class="font-bold text-slate-900 text-sm">${this.escapeHtml(test?.title || '단어 테스트')}</p>
                    ${isPending ? `<span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">채점 대기</span>` : ''}
                    ${gradedBadge}
                    ${retestBadge}
                  </div>
                  <p class="text-[11px] text-slate-500 mt-0.5">${this.escapeHtml(set?.title || '연결된 단어 세트')} · ${directionLabel}</p>
                </div>
                <div class="flex items-center gap-2">
                  ${canGrade ? `<button type="button" onclick="App.openVocabGradingModal('${result.studentId}', '${result.testId || ''}', ${result.direction}, '${result.completedAt || ''}')" class="text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200 transition flex items-center gap-1 shadow-xs"><i class="fa-solid fa-clipboard-check text-[10px]"></i> ${result.gradedByAdmin ? '다시 채점하기' : '채점하기'}</button>` : ''}
                  <div class="text-right">
                    <p class="text-lg font-black ${statusColor}">${result.score}점</p>
                    <span class="text-[11px] font-bold ${statusColor}">${statusText}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                <span>정답 ${result.correctCount ?? '-'} / ${result.total ?? '-'}문제</span>
                <span>·</span>
                <span>${attemptCount}회 응시</span>
                <span>·</span>
                <span>${completedTime}</span>
              </div>
              ${wrongAnswers.length ? `
                <details class="text-xs pt-1">
                  <summary class="cursor-pointer font-bold text-rose-600">오답 ${wrongAnswers.length}개 보기</summary>
                  <div class="mt-2 space-y-1.5">
                    ${wrongAnswers.map((wrong, index) => `
                      <div class="rounded-lg bg-white/80 p-2 border border-rose-100">
                        <strong>${index + 1}. ${this.escapeHtml(wrong.question)}</strong><br>
                        <span class="text-rose-600">학생 답: ${this.escapeHtml(wrong.answer)}</span><br>
                        <span class="text-emerald-700">정답: ${this.escapeHtml(wrong.correct)}</span>
                      </div>`).join('')}
                  </div>
                </details>` : '<p class="text-xs font-semibold text-emerald-700">오답 없음</p>'}
            </div>`;
        }).join('');

        return `
          <div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gradient-to-b from-slate-300 to-slate-400 text-white flex items-center justify-center flex-shrink-0">
                <i class="fa-solid fa-user"></i>
              </div>
              <div>
                <p class="font-extrabold text-slate-900">${this.escapeHtml(student.name)}</p>
                <p class="text-[11px] text-slate-400">학생 #${student.id}</p>
              </div>
            </div>
            <div class="space-y-2">${resultHtml}</div>
          </div>`;
      }).filter(Boolean).join('');

      resultsSectionHtml = `
        <!-- ================= 단어 테스트 결과 캘린더 ================= -->
        <div class="glass-card rounded-2xl p-5 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 class="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <i class="fa-solid fa-calendar-days text-indigo-600"></i>
                <span>단어 테스트 결과 캘린더</span>
                <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">${dates.length}개 시험일</span>
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">캘린더에서 시험 날짜를 선택하여 각 학생의 결과 확인 및 채점을 진행하세요.</p>
            </div>

            <!-- 월 이동 네비게이션 컨트롤 -->
            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 shadow-2xs">
                <button type="button" onclick="App.prevAdminVocabMonth()" class="w-8 h-8 rounded-lg hover:bg-white text-slate-700 flex items-center justify-center text-xs transition cursor-pointer" title="이전 달">
                  <i class="fa-solid fa-chevron-left"></i>
                </button>
                <span class="text-xs sm:text-sm font-black text-slate-800 px-3 min-w-[95px] text-center">
                  ${calMonthTitle}
                </span>
                <button type="button" onclick="App.nextAdminVocabMonth()" class="w-8 h-8 rounded-lg hover:bg-white text-slate-700 flex items-center justify-center text-xs transition cursor-pointer" title="다음 달">
                  <i class="fa-solid fa-chevron-right"></i>
                </button>
              </div>
              <button type="button" onclick="App.setAdminVocabMonthToday()" class="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition border border-indigo-200 cursor-pointer shadow-2xs">
                오늘
              </button>
            </div>
          </div>

          <!-- 요일 헤더 (일 ~ 토) -->
          <div class="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[11px] font-black text-slate-400 py-1 border-b border-slate-100">
            <div class="text-rose-500">일</div>
            <div>월</div>
            <div>화</div>
            <div>수</div>
            <div>목</div>
            <div>금</div>
            <div class="text-indigo-500">토</div>
          </div>

          <!-- 월간 7열 캘린더 그리드 -->
          <div class="grid grid-cols-7 gap-1.5 sm:gap-2">
            ${calendarGridHtml}
          </div>

          <!-- 범례 및 최근 시험일 바로가기 -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between flex-wrap gap-2 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            <div class="flex items-center gap-3 flex-wrap">
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>선택된 날짜</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>응시 완료</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>채점 대기</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-400"></span>재시험</span>
            </div>
            ${recentTestJumpButtonsHtml}
          </div>
        </div>

        <!-- ================= 선택된 날짜 상세 결과 & 채점 ================= -->
        <div class="glass-card rounded-2xl p-5 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <p class="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                <i class="fa-solid fa-calendar-check text-[11px]"></i>
                <span>선택한 시험 날짜</span>
              </p>
              <h3 class="text-lg sm:text-xl font-black text-slate-900 mt-0.5">${this.formatVocabResultDateLong(selectedDate)}</h3>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 shadow-2xs">
                ${selectedResults.length}건 응시
              </span>
              <button type="button" onclick="App.jumpAdminVocabTestDate(-1)" class="px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition flex items-center gap-1 cursor-pointer shadow-2xs" title="이전 시험일로 이동">
                <i class="fa-solid fa-chevron-left text-[10px]"></i> 이전 시험일
              </button>
              <button type="button" onclick="App.jumpAdminVocabTestDate(1)" class="px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition flex items-center gap-1 cursor-pointer shadow-2xs" title="다음 시험일로 이동">
                다음 시험일 <i class="fa-solid fa-chevron-right text-[10px]"></i>
              </button>
            </div>
          </div>
          ${studentCards || `
            <div class="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center text-slate-400">
              <i class="fa-solid fa-user-clock text-3xl mb-2 opacity-30"></i>
              <p class="text-sm font-semibold text-slate-600">이 날짜에는 표시할 학생 결과가 없습니다.</p>
              <p class="text-xs text-slate-400 mt-1">캘린더에서 시험이 등록되었거나 응시 완료된 날짜를 클릭하면 학생들의 상세 결과와 채점 버튼이 표시됩니다.</p>
            </div>`}
        </div>`;

    container.innerHTML = `
      ${vocabSetsHtml}
      ${resultsSectionHtml}
    `;
  },

  selectVocabResultDate(date) {
    if (!date) return;
    this.state.vocabResultSelectedDate = date;
    const [y, m] = date.split('-').map(Number);
    if (y && m) {
      if (!this.state.adminVocabCalendarMonth) {
        this.state.adminVocabCalendarMonth = new Date(y, m - 1, 1);
      } else {
        this.state.adminVocabCalendarMonth.setFullYear(y);
        this.state.adminVocabCalendarMonth.setMonth(m - 1);
      }
    }
    this.renderAdminVocabTab();
  },

  prevAdminVocabMonth() {
    if (!this.state.adminVocabCalendarMonth) {
      this.state.adminVocabCalendarMonth = new Date();
    }
    this.state.adminVocabCalendarMonth.setMonth(this.state.adminVocabCalendarMonth.getMonth() - 1);
    this.renderAdminVocabTab();
  },

  nextAdminVocabMonth() {
    if (!this.state.adminVocabCalendarMonth) {
      this.state.adminVocabCalendarMonth = new Date();
    }
    this.state.adminVocabCalendarMonth.setMonth(this.state.adminVocabCalendarMonth.getMonth() + 1);
    this.renderAdminVocabTab();
  },

  setAdminVocabMonthToday() {
    const today = new Date();
    this.state.adminVocabCalendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    this.state.vocabResultSelectedDate = this.getTodayDateString();
    this.renderAdminVocabTab();
  },

  jumpAdminVocabTestDate(direction) {
    const results = AppData.getVocabTestResults();
    const tests = AppData.getTests().filter(t => t.type === 'VOCAB');
    const dateSet = new Set();
    tests.forEach(t => { if (t.date) dateSet.add(t.date); });
    results.forEach(r => { const d = this.getVocabResultDate(r); if (d) dateSet.add(d); });
    const dates = Array.from(dateSet).sort();
    if (dates.length === 0) return;

    const current = this.state.vocabResultSelectedDate || dates[dates.length - 1];
    const currentIndex = dates.indexOf(current);
    let targetIndex = -1;

    if (direction < 0) {
      targetIndex = currentIndex > 0 ? currentIndex - 1 : 0;
    } else {
      targetIndex = currentIndex >= 0 && currentIndex < dates.length - 1 ? currentIndex + 1 : dates.length - 1;
    }

    if (targetIndex >= 0 && dates[targetIndex]) {
      this.selectVocabResultDate(dates[targetIndex]);
    }
  },

  getVocabResultDate(result) {
    // 1. 배정된 시험 일정이 있는 경우 해당 시험의 날짜(test.date)를 최우선 기준일로 사용
    if (result?.testId) {
      const test = AppData.getTests().find(item => item.id === result.testId);
      if (test?.date) return test.date;
    }

    // 2. 시험 일정이 없는 자율 테스트의 경우 응시 시작(startedAt) 또는 완료(completedAt) 시점 기준
    const targetTimestamp = result?.startedAt || result?.completedAt;
    if (targetTimestamp) {
      const date = new Date(targetTimestamp);
      if (!Number.isNaN(date.getTime())) {
        return this.formatDate(date);
      }
    }

    return '';
  },

  getVocabResultTimeString(result) {
    const resultTime = result?.startedAt || result?.completedAt;
    if (!resultTime) return '-';
    const resultDateObj = new Date(resultTime);
    if (Number.isNaN(resultDateObj.getTime())) return '-';

    const timeStr = resultDateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const resultTargetDate = this.getVocabResultDate(result);
    const actualDateStr = this.formatDate(resultDateObj);

    if (resultTargetDate && actualDateStr > resultTargetDate) {
      return `다음날 ${timeStr}`;
    }
    return timeStr;
  },

  formatVocabResultDateLong(dateString) {
    const [year, month, day] = String(dateString).split('-').map(Number);
    if (!year || !month || !day) return dateString;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const d = new Date(year, month - 1, day);
    const dayName = dayNames[d.getDay()] || '';
    return `${year}년 ${month}월 ${day}일 (${dayName}요일)`;
  },

  // ── 관리자: 단어 세트 모달 열기 ──────────────────────────
  openVocabSetModal(setId = null, returnToTestForm = false) {
    this.state.vocabSetReturnToTestForm = returnToTestForm;
    document.getElementById('vocabModalTitle').innerText = setId ? '단어 세트 수정' : '새 단어 세트 등록';
    document.getElementById('vocabSetId').value = setId || '';
    document.getElementById('vocabWordRows').innerHTML = '';

    let existingSet = null;
    if (setId) {
      existingSet = AppData.getVocabSets().find(s => s.id === setId);
    }

    // 교재(폴더)명 및 제목
    const defaultBook = (this.state.selectedVocabBookFilter && this.state.selectedVocabBookFilter !== 'ALL')
      ? this.state.selectedVocabBookFilter
      : '워드마스터 수능 2000';
    const bookInput = document.getElementById('vocabSetBook');
    if (bookInput) bookInput.value = existingSet ? (existingSet.book || '기본 단어장') : defaultBook;
    document.getElementById('vocabSetTitle').value = existingSet ? existingSet.title : '';

    // 기존 단어 행 채우기
    if (existingSet && existingSet.words) {
      existingSet.words.forEach(w => this.addVocabWordRow(w.en, w.ko, w.defEn || ''));
    } else {
      // 기본 5개 빈 행
      for (let i = 0; i < 5; i++) this.addVocabWordRow();
    }
    this.updateVocabWordCount();
    this.showModal('vocabSetModal');
  },

  vocabIpaCache: {},

  // 단어 세트의 모든 단어 발음기호를 사전에 병렬 로드하여 렉/지연 완전 제거
  async prefetchVocabPhonetics(words) {
    if (!Array.isArray(words)) return;
    const fetchPromises = words.map(w => {
      const clean = (w.en || '').trim().toLowerCase();
      if (!clean || this.vocabIpaCache[clean] !== undefined) return Promise.resolve();
      return this.fetchWordPhonetic(clean).catch(() => {});
    });
    await Promise.allSettled(fetchPromises);
  },

  async fetchWordPhonetic(word) {
    if (!word) return '';
    const clean = word.trim().toLowerCase();
    if (this.vocabIpaCache[clean] !== undefined) {
      return this.vocabIpaCache[clean];
    }

    // 0순위: 등록된 단어 세트(워드마스터 2000 등) 내 내장된 교재 발음기호(ipa) 직접 조회
    try {
      const allSets = AppData.getVocabSets();
      for (const set of allSets) {
        if (Array.isArray(set.words)) {
          const found = set.words.find(w => (w.en || '').trim().toLowerCase() === clean);
          if (found && (found.ipa || found.phonetic)) {
            const direct = (found.ipa || found.phonetic).trim();
            this.vocabIpaCache[clean] = direct;
            return direct;
          }
        }
      }
    } catch (e) {}

    // 1차: Free Dictionary API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        let ipa = '';
        if (Array.isArray(data) && data[0]) {
          if (data[0].phonetic) {
            ipa = data[0].phonetic;
          } else if (Array.isArray(data[0].phonetics)) {
            const p = data[0].phonetics.find(item => item.text && item.text.trim());
            if (p) ipa = p.text;
          }
        }
        if (ipa) {
          const formatted = ipa.startsWith('[') || ipa.startsWith('/') ? ipa : `[${ipa}]`;
          this.vocabIpaCache[clean] = formatted;
          return formatted;
        }
      }
    } catch (e) {
      // 1차 실패 시 2차 시도
    }

    // 2차: Datamuse IPA API (초고속 사전 발음기호 DB)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(clean)}&qe=sp&md=r&ipa=1&max=1`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data[0] && data[0].tags) {
          const ipaTag = data[0].tags.find(t => t.startsWith('ipa_pron:'));
          if (ipaTag) {
            const rawIpa = ipaTag.replace('ipa_pron:', '').trim();
            if (rawIpa) {
              const formatted = `[${rawIpa}]`;
              this.vocabIpaCache[clean] = formatted;
              return formatted;
            }
          }
        }
      }
    } catch (e) {
      // 2차 실패
    }

    // Fallback: 단어 정답 유출 방지 (발음 듣기 유도)
    const fallback = `[발음 듣기]`;
    this.vocabIpaCache[clean] = fallback;
    return fallback;
  },

  closeVocabSetModal() {
    this.hideModal('vocabSetModal');
  },

  addVocabWordRow(enVal = '', koVal = '', defEnVal = '') {
    const container = document.getElementById('vocabWordRows');
    const idx = Date.now() + Math.random();
    const div = document.createElement('div');
    div.className = 'grid grid-cols-[1fr_1fr_1.5fr_auto_auto] gap-1.5 items-center vocab-word-row';
    div.innerHTML = `
      <input type="text" placeholder="영어 단어" value="${this.escapeHtml(enVal)}" class="vocab-en py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-xs" oninput="App.updateVocabWordCount()" />
      <input type="text" placeholder="한국어 뜻" value="${this.escapeHtml(koVal)}" class="vocab-ko py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-xs" />
      <input type="text" placeholder="영영풀이 (선택)" value="${this.escapeHtml(defEnVal)}" class="vocab-def-en py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 text-xs" />
      <button type="button" onclick="App.playDictionaryAudio(this.closest('.vocab-word-row').querySelector('.vocab-en').value)" class="w-7 h-7 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 flex items-center justify-center transition text-xs" title="발음 듣기">
        <i class="fa-solid fa-volume-high"></i>
      </button>
      <button type="button" onclick="this.closest('.vocab-word-row').remove(); App.updateVocabWordCount();" class="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition text-sm" title="삭제">
        <i class="fa-solid fa-xmark"></i>
      </button>`;
    container.appendChild(div);
    this.updateVocabWordCount();
  },

  updateVocabWordCount() {
    const rows = document.querySelectorAll('.vocab-word-row');
    const filled = Array.from(rows).filter(r => r.querySelector('.vocab-en').value.trim()).length;
    const el = document.getElementById('vocabWordCount');
    if (el) el.innerText = `(${filled}개)`;
  },

  async handleSaveVocabSet() {
    const setId = document.getElementById('vocabSetId').value.trim();
    const book = (document.getElementById('vocabSetBook')?.value || '기본 단어장').trim();
    const title = document.getElementById('vocabSetTitle').value.trim();
    if (!title) { this.toast('세트 제목을 입력해주세요.', 'error'); return; }

    const rows = document.querySelectorAll('.vocab-word-row');
    const words = Array.from(rows)
      .map(r => {
        const en = r.querySelector('.vocab-en').value.trim();
        const ko = r.querySelector('.vocab-ko').value.trim();
        const defEn = r.querySelector('.vocab-def-en')?.value.trim() || '';
        return { en, ko, ...(defEn ? { defEn } : {}) };
      })
      .filter(w => w.en && w.ko);

    if (words.length < 5) { this.toast('5지선다 시험을 위해 단어를 최소 5개 입력해주세요.', 'error'); return; }

    let savedSet;
    try {
      savedSet = await AppData.saveOrUpdateVocabSet({ id: setId || undefined, book, title, studentIds: [], words, createdAt: new Date().toISOString().split('T')[0] });
    } catch (error) {
      console.error(error);
      return;
    }
    this.closeVocabSetModal();
    this.toast(`'[${book}] ${title}' 세트가 저장되었습니다! (${words.length}개 단어)`, 'success');
    if (this.state.vocabSetReturnToTestForm) {
      const currentSet2 = document.getElementById('formVocabSetId2')?.value || '';
      this.renderFormVocabSetSelect(savedSet.id, currentSet2);
      this.state.vocabSetReturnToTestForm = false;
    } else {
      this.renderAdminVocabTab();
    }
  },

  async confirmDeleteVocabSet(setId) {
    const set = AppData.getVocabSets().find(s => s.id === setId);
    if (!set) return;
    if (confirm(`'${set.title}' 단어 세트를 삭제하시겠습니까?`)) {
      try {
        await AppData.deleteVocabSet(setId);
        this.toast('단어 세트가 삭제되었습니다.', 'info');
        this.renderAdminVocabTab();
      } catch (error) {
        console.error(error);
      }
    }
  },

  // ── 학생 대시보드: 단어 테스트 섹션 렌더링 ──────────────
  renderStudentVocabSection(studentId) {
    const sets = AppData.getVocabSetsByStudentId(studentId);
    if (sets.length === 0) return '';
    return `
      <div class="glass-card rounded-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-900 flex items-center gap-2">
          <i class="fa-solid fa-spell-check text-indigo-600"></i>
          단어 테스트
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${sets.map(set => {
            const bookName = (set.book || '기본 단어장').trim();


            return `
            <div class="p-4 rounded-2xl ${'border border-indigo-100 bg-white/90 shadow-2xs'} flex flex-col gap-3">
              <div>
                <div class="flex items-center gap-1.5 flex-wrap mb-1">
                  <span class="text-[10px] font-bold ${'text-indigo-700 bg-indigo-50 border border-indigo-200/80'} px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                    <i class="fa-solid fa-folder text-[9px] ${'text-amber-500'}"></i> ${this.escapeHtml(bookName)}
                  </span>
                  ${''}
                </div>
                <p class="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <i class="fa-solid ${'fa-file-lines text-indigo-500'} text-xs"></i>
                  <span class="${''}">${this.escapeHtml(set.title)}</span>
                </p>
                <div class="flex items-center justify-between gap-2 mt-0.5">
                  <p class="text-xs ${'text-slate-500'}">${set.words.length}개 단어 · 객관식, 스펠링, 통합</p>
                  <button type="button" onclick="App.openVocabStudyModal('${set.id}')" class="px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer">
                    <i class="fa-solid fa-book-open text-[11px]"></i>
                    <span>단어장 보기</span>
                  </button>
                </div>
              </div>
              <div class="pace-schedule-stages grid gap-2.5">
                ${this.renderVocabTestButton(set, studentId, 2, '객관식', 'bg-violet-600 hover:bg-violet-700 shadow-violet-200')}
                ${this.renderVocabTestButton(set, studentId, 3, '스펠링', 'bg-blue-600 hover:bg-blue-700 shadow-blue-200')}
                ${this.renderVocabTestButton(set, studentId, 4, '통합', 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  },

  isVocabTestUnlocked(studentId, setId, direction, testId = null) {
    const dir = Number(direction);
    const test = testId ? AppData.getTests().find(test => String(test.id) === String(testId)) : null;
    const directions = AppData.getVocabDirections(test);
    const index = directions.indexOf(dir);
    if (index > 0) {
      const previous = directions[index - 1];
      const prevResult = AppData.getVocabTestResult(studentId, setId, previous, testId);
      if (!prevResult?.passed) return { unlocked: false, requiredLabel: this.getVocabDirectionLabel(previous) };
    }
    return { unlocked: true };
  },

  renderVocabTestButton(set, studentId, direction, label, colorClass, testId = null) {
    let scheduledTest = testId ? AppData.getTests().find(test => String(test.id) === String(testId)) : null;
    if (!scheduledTest && studentId && set?.id) {
      const matchingTests = AppData.getTests().filter(test =>
        Number(test.studentId) === Number(studentId) &&
        test.type === 'VOCAB' &&
        (test.vocabSetId === set.id || (Array.isArray(test.vocabSetIds) && test.vocabSetIds.includes(set.id)))
      );
      if (matchingTests.length > 0) {
        scheduledTest = matchingTests.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      }
    }
    const effectiveTestId = scheduledTest ? scheduledTest.id : testId;
    if (scheduledTest && !AppData.getVocabDirections(scheduledTest).includes(Number(direction))) return '';
    let result = AppData.getVocabTestResult(studentId, set.id, direction, effectiveTestId);
    if (!result && scheduledTest && testId !== scheduledTest.id) {
      result = AppData.getVocabTestResult(studentId, set.id, direction, scheduledTest.id);
    }

    const testOrSet = scheduledTest || set;

    // 1. 통과 완료 상태
    if (result?.passed) {
      const passedCutoff = result.cutoffScore || this.getBaseVocabCutoffScore(testOrSet, direction);
      return `
        <div class="pace-vocab-card is-passed h-full rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 flex flex-col justify-between gap-2.5 shadow-2xs">
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-1.5 min-w-0">
              <span class="text-xs font-black text-emerald-950 truncate">${label}</span>
            </div>
            <div class="text-[11px] text-emerald-800 font-semibold flex items-center justify-between gap-1 min-w-0">
              <span class="truncate">취득 점수</span>
              <span class="text-emerald-700 font-bold whitespace-nowrap flex-shrink-0">${result.score}점 (컷 ${passedCutoff}점)</span>
            </div>
          </div>
          <div class="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap overflow-hidden">
            <i class="fa-solid fa-circle-check text-[11px]"></i>
            <span class="truncate">통과 완료</span>
          </div>
        </div>`;
    }

    // 2. 미통과/재시험 상태일 때만 다음 회차 커트라인 계산
    const attemptCount = this.getVocabAttemptCount(studentId, set.id, direction, effectiveTestId);
    const nextRound = attemptCount + 1;
    const cutoffScore = this.getVocabCutoffScore(testOrSet, direction, nextRound);

    // 3. 순차 잠금 검사 (객관식 통과 -> 스펠링 통과 -> 통합)
    const unlockCheck = this.isVocabTestUnlocked(studentId, set.id, direction, effectiveTestId);
    if (!unlockCheck.unlocked) {
      return `
        <div class="pace-vocab-card h-full rounded-2xl border border-slate-200 bg-slate-50/70 p-3 flex flex-col justify-between gap-2.5 shadow-2xs opacity-85">
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-1.5 min-w-0">
              <span class="text-xs font-black text-slate-500 truncate">${label}</span>
              <span class="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 whitespace-nowrap flex-shrink-0">
                단계 잠김
              </span>
            </div>
            <div class="text-[11px] text-slate-500 font-medium flex items-center justify-between gap-1 min-w-0">
              <span class="truncate">선행 조건</span>
              <span class="text-slate-600 font-bold whitespace-nowrap flex-shrink-0">${unlockCheck.requiredLabel} 통과 필요</span>
            </div>
          </div>
          <button type="button" onclick="App.toast('이전 단계인 \\'${unlockCheck.requiredLabel}\\' 시험을 먼저 통과해야 합니다.', 'info')" class="w-full py-2.5 rounded-xl bg-slate-200/90 hover:bg-slate-300/80 text-slate-600 text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden">
            <i class="fa-solid fa-lock text-[11px] text-slate-400"></i>
            <span class="truncate">${unlockCheck.requiredLabel} 통과 후 가능</span>
          </button>
        </div>`;
    }

    // 4. 주관식 채점 대기중 상태
    if (result?.direction === 4 && result?.waitingGrading && !result?.gradedByAdmin) {
      return `
        <div class="pace-vocab-card h-full rounded-2xl border border-amber-300 bg-amber-50/80 p-3 flex flex-col justify-between gap-2.5 shadow-2xs">
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-1.5 min-w-0">
              <span class="text-xs font-black text-amber-950 truncate">${label}</span>
              <span class="text-[10px] font-bold text-amber-800 bg-white/90 px-2 py-0.5 rounded-full border border-amber-200 whitespace-nowrap flex-shrink-0">
                채점 대기
              </span>
            </div>
            <div class="text-[11px] text-amber-800 font-semibold flex items-center justify-between gap-1 min-w-0">
              <span class="truncate">스펠링 점수</span>
              <span class="font-bold whitespace-nowrap flex-shrink-0">${result.spellingScore ?? result.score}점 (컷 ${cutoffScore}점)</span>
            </div>
          </div>
          <div class="w-full py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap overflow-hidden">
            <i class="fa-solid fa-hourglass-half text-amber-100 animate-pulse text-[11px]"></i>
            <span class="truncate">채점 대기중</span>
          </div>
        </div>`;
    }

    // 5. 10분 재응시 대기 중 (불합격 - 쿨다운 진행 중)
    if (result && result.retryAvailableAt && new Date(result.retryAvailableAt) > new Date()) {
      return `
        <div class="pace-vocab-card h-full rounded-2xl border border-slate-200 bg-slate-50/70 p-3 flex flex-col justify-between gap-2.5 shadow-2xs">
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-1.5 min-w-0">
              <span class="text-xs font-black text-slate-700 truncate">${label}</span>
              <span class="text-[10px] font-extrabold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs whitespace-nowrap flex-shrink-0">
                재응시
              </span>
            </div>
            <div class="text-[11px] text-slate-500 font-semibold flex items-center justify-between gap-1 min-w-0">
              <span class="truncate">재시험까지</span>
              <span id="vocabRetryCountdown" data-retry-until="${this.escapeHtml(result.retryAvailableAt)}" class="text-indigo-600 font-bold whitespace-nowrap flex-shrink-0"></span>
            </div>
          </div>
          <div class="space-y-1.5 pt-0.5">
            <button disabled class="w-full py-2.5 rounded-xl bg-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center gap-1.5 cursor-not-allowed shadow-inner whitespace-nowrap overflow-hidden">
              <i class="fa-solid fa-clock text-[11px]"></i>
              <span class="truncate">재시험 대기</span>
            </button>
            ${this.state.isAdminLoggedIn ? `
              <button type="button" onclick="App.resetVocabRetryCooldown('${studentId}', '${set.id}', ${direction}, ${effectiveTestId ? `'${effectiveTestId}'` : 'null'})" class="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition flex items-center justify-center gap-1 shadow-2xs whitespace-nowrap overflow-hidden">
                <i class="fa-solid fa-bolt text-[10px]"></i> <span class="truncate">대기시간 즉시 해제</span>
              </button>
            ` : ''}
          </div>
        </div>`;
    }

    // 6. 시험 시간 불가 (종료 / 시작 전)
    const timeStatus = scheduledTest && this.getTestTimeStatus(scheduledTest);
    if (scheduledTest && !timeStatus.canStart) {
      const unavailableLabel = timeStatus.status === 'EXPIRED'
        ? '응시 기한 종료'
        : (timeStatus.status === 'NOT_STARTED' ? '응시 시작 전' : '응시 불가');
      return `
        <div class="pace-vocab-card h-full rounded-2xl border border-slate-200 bg-slate-50/80 p-3 flex flex-col justify-between gap-2.5">
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-1.5 min-w-0">
              <span class="text-xs font-black text-slate-600 truncate">${label}</span>
              <span class="text-[10px] font-bold text-slate-400 bg-white border-slate-200 px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0">
                ${timeStatus.status === 'EXPIRED' ? '기한 만료' : '응시 불가'}
              </span>
            </div>
            <div class="text-[11px] text-slate-500 font-medium flex items-center justify-between gap-1 min-w-0">
              <span class="truncate">${timeStatus.status === 'EXPIRED' ? '응시 기한 마감' : '시험 예정'}</span>
              <span class="text-slate-600 font-bold whitespace-nowrap flex-shrink-0">커트라인 ${cutoffScore}점</span>
            </div>
          </div>
          <button onclick="App.notifyUnavailableVocabTest('${timeStatus.status}')" class="w-full py-2.5 rounded-xl bg-slate-200 text-slate-500 text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden">
            <i class="fa-solid fa-lock text-[11px]"></i>
            <span class="truncate">${unavailableLabel}</span>
          </button>
        </div>`;
    }

    // 7. 응시 가능 상태 (최초 응시 또는 쿨다운 종료 후 재시험 응시)
    const isRetest = Boolean(result && !result.passed);
    const buttonText = isRetest ? `${nextRound}회차 재시험` : '테스트 시작';
    const buttonIcon = isRetest ? 'fa-rotate-right' : 'fa-play';
    const targetTestId = effectiveTestId ? `'${effectiveTestId}'` : 'null';
    return `
      <div class="pace-vocab-card h-full rounded-2xl border border-slate-200/90 bg-white p-3 flex flex-col justify-between gap-2.5 shadow-xs hover:border-indigo-300 hover:shadow-sm transition group">
        <div class="space-y-1">
          <div class="flex items-center justify-between gap-1.5 min-w-0">
            <span class="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition truncate">${label}</span>
            ${isRetest ? `
              <span class="text-[10px] font-extrabold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs whitespace-nowrap flex-shrink-0">
                재응시
              </span>
            ` : `
              <span class="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                1회차
              </span>
            `}
          </div>
          <div class="text-[11px] ${isRetest ? 'text-slate-600 font-semibold' : 'text-slate-500 font-medium'} flex items-center justify-between gap-1 min-w-0">
            <span class="truncate">${isRetest ? `${nextRound}회차 재응시` : '통과 기준'}</span>
            <span class="text-indigo-600 font-bold whitespace-nowrap flex-shrink-0">커트라인 ${cutoffScore}점</span>
          </div>
        </div>
        <button onclick="App.startVocabTest('${set.id}', ${studentId}, ${direction}, ${targetTestId})" class="w-full py-2.5 rounded-xl ${colorClass} text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap overflow-hidden">
          <i class="fa-solid ${buttonIcon} text-[11px]"></i>
          <span class="truncate">${buttonText}</span>
        </button>
      </div>`;
  },

  notifyExpiredVocabTest() {
    this.toast('응시 시간이 종료되었습니다. 단어장은 계속 확인할 수 있습니다.', 'info');
  },

  notifyUnavailableVocabTest(status) {
    if (status === 'EXPIRED') {
      this.notifyExpiredVocabTest();
      return;
    }
    if (status === 'NOT_STARTED') {
      this.toast('아직 응시 시작 시간이 아닙니다.', 'info');
      return;
    }
    this.toast('이미 완료되어 응시할 수 없습니다.', 'info');
  },

  // ========================================================
  // 단어장 크게 보기 전용 학습 모달 (Vocab Study Modal)
  // ========================================================
  openVocabStudyModal(setId, testId = null) {
    const allSets = AppData.getVocabSets();
    let words = [];
    let title = '';
    let bookName = '';


    // 1. testId가 전달된 경우 해당 시험 정보 우선 파싱
    if (testId) {
      const scheduledTest = AppData.getTests().find(t => t.id === testId);
      if (scheduledTest) {


        const setIds = Array.isArray(scheduledTest.vocabSetIds) && scheduledTest.vocabSetIds.length > 0
          ? scheduledTest.vocabSetIds
          : (scheduledTest.vocabSetId ? [scheduledTest.vocabSetId] : []);

        const matchingSets = setIds.map(id => allSets.find(s => s.id === id)).filter(Boolean);
        if (matchingSets.length > 0) {
          matchingSets.forEach(s => {
            if (Array.isArray(s.words)) words.push(...s.words);
          });
          bookName = matchingSets[0]?.book || '기본 단어장';
          title = matchingSets.map(s => s.title).join(' + ');
        }
      }
    }

    // 2. setId로 추가 보완 (쉼표로 구분된 다중 세트 지원)
    if (words.length === 0 && setId) {
      const idList = String(setId).split(',').map(s => s.trim()).filter(Boolean);
      const matchingSets = idList.map(id => allSets.find(s => s.id === id)).filter(Boolean);
      if (matchingSets.length > 0) {
        matchingSets.forEach(s => {
          if (Array.isArray(s.words)) words.push(...s.words);
        });
        bookName = matchingSets[0]?.book || '기본 단어장';
        title = matchingSets.map(s => s.title).join(' + ');
      } else {
        if (typeof WORDMASTER_2000_SETS !== 'undefined' && Array.isArray(WORDMASTER_2000_SETS) && WORDMASTER_2000_SETS.some(s => idList.includes(s.id))) {
          const wmMatches = WORDMASTER_2000_SETS.filter(s => idList.includes(s.id));
          if (wmMatches.length > 0) {
            wmMatches.forEach(s => {
              if (Array.isArray(s.words)) words.push(...s.words);
            });
            bookName = wmMatches[0]?.book || '워드마스터 수능 2000';
            title = wmMatches.map(s => s.title).join(' + ');
          }
        } else if (typeof WORDMASTER_BASIC_SETS !== 'undefined' && Array.isArray(WORDMASTER_BASIC_SETS) && WORDMASTER_BASIC_SETS.some(s => idList.includes(s.id))) {
          const wmBasicMatches = WORDMASTER_BASIC_SETS.filter(s => idList.includes(s.id));
          if (wmBasicMatches.length > 0) {
            wmBasicMatches.forEach(s => {
              if (Array.isArray(s.words)) words.push(...s.words);
            });
            bookName = wmBasicMatches[0]?.book || '워드마스터 고등 Basic';
            title = wmBasicMatches.map(s => s.title).join(' + ');
          }
        } else if (typeof WORDMASTER_HIGHEST_SETS !== 'undefined' && Array.isArray(WORDMASTER_HIGHEST_SETS) && WORDMASTER_HIGHEST_SETS.some(s => idList.includes(s.id))) {
          const wmHighestMatches = WORDMASTER_HIGHEST_SETS.filter(s => idList.includes(s.id));
          wmHighestMatches.forEach(s => {
            if (Array.isArray(s.words)) words.push(...s.words);
          });
          bookName = wmHighestMatches[0]?.book || '워드마스터 하이스트';
          title = wmHighestMatches.map(s => s.title).join(' + ');
        }
      }
    }

    if (words.length === 0) {
      this.toast('단어 목록을 불러올 수 없습니다.', 'error');
      return;
    }

    // 모달 출처(원래 열려있던 시험 상세 모달) 기억
    const detailModal = document.getElementById('testDetailModal');
    if (detailModal && !detailModal.classList.contains('hidden')) {
      this._vocabStudyOriginTestId = testId;
      this.hideModal('testDetailModal');
    } else {
      this._vocabStudyOriginTestId = testId || null;
    }

    // 포맷된 깔끔한 제목 생성
    const rawTitle = (bookName && bookName !== '기본 단어장') ? `[${bookName}] ${title}` : title;
    const cleanTitle = this.formatCleanVocabTitle(rawTitle);

    this.state.vocabStudy = {
      allWords: words,
      words: [...words],
      title: cleanTitle || title || '단어장',
      bookName: bookName || '기본 단어장',
      originTestId: this._vocabStudyOriginTestId,
      setId,

      meaningHidden: false,
      revealedIndices: new Set(),
      viewMode: 'list', // 'list' (목록형 기본) | 'card' (플래시카드 암기학습)
      flashcardDeck: [...words],
      cardIndex: 0,
      round: 1,
      unknownWords: [],
      knownWords: [],
      isRoundFinished: false,
      isMasteryFinished: false,
      isCardFlipped: false,
      searchQuery: ''
    };

    // UI 헤더 및 검색창 초기화
    const titleEl = document.getElementById('vocabStudyTitle');
    const badgeEl = document.getElementById('vocabStudyBadge');
    const countBadgeEl = document.getElementById('vocabStudyCountBadge');
    const searchInput = document.getElementById('vocabStudySearchInput');

    if (titleEl) titleEl.innerText = this.state.vocabStudy.title;
    if (badgeEl) badgeEl.innerText = bookName || '단어장 학습';
    if (countBadgeEl) countBadgeEl.innerText = `총 ${words.length}단어`;
    if (searchInput) searchInput.value = '';

    this.updateVocabStudyMeaningToggleBtn();
    this.updateVocabStudyModeButtons();
    this.renderVocabStudyContent();
    this.renderVocabStudyFooter();

    this.showModal('vocabStudyModal');
  },

  closeVocabStudyModal() {
    this.hideModal('vocabStudyModal');
    const originTestId = this._vocabStudyOriginTestId;
    this._vocabStudyOriginTestId = null;

    // 시험 창에서 열었던 경우 원래 시험 상세 창으로 자연스럽게 복귀
    if (originTestId) {
      setTimeout(() => {
        this.openVocabTestScheduleModal(originTestId);
      }, 150);
    }
  },

  toggleVocabStudyMeaningHidden() {
    if (!this.state.vocabStudy) return;
    this.state.vocabStudy.meaningHidden = !this.state.vocabStudy.meaningHidden;
    this.state.vocabStudy.revealedIndices.clear();
    this.updateVocabStudyMeaningToggleBtn();
    this.renderVocabStudyContent();
  },

  updateVocabStudyMeaningToggleBtn() {
    const vs = this.state.vocabStudy;
    const btn = document.getElementById('vocabStudyMeaningToggleBtn');
    const icon = document.getElementById('vocabStudyMeaningToggleIcon');
    const text = document.getElementById('vocabStudyMeaningToggleText');
    if (!btn || !vs) return;

    if (vs.meaningHidden) {
      btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-indigo-600 border border-indigo-600 text-white shadow-xs cursor-pointer';
      if (icon) icon.className = 'fa-solid fa-eye text-indigo-100';
      if (text) text.innerText = '뜻 함께 보기';
    } else {
      btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs cursor-pointer';
      if (icon) icon.className = 'fa-solid fa-eye-slash text-indigo-600';
      if (text) text.innerText = '단어만 보기 (뜻 가리기)';
    }
  },

  setVocabStudyViewMode(mode) {
    if (!this.state.vocabStudy) return;
    this.state.vocabStudy.viewMode = mode;
    if (mode === 'card') {
      if (!this.state.vocabStudy.flashcardDeck || this.state.vocabStudy.flashcardDeck.length === 0) {
        this.vocabStudyRestartMastery();
      }
    }
    this.updateVocabStudyModeButtons();
    this.renderVocabStudyContent();
    this.renderVocabStudyFooter();
  },

  updateVocabStudyModeButtons() {
    const vs = this.state.vocabStudy;
    const listBtn = document.getElementById('vocabStudyModeListBtn');
    const cardBtn = document.getElementById('vocabStudyModeCardBtn');
    const searchWrap = document.getElementById('vocabStudySearchInput')?.parentElement;
    const meaningToggleBtn = document.getElementById('vocabStudyMeaningToggleBtn');
    if (!vs) return;

    const activeCls = 'px-2.5 py-1 rounded-lg transition bg-white text-indigo-700 shadow-xs flex items-center gap-1 cursor-pointer';
    const inactiveCls = 'px-2.5 py-1 rounded-lg transition text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer';

    if (listBtn) listBtn.className = vs.viewMode === 'list' ? activeCls : inactiveCls;
    if (cardBtn) cardBtn.className = vs.viewMode === 'card' ? activeCls : inactiveCls;

    if (searchWrap) {
      if (vs.viewMode === 'card') searchWrap.classList.add('hidden');
      else searchWrap.classList.remove('hidden');
    }
    if (meaningToggleBtn) {
      if (vs.viewMode === 'card') meaningToggleBtn.classList.add('hidden');
      else meaningToggleBtn.classList.remove('hidden');
    }
  },

  vocabStudyFlipCard() {
    const vs = this.state.vocabStudy;
    if (!vs) return;
    vs.isCardFlipped = !vs.isCardFlipped;
    this.renderVocabStudyContent();
  },

  vocabStudyMarkWord(isKnown) {
    const vs = this.state.vocabStudy;
    if (!vs || !vs.flashcardDeck || vs.flashcardDeck.length === 0) return;
    if (vs.isRoundFinished || vs.isMasteryFinished) return;

    const currentWord = vs.flashcardDeck[vs.cardIndex];
    if (!currentWord) return;

    if (isKnown) {
      vs.knownWords.push(currentWord);
    } else {
      vs.unknownWords.push(currentWord);
    }

    vs.isCardFlipped = false;

    if (vs.cardIndex + 1 < vs.flashcardDeck.length) {
      vs.cardIndex += 1;
    } else {
      // 해당 회차의 모든 단어 분류 완료!
      if (vs.unknownWords.length === 0) {
        // 모르는 단어 0개 달성 -> 완벽 암기 완료!
        vs.isMasteryFinished = true;
      } else {
        // 모르는 단어가 남음 -> 회차 종료 화면 표시
        vs.isRoundFinished = true;
      }
    }

    this.renderVocabStudyContent();
    this.renderVocabStudyFooter();
  },

  vocabStudyStartNextRound() {
    const vs = this.state.vocabStudy;
    if (!vs || !vs.unknownWords || vs.unknownWords.length === 0) return;

    vs.flashcardDeck = [...vs.unknownWords];
    vs.unknownWords = [];
    vs.knownWords = [];
    vs.cardIndex = 0;
    vs.round += 1;
    vs.isRoundFinished = false;
    vs.isMasteryFinished = false;
    vs.isCardFlipped = false;

    this.renderVocabStudyContent();
    this.renderVocabStudyFooter();
  },

  vocabStudyRestartMastery() {
    const vs = this.state.vocabStudy;
    if (!vs) return;

    const baseWords = (vs.words && vs.words.length > 0) ? vs.words : vs.allWords;
    vs.flashcardDeck = [...baseWords];
    vs.unknownWords = [];
    vs.knownWords = [];
    vs.cardIndex = 0;
    vs.round = 1;
    vs.isRoundFinished = false;
    vs.isMasteryFinished = false;
    vs.isCardFlipped = false;

    this.renderVocabStudyContent();
    this.renderVocabStudyFooter();
  },

  filterVocabStudyWords(query) {
    if (!this.state.vocabStudy) return;
    const q = (query || '').trim().toLowerCase();
    this.state.vocabStudy.searchQuery = q;

    if (!q) {
      this.state.vocabStudy.words = [...this.state.vocabStudy.allWords];
    } else {
      this.state.vocabStudy.words = this.state.vocabStudy.allWords.filter(w => {
        const en = (w.en || '').toLowerCase();
        const ko = (w.ko || '').toLowerCase();
        const baseKo = (w.baseKo || '').toLowerCase();
        const mockKo = (w.mockKo || '').toLowerCase();
        return en.includes(q) || ko.includes(q) || baseKo.includes(q) || mockKo.includes(q);
      });
    }
    this.renderVocabStudyContent();
  },

  toggleVocabStudyWordReveal(index) {
    if (!this.state.vocabStudy) return;
    if (this.state.vocabStudy.revealedIndices.has(index)) {
      this.state.vocabStudy.revealedIndices.delete(index);
    } else {
      this.state.vocabStudy.revealedIndices.add(index);
    }
    this.renderVocabStudyContent();
  },

  renderVocabStudyContent() {
    const vs = this.state.vocabStudy;
    const container = document.getElementById('vocabStudyModalBody');
    if (!container || !vs) return;

    if (vs.words.length === 0) {
      container.innerHTML = `
        <div class="p-12 text-center text-slate-400 space-y-2">
          <i class="fa-solid fa-magnifying-glass text-3xl mb-1 text-slate-300"></i>
          <p class="text-sm font-bold text-slate-600">검색 조건과 일치하는 단어가 없습니다.</p>
          <p class="text-xs text-slate-400">검색어를 지우거나 다른 검색어를 입력해보세요.</p>
        </div>`;
      return;
    }

    // ── 뷰 모드 1: 목록형 크게 보기 ────────────────────────
    if (vs.viewMode === 'list') {
      container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          ${vs.words.map((word, index) => {
            const isRevealed = vs.revealedIndices.has(index);
            const isHidden = vs.meaningHidden && !isRevealed;


            return `
              <div class="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:shadow-md transition flex flex-col justify-between gap-3 group">
                <div class="space-y-2">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-baseline gap-2.5 flex-wrap min-w-0">
                      <span class="text-xs font-black text-indigo-500 font-mono">#${String(index + 1).padStart(2, '0')}</span>
                      <strong class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight break-words select-text">${this.escapeHtml(word.en)}</strong>
                      ${word.ipa ? `<span class="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60">${this.escapeHtml(word.ipa)}</span>` : ''}
                    </div>
                    <button type="button" onclick="App.playDictionaryAudio('${this.escapeHtml(word.en)}'); event.stopPropagation();" class="w-9 h-9 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition flex-shrink-0 cursor-pointer shadow-2xs" title="발음 듣기">
                      <i class="fa-solid fa-volume-high text-sm"></i>
                    </button>
                  </div>

                  ${`
                    <!-- 일반 단어 한국어 뜻 (단어만 보기 모드 지원) -->
                    <div class="pt-1 space-y-1.5">
                      ${isHidden ? `
                        <div onclick="App.toggleVocabStudyWordReveal(${index})" class="py-2 px-3 rounded-xl bg-slate-100/90 hover:bg-indigo-50 text-slate-400 hover:text-indigo-700 border border-dashed border-slate-300 text-xs font-bold transition flex items-center justify-between cursor-pointer select-none">
                          <span class="flex items-center gap-1.5">
                            <i class="fa-solid fa-eye-slash text-[11px]"></i>
                            <span>클릭하여 한국어 뜻 확인</span>
                          </span>
                          <span class="text-[10px] text-slate-400 font-normal">터치 시 열림</span>
                        </div>
                      ` : `
                        <p class="text-base sm:text-lg font-bold text-violet-950 break-words">${this.escapeHtml(word.ko)}</p>
                      `}
                      ${word.defEn ? `
                        <div class="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200/80 text-xs space-y-1 mt-1">
                          <div class="flex items-center gap-1.5">
                            <span class="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[10px] font-bold">영영풀이</span>
                          </div>
                          <p class="text-slate-700 font-medium leading-relaxed">${this.escapeHtml(word.defEn)}</p>
                        </div>
                      ` : ''}
                    </div>
                  `}
                </div>
              </div>`;
          }).join('')}
        </div>`;
    } else if (vs.viewMode === 'card') {
      // ── 뷰 모드 2: 플래시카드 암기학습 (모르는 단어 없을 때까지 반복 루프) ──
      if (!vs.flashcardDeck || vs.flashcardDeck.length === 0) {
        this.vocabStudyRestartMastery();
      }

      // 1) 모든 단어 완벽 마스터 (모르는 단어 0개 달성)
      if (vs.isMasteryFinished) {
        container.innerHTML = `
          <div class="max-w-xl mx-auto py-8 space-y-6 text-center animate-fade-in">
            <div class="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-tr from-emerald-400 to-teal-500 text-white flex items-center justify-center text-5xl shadow-lg shadow-emerald-200">
              🎉
            </div>
            <div class="space-y-2">
              <span class="px-3.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                완벽 암기 마스터 달성!
              </span>
              <h2 class="text-3xl font-black text-slate-900 tracking-tight">모든 단어를 완벽하게 암기했습니다!</h2>
              <p class="text-sm font-semibold text-slate-600">
                총 <strong>${vs.allWords.length}개</strong> 단어 · 모르는 단어 <strong>0개</strong> 완료 (${vs.round}회차 반복 학습)
              </p>
            </div>
            <div class="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-center space-y-2">
              <p class="text-xs font-bold text-emerald-900">
                <i class="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i>
                모르는 단어가 없어질 때까지 반복하여 단어의 기억을 완벽히 마스터했습니다.
              </p>
              <p class="text-[11px] text-emerald-700">이제 단어 시험에 응시하거나 다른 단어장을 학습할 준비가 완료되었습니다.</p>
            </div>
            <div class="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <button type="button" onclick="App.vocabStudyRestartMastery()" class="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition flex items-center gap-2 shadow-xs cursor-pointer">
                <i class="fa-solid fa-rotate-right"></i>
                <span>처음부터 다시 학습하기</span>
              </button>
              <button type="button" onclick="App.setVocabStudyViewMode('list')" class="px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer">
                <i class="fa-solid fa-list"></i>
                <span>목록으로 돌아가기</span>
              </button>
              ${vs.originTestId ? `
                <button type="button" onclick="App.closeVocabStudyModal()" class="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition flex items-center gap-2 shadow-emerald-200 shadow-md cursor-pointer">
                  <i class="fa-solid fa-graduation-cap"></i>
                  <span>시험 응시하러 가기</span>
                </button>
              ` : ''}
            </div>
          </div>`;
        return;
      }

      // 2) 회차 종료 화면 (모르는 단어가 남아 다음 회차 반복 필요)
      if (vs.isRoundFinished) {
        container.innerHTML = `
          <div class="max-w-xl mx-auto py-8 space-y-6 text-center animate-fade-in">
            <div class="w-20 h-20 mx-auto rounded-3xl bg-amber-100 text-amber-600 flex items-center justify-center text-4xl shadow-sm">
              <i class="fa-solid fa-repeat"></i>
            </div>
            <div class="space-y-2">
              <span class="px-3.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
                ${vs.round}회차 학습 완료
              </span>
              <h2 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                모르는 단어 ${vs.unknownWords.length}개가 남았습니다
              </h2>
              <p class="text-xs sm:text-sm text-slate-600">
                아는 단어 <strong class="text-emerald-600">${vs.knownWords.length}개</strong>는 통과! 모르는 단어가 0개가 될 때까지 반복 학습합니다.
              </p>
            </div>

            <!-- 모르는 단어 미리보기 리스트 -->
            <div class="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-left space-y-2.5">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-black text-rose-900 flex items-center gap-1.5">
                  <i class="fa-solid fa-circle-question text-rose-500"></i>
                  ${vs.round + 1}회차에 다시 반복할 단어 (${vs.unknownWords.length}개)
                </h4>
                <span class="text-[11px] font-mono text-rose-600">클릭 시 발음 청취</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                ${vs.unknownWords.map(w => `
                  <div onclick="App.playDictionaryAudio('${this.escapeHtml(w.en)}')" class="p-2.5 rounded-xl bg-white border border-rose-200/80 hover:border-rose-300 transition cursor-pointer flex items-center justify-between gap-2 shadow-2xs">
                    <div class="min-w-0">
                      <p class="font-black text-xs text-slate-900 truncate">${this.escapeHtml(w.en)}</p>
                      <p class="text-[11px] text-rose-700 font-medium truncate">${this.escapeHtml(w.mockKo || w.ko)}</p>
                    </div>
                    <i class="fa-solid fa-volume-high text-xs text-rose-400 hover:text-rose-600"></i>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <button type="button" onclick="App.vocabStudyStartNextRound()" class="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-md cursor-pointer">
                <i class="fa-solid fa-play"></i>
                <span>${vs.round + 1}회차 시작하기 (모르는 단어 ${vs.unknownWords.length}개 반복)</span>
                <kbd class="hidden sm:inline px-1.5 py-0.5 rounded bg-black/20 text-white/90 text-[10px] font-mono">Enter</kbd>
              </button>
              <button type="button" onclick="App.setVocabStudyViewMode('list')" class="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer">
                <i class="fa-solid fa-list"></i>
                <span>목록으로 돌아가기</span>
              </button>
            </div>
          </div>`;
        return;
      }

      // 3) 학습 진행 중 카드
      const currentWord = vs.flashcardDeck[vs.cardIndex] || vs.flashcardDeck[0];


      container.innerHTML = `
        <div class="max-w-xl mx-auto py-2 space-y-4">
          <!-- 상단 진행도 및 회차/아는단어/모르는단어 카운터 -->
          <div class="p-3 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div class="flex items-center justify-between gap-2 flex-wrap text-xs">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs shadow-2xs">
                  ${vs.round}회차
                </span>
                <span class="font-bold text-slate-700">
                  단어 <strong>${vs.cardIndex + 1}</strong> / ${vs.flashcardDeck.length}
                </span>
              </div>
              <div class="flex items-center gap-3 font-bold">
                <span class="text-rose-600 flex items-center gap-1">
                  <i class="fa-solid fa-circle-xmark text-xs"></i>
                  <span>모르는 단어</span>
                  <strong class="px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-700 text-xs">${vs.unknownWords.length}</strong>
                </span>
                <span class="text-emerald-600 flex items-center gap-1">
                  <i class="fa-solid fa-circle-check text-xs"></i>
                  <span>아는 단어</span>
                  <strong class="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700 text-xs">${vs.knownWords.length}</strong>
                </span>
              </div>
            </div>

            <!-- 프로그레스 바 -->
            <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div class="bg-indigo-600 h-2 rounded-full transition-all duration-300" style="width: ${((vs.cardIndex + 1) / vs.flashcardDeck.length) * 100}%"></div>
            </div>
          </div>

          <!-- 대형 플래시카드 본체 -->
          <div onclick="App.vocabStudyFlipCard()" class="min-h-[190px] sm:min-h-[230px] p-5 sm:p-6 rounded-3xl border-2 ${vs.isCardFlipped ? 'border-indigo-400 bg-gradient-to-b from-indigo-50/50 to-white' : 'border-slate-200 bg-white'} shadow-lg hover:shadow-xl transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-3 group select-none">
            <span class="text-xs font-black text-indigo-500 font-mono bg-indigo-50 px-3 py-1 rounded-full">#${String(vs.cardIndex + 1).padStart(2, '0')}</span>

            <!-- 영어 단어 -->
            <div class="space-y-1">
              <h2 class="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">${this.escapeHtml(currentWord.en)}</h2>
              ${currentWord.ipa ? `<p class="text-sm sm:text-base font-mono text-slate-400 font-bold">${this.escapeHtml(currentWord.ipa)}</p>` : ''}
            </div>

            <!-- 발음 버튼 -->
            <button type="button" onclick="App.playDictionaryAudio('${this.escapeHtml(currentWord.en)}'); event.stopPropagation();" class="w-10 h-10 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition shadow-md cursor-pointer" title="발음 듣기">
              <i class="fa-solid fa-volume-high text-sm"></i>
            </button>

            <!-- 한국어 뜻 영역 -->
            <div class="w-full pt-2.5 border-t border-slate-100 min-h-[60px] flex items-center justify-center">
              ${vs.isCardFlipped ? `
                ${`
                  <div class="space-y-2 text-center animate-fade-in">
                    <p class="text-2xl sm:text-3xl font-black text-indigo-950">${this.escapeHtml(currentWord.ko)}</p>
                    ${currentWord.defEn ? `
                      <div class="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-left max-w-md mx-auto space-y-1">
                        <span class="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[10px] font-bold inline-block">영영풀이</span>
                        <p class="text-slate-700 font-medium leading-relaxed">${this.escapeHtml(currentWord.defEn)}</p>
                      </div>
                    ` : ''}
                  </div>
                `}
              ` : `
                <div class="text-xs font-bold text-slate-400 group-hover:text-indigo-600 transition flex items-center gap-1.5">
                  <i class="fa-solid fa-hand-pointer text-sm animate-bounce"></i>
                  <span>카드를 클릭하거나 Space를 누르면 뜻이 나타납니다</span>
                </div>
              `}
            </div>
          </div>

          <!-- 아는단어 / 뒤집기 / 모르는단어 액션 버튼 -->
          <div class="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onclick="App.vocabStudyMarkWord(false)"
              class="py-3.5 px-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border-2 border-rose-300 text-rose-700 font-black text-xs sm:text-sm transition flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 shadow-xs cursor-pointer group"
            >
              <i class="fa-solid fa-circle-xmark text-rose-500 text-base group-hover:scale-110 transition-transform"></i>
              <span>모르는 단어</span>
              <kbd class="hidden sm:inline-block px-1.5 py-0.5 rounded bg-rose-200/80 text-rose-800 text-[10px] font-mono">← / 1</kbd>
            </button>

            <button
              type="button"
              onclick="App.vocabStudyFlipCard()"
              class="py-3.5 px-3 rounded-2xl ${vs.isCardFlipped ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 shadow-md'} font-black text-xs sm:text-sm transition flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 cursor-pointer"
            >
              <i class="fa-solid fa-rotate text-sm"></i>
              <span>${vs.isCardFlipped ? '뜻 가리기' : '뜻 보기'}</span>
              <kbd class="hidden sm:inline-block px-1.5 py-0.5 rounded ${vs.isCardFlipped ? 'bg-slate-300 text-slate-800' : 'bg-indigo-700 text-white/90'} text-[10px] font-mono">Space</kbd>
            </button>

            <button
              type="button"
              onclick="App.vocabStudyMarkWord(true)"
              class="py-3.5 px-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-300 text-emerald-700 font-black text-xs sm:text-sm transition flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 shadow-xs cursor-pointer group"
            >
              <i class="fa-solid fa-circle-check text-emerald-500 text-base group-hover:scale-110 transition-transform"></i>
              <span>아는 단어</span>
              <kbd class="hidden sm:inline-block px-1.5 py-0.5 rounded bg-emerald-200/80 text-emerald-800 text-[10px] font-mono">→ / 2</kbd>
            </button>
          </div>
        </div>`;
    }
  },

  renderVocabStudyFooter() {
    const vs = this.state.vocabStudy;
    const footer = document.getElementById('vocabStudyModalFooter');
    if (!footer || !vs) return;

    if (vs.viewMode === 'card') {
      if (vs.isMasteryFinished || vs.isRoundFinished) {
        footer.innerHTML = `
          <div class="text-xs text-slate-500 font-bold flex items-center gap-1.5">
            <i class="fa-solid fa-repeat text-indigo-500"></i>
            <span>${vs.isMasteryFinished ? '완벽 암기 마스터 완료' : `${vs.round}회차 완료 (다음 ${vs.round + 1}회차 대기)`}</span>
          </div>
          <button type="button" onclick="App.closeVocabStudyModal()" class="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm transition cursor-pointer shadow-xs">
            닫기
          </button>`;
      } else {
        footer.innerHTML = `
          <div class="flex items-center gap-2 text-xs flex-wrap min-w-0">
            <span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs shadow-2xs flex-shrink-0">${vs.round}회차 학습</span>
            <span class="text-slate-600 font-bold hidden sm:inline">단어 ${vs.cardIndex + 1} / ${vs.flashcardDeck.length}</span>
            <span class="text-rose-600 font-black text-xs flex items-center gap-1">
              <i class="fa-solid fa-circle-xmark"></i>
              <span>모르는 단어</span>
              <strong class="px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-700">${vs.unknownWords.length}</strong>
            </span>
            <span class="text-emerald-600 font-black text-xs flex items-center gap-1">
              <i class="fa-solid fa-circle-check"></i>
              <span>아는 단어</span>
              <strong class="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700">${vs.knownWords.length}</strong>
            </span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button type="button" onclick="App.setVocabStudyViewMode('list')" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center gap-1.5">
              <i class="fa-solid fa-list text-[11px]"></i>
              <span class="hidden sm:inline">목록 보기</span>
            </button>
            <button type="button" onclick="App.closeVocabStudyModal()" class="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer shadow-xs">
              닫기
            </button>
          </div>`;
      }
      return;
    }

    if (vs.originTestId) {
      footer.innerHTML = `
        <button type="button" onclick="App.closeVocabStudyModal()" class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm transition flex items-center gap-2 shadow-xs cursor-pointer">
          <i class="fa-solid fa-arrow-left"></i>
          <span>시험 응시 창으로 돌아가기</span>
        </button>
        <button type="button" onclick="App.closeVocabStudyModal()" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm transition cursor-pointer">
          닫기
        </button>`;
    } else {
      footer.innerHTML = `
        <div class="text-xs text-slate-400 font-medium">단어를 충분히 암기한 후 시험에 도전하세요!</div>
        <button type="button" onclick="App.closeVocabStudyModal()" class="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm transition cursor-pointer shadow-xs">
          확인 완료
        </button>`;
    }
  },

  // ── 단어 테스트 10분 재응시 대기시간 즉시 해제 (관리자 권한 일회성 허용) ──
  async resetVocabRetryCooldown(studentId, setId, direction, testId = null) {
    if (!this.state.isAdminLoggedIn) {
      this.toast('관리자 권한이 필요합니다.', 'error');
      return;
    }

    const results = AppData.getVocabTestResults();
    const result = results.find(r =>
      String(r.studentId) === String(studentId) &&
      String(r.setId) === String(setId) &&
      Number(r.direction) === Number(direction) &&
      (!testId || String(r.testId) === String(testId))
    );

    if (result) {
      result.retryAvailableAt = null;
      await AppData.saveVocabTestResults(results);
    }

    if (testId) {
      const tests = AppData.getTests();
      const test = tests.find(t => String(t.id) === String(testId));
      if (test) {
        test.allowLate = true;
        test.allowRetest = true;
        await AppData.saveOrUpdateTest(test);
      }
    }

    this.toast('단어 테스트 대기시간(10분)이 즉시 해제되었습니다. 학생이 바로 재응시할 수 있습니다.', 'success');

    // 모달이 열려있다면 모달 갱신
    if (testId) {
      const currentModal = document.getElementById('testDetailModal');
      if (currentModal && !currentModal.classList.contains('hidden')) {
        this.openVocabTestScheduleModal(testId);
      }
    }

    this.renderAdminVocabTab();
    this.renderCalendar();
    this.renderAdminTestsTab();
  },

  // ── 한글 2벌식 -> 영문 알파벳 자동 변환 (한영 오타 실시간 교정) ──
  convertKorToEng(text) {
    if (!text) return '';
    const CHO_MAP = ['r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g'];
    const JUNG_MAP = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
    const JONG_MAP = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];
    const JAMO_MAP = {
      'ㄱ':'r','ㄲ':'R','ㄳ':'rt','ㄴ':'s','ㄵ':'sw','ㄶ':'sg','ㄷ':'e','ㄸ':'E','ㄹ':'f','ㄺ':'fr','ㄻ':'fa','ㄼ':'fq','ㄽ':'ft','ㄾ':'fx','ㄿ':'fv','ㅀ':'fg','ㅁ':'a','ㅂ':'q','ㅃ':'Q','ㅄ':'qt','ㅅ':'t','ㅆ':'T','ㅇ':'d','ㅈ':'w','ㅉ':'W','ㅊ':'c','ㅋ':'z','ㅌ':'x','ㅍ':'v','ㅎ':'g',
      'ㅏ':'k','ㅐ':'o','ㅑ':'i','ㅒ':'O','ㅓ':'j','ㅔ':'p','ㅕ':'u','ㅖ':'P','ㅗ':'h','ㅘ':'hk','ㅙ':'ho','ㅚ':'hl','ㅛ':'y','ㅜ':'n','ㅝ':'nj','ㅞ':'np','ㅟ':'nl','ㅠ':'b','ㅡ':'m','ㅢ':'ml','ㅣ':'l'
    };

    let result = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        const sIdx = code - 0xAC00;
        const cho = Math.floor(sIdx / (21 * 28));
        const jung = Math.floor((sIdx % (21 * 28)) / 28);
        const jong = sIdx % 28;
        result += CHO_MAP[cho] + JUNG_MAP[jung] + JONG_MAP[jong];
      } else if (JAMO_MAP[ch]) {
        result += JAMO_MAP[ch];
      } else {
        result += ch;
      }
    }
    return result;
  },

  // ── 영문 2벌식 -> 한글 음절 자동 변환 및 조합 (영한 오타 실시간 교정) ──
  convertEngToKor(text) {
    if (!text) return '';
    const ENG_TO_JAMO = {
      'r':'ㄱ', 'R':'ㄲ', 's':'ㄴ', 'e':'ㄷ', 'E':'ㄸ', 'f':'ㄹ', 'a':'ㅁ', 'q':'ㅂ', 'Q':'ㅃ', 't':'ㅅ', 'T':'ㅆ', 'd':'ㅇ', 'w':'ㅈ', 'W':'ㅉ', 'c':'ㅊ', 'z':'ㅋ', 'x':'ㅌ', 'v':'ㅍ', 'g':'ㅎ',
      'k':'ㅏ', 'o':'ㅐ', 'i':'ㅑ', 'O':'ㅒ', 'j':'ㅓ', 'p':'ㅔ', 'u':'ㅕ', 'P':'ㅖ', 'h':'ㅗ', 'y':'ㅛ', 'n':'ㅜ', 'b':'ㅠ', 'm':'ㅡ', 'l':'ㅣ'
    };
    const CHO_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
    const JUNG_LIST = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
    const JONG_LIST = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

    const COMPLEX_JUNG = {
      'ㅗㅏ':'ㅘ', 'ㅗㅐ':'ㅙ', 'ㅗㅣ':'ㅚ',
      'ㅜㅓ':'ㅝ', 'ㅜㅔ':'ㅞ', 'ㅜㅣ':'ㅟ',
      'ㅡㅣ':'ㅢ'
    };
    const COMPLEX_JONG = {
      'ㄱㅅ':'ㄳ', 'ㄴㅈ':'ㄵ', 'ㄴㅎ':'ㄶ',
      'ㄹㄱ':'ㄺ', 'ㄹㅁ':'ㄻ', 'ㄹㅂ':'ㄼ', 'ㄹㅅ':'ㄽ', 'ㄹㅌ':'ㄾ', 'ㄹㅍ':'ㄿ', 'ㄹㅎ':'ㅀ',
      'ㅂㅅ':'ㅄ'
    };

    const jamos = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      jamos.push(ENG_TO_JAMO[ch] || ch);
    }

    const out = [];
    let i = 0;
    const n = jamos.length;

    while (i < n) {
      const c1 = jamos[i];

      if (!CHO_LIST.includes(c1) && !JUNG_LIST.includes(c1)) {
        out.push(c1);
        i++;
        continue;
      }

      if (!CHO_LIST.includes(c1)) {
        if (i + 1 < n && COMPLEX_JUNG[c1 + jamos[i + 1]]) {
          out.push(COMPLEX_JUNG[c1 + jamos[i + 1]]);
          i += 2;
        } else {
          out.push(c1);
          i++;
        }
        continue;
      }

      const cho = c1;
      if (i + 1 >= n || !JUNG_LIST.includes(jamos[i + 1])) {
        out.push(cho);
        i++;
        continue;
      }

      let jung = jamos[i + 1];
      let step = 2;

      if (i + 2 < n && COMPLEX_JUNG[jung + jamos[i + 2]]) {
        jung = COMPLEX_JUNG[jung + jamos[i + 2]];
        step = 3;
      }

      let jong = '';
      if (i + step < n && JONG_LIST.includes(jamos[i + step]) && jamos[i + step] !== '') {
        const cand1 = jamos[i + step];
        if (i + step + 1 < n && JUNG_LIST.includes(jamos[i + step + 1])) {
          // 뒤에 모음이 오면 다음 음절의 초성으로 넘김
        } else {
          if (i + step + 1 < n && COMPLEX_JONG[cand1 + jamos[i + step + 1]]) {
            const cand2 = COMPLEX_JONG[cand1 + jamos[i + step + 1]];
            if (i + step + 2 < n && JUNG_LIST.includes(jamos[i + step + 2])) {
              jong = cand1;
              step += 1;
            } else {
              jong = cand2;
              step += 2;
            }
          } else {
            jong = cand1;
            step += 1;
          }
        }
      }

      const choIdx = CHO_LIST.indexOf(cho);
      const jungIdx = JUNG_LIST.indexOf(jung);
      const jongIdx = JONG_LIST.indexOf(jong);
      const syllable = String.fromCharCode(0xAC00 + (choIdx * 21 + jungIdx) * 28 + jongIdx);
      out.push(syllable);
      i += step;
    }

    return out.join('');
  },

  // ── 영어 스펠링 / 한글 뜻 입력 필터 (실시간 DOM 치환 제거: 한글 IME 조합 및 받침 유실 완벽 방지) ──
  filterSpellingEnglishOnly(inputEl) {
    // 실시간 DOM 치환을 수행하지 않고 브라우저/OS 네이티브 키보드 입력 완벽 보존
  },

  filterMeaningKoreanOnly(inputEl) {
    // 실시간 DOM 치환을 수행하지 않고 한글 받침 및 자모 조합 완벽 보존
  },

  // ── 사전식 실제 원어민 녹음 MP3 재생 & 발음기호(IPA) 헬퍼 ──────────────
  playDictionaryAudio(word) {
    if (!word) return;
    const clean = word.trim().toLowerCase();

    // 1. 고음질 사전 원어민 녹음 MP3 자동 1회 재생
    try {
      const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=2`;
      const audio = new Audio(audioUrl);
      audio.volume = 1.0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // 브라우저 자동재생 정책 또는 네트워크 이슈 시 fallback
          this.speakWordFallback(clean);
        });
      }
    } catch (e) {
      this.speakWordFallback(clean);
    }
  },

  speakWordFallback(word) {
    if (!word || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('TTS Fallback Error:', e);
    }
  },

  // ── 스마트 AI / 시맨틱 한국어 뜻 채점 엔진 ──────────────────
  evaluateKoreanMeaningAI(studentMeaning, targetMeaning) {
    if (!studentMeaning || !targetMeaning) {
      return { match: false, score: 0, reason: '입력값 없음' };
    }
    const sClean = studentMeaning.trim().toLowerCase().replace(/[.,~!?]/g, '');
    const tClean = targetMeaning.trim().toLowerCase().replace(/[.,~!?]/g, '');
    if (!sClean || !tClean) {
      return { match: false, score: 0, reason: '유효한 텍스트 없음' };
    }

    // 1. 단순 일치 및 후보별 일치 검사
    const targetCandidates = targetMeaning
      .split(/[,;\/\n]/)
      .map(s => s.trim().toLowerCase().replace(/[.,~!?]/g, ''))
      .filter(Boolean);

    if (targetCandidates.some(c => c === sClean)) {
      return { match: true, score: 1.0, reason: '완벽 일치' };
    }

    // 2. 포함 관계 (예: "버리다, 포기하다"에서 "버리다" 또는 "포기")
    if (targetCandidates.some(c => c.includes(sClean) || sClean.includes(c))) {
      return { match: true, score: 0.95, reason: '핵심 의미 일치' };
    }

    // 3. 한국어 조사 및 어미 정규화 (어간 비교)
    const normalizeStem = (text) => {
      return text
        .replace(/(하다|되다|시키다|받다|거리다|이다|롭다|스럽다|맞다)$/g, '')
        .replace(/(을|를|이|가|에|의|로|으로|에서|와|과|도)$/g, '')
        .trim();
    };

    const sStem = normalizeStem(sClean);
    if (sStem && sStem.length >= 2) {
      const stemMatched = targetCandidates.some(c => {
        const cStem = normalizeStem(c);
        return cStem && (cStem.includes(sStem) || sStem.includes(cStem));
      });
      if (stemMatched) {
        return { match: true, score: 0.9, reason: '어간/활용형 일치' };
      }
    }

    // 4. 자주 쓰이는 유의어/동의어 매핑
    const synonymDictionary = {
      '포기': ['버리다', '단념', '체념', '그만두다', '손을떼다', '내버려두다'],
      '버리다': ['포기', '유기', '내버리다', '단념'],
      '획득': ['얻다', '취득', '구하다', '차지하다', '얻음'],
      '얻다': ['획득', '취득', '구하다', '받다'],
      '성공': ['이루다', '달성', '완수', '해내다'],
      '실패': ['그르치다', '낙방', '패배', '틀리다'],
      '돕다': ['도움', '원조', '지원', '협력', '거들다', '보조'],
      '중요한': ['핵심', '필수', '중대한', '주요한', '귀중한'],
      '시작': ['착수', '출발', '개시', '시작하다', '열다'],
      '끝': ['종료', '완료', '마침', '결말'],
      '거절': ['거부', '물리치다', '사양', '퇴짜'],
      '수락': ['받아들이다', '승낙', '동의', '인정']
    };

    for (const [key, syns] of Object.entries(synonymDictionary)) {
      const matchS = sClean.includes(key) || syns.some(syn => sClean.includes(syn));
      const matchT = tClean.includes(key) || syns.some(syn => tClean.includes(syn));
      if (matchS && matchT) {
        return { match: true, score: 0.85, reason: '유의어/동의어 판정' };
      }
    }

    return { match: false, score: 0.2, reason: '의미 불일치' };
  },

  checkKoreanMeaningMatch(input, targetKo) {
    const evalResult = this.evaluateKoreanMeaningAI(input, targetKo);
    return evalResult.match;
  },

  getVocabDirectionLabel(direction) {
    const dir = Number(direction);
    if (dir === 2) return '객관식';
    if (dir === 3) return '스펠링';
    if (dir === 4) return '통합';
    if (dir === 5) return '영영풀이';
    return '단어 테스트';
  },

  getVocabDirectionShortLabel(direction) {
    const dir = Number(direction);
    if (dir === 2) return '객관식';
    if (dir === 3) return '스펠링';
    if (dir === 4) return '통합';
    if (dir === 5) return '영영';
    return '단어';
  },

  getVocabQuestionCountSummary(test) {
    return AppData.getVocabDirections(test)
      .map(dir => `${this.getVocabDirectionLabel(dir)} ${AppData.getVocabQuestionCount(test, dir)}문항`)
      .join(' · ');
  },

  // ── 학생: 단어 테스트 시작 ──────────────────────────────
  startVocabTest(setId, studentId, direction, testId = null) {
    let set = null;
    let scheduledTest = testId ? AppData.getTests().find(test => String(test.id) === String(testId)) : null;
    if (!scheduledTest && studentId && setId) {
      const matchingTests = AppData.getTests().filter(test =>
        Number(test.studentId) === Number(studentId) &&
        test.type === 'VOCAB' &&
        (test.vocabSetId === setId || (Array.isArray(test.vocabSetIds) && test.vocabSetIds.includes(setId)))
      );
      if (matchingTests.length > 0) {
        scheduledTest = matchingTests.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      }
    }
    const effectiveTestId = scheduledTest ? scheduledTest.id : testId;

    if (scheduledTest && !AppData.getVocabDirections(scheduledTest).includes(Number(direction))) {
      this.toast('출제에서 제외된 유형은 응시할 수 없습니다.', 'error');
      return;
    }

    if (scheduledTest) {
      const setIds = Array.isArray(scheduledTest.vocabSetIds) && scheduledTest.vocabSetIds.length > 0
        ? scheduledTest.vocabSetIds
        : (scheduledTest.vocabSetId ? [scheduledTest.vocabSetId] : []);
      const allSets = AppData.getVocabSets();
      let matchingSets = setIds.map(id => allSets.find(s => s.id === id)).filter(Boolean);

      if (matchingSets.length === 0) {
        const textToSearch = `${scheduledTest.title || ''} ${scheduledTest.scope || ''} ${scheduledTest.id || ''}`;
        const dayMatches = [...textToSearch.matchAll(/Day\s*(\d+)/gi)];
        if (dayMatches.length > 0) {
          const extractedSetIds = [...new Set(dayMatches.map(m => `wm2000_day_${String(m[1]).padStart(2, '0')}`))];
          matchingSets = extractedSetIds.map(id => allSets.find(s => s.id === id)).filter(Boolean);
          if (matchingSets.length > 0) {
            scheduledTest.vocabSetIds = extractedSetIds;
            scheduledTest.vocabSetId = extractedSetIds[0];
            AppData.saveOrUpdateTest(scheduledTest).catch(e => console.warn('Auto-relink test notice:', e));
          }
        }
      }
      if (matchingSets.length > 0) {
        const combinedWords = [];
        matchingSets.forEach(s => {
          if (Array.isArray(s.words)) combinedWords.push(...s.words);
        });
        set = {
          id: matchingSets.map(s => s.id).join(','),
          book: matchingSets[0]?.book || '기본 단어장',
          title: matchingSets.map(s => s.title).join(' + '),
          words: combinedWords
        };
      }
    }
    if (!set) {
      set = AppData.getVocabSets().find(s => s.id === setId);
    }

    if (!set || set.words.length < 5) { this.toast('단어가 부족합니다. (최소 5개)', 'error'); return; }
    if (![2, 3, 4, 5].includes(direction)) { this.toast('올바른 테스트 모드가 아닙니다.', 'error'); return; }

    let eligibleWords = set.words;
    if (direction === 5) {
      eligibleWords = set.words.filter(w => w.defEn && w.defEn.trim().length > 0);
      if (eligibleWords.length < 5) {
        this.toast('영영풀이가 등록된 단어가 부족합니다. (최소 5개 필요)', 'error');
        return;
      }
    }

    // 순차 잠금 검사 (객관식 통과 -> 스펠링 통과 -> 통합)
    const unlockCheck = this.isVocabTestUnlocked(studentId, set.id, direction, effectiveTestId);
    if (!unlockCheck.unlocked) {
      this.toast(`이전 단계인 '${unlockCheck.requiredLabel}' 시험을 먼저 통과해야 합니다.`, 'error');
      return;
    }

    if (scheduledTest) {
      const timeStatus = this.getTestTimeStatus(scheduledTest);
      if (!timeStatus.canStart) {
        this.notifyUnavailableVocabTest(timeStatus.status);
        return;
      }
    }
    const existingResult = AppData.getVocabTestResult(studentId, set.id, direction, effectiveTestId);
    if (existingResult?.passed) {
      this.toast('완료된 테스트는 다시 볼 수 없습니다.', 'info');
      this.selectStudent(studentId);
      return;
    }
    if (existingResult?.retryAvailableAt && new Date(existingResult.retryAvailableAt) > new Date()) {
      this.toast('불합격 후 10분이 지나면 다시 응시할 수 있습니다.', 'info');
      return;
    }

    const startedAt = new Date().toISOString();
    const targetWordCount = AppData.getVocabQuestionCount(scheduledTest, direction);
    const testWords = this.selectVocabTestWords(eligibleWords, targetWordCount);

    const initialTime = direction === 2 ? 7 : (direction === 5 ? 20 : (direction === 3 ? 15 : 20));

    const attemptCount = this.getVocabAttemptCount(studentId, set.id, direction, effectiveTestId);
    const currentRound = attemptCount + 1;
    const baseCutoff = this.getBaseVocabCutoffScore(scheduledTest, direction);
    const cutoffScore = this.getVocabCutoffScore(scheduledTest, direction, currentRound);

    // 모드 3, 4인 경우 사전에 모든 단어의 발음기호를 즉시 백그라운드 프리페치하여 렉 완전 제거
    if (direction === 3 || direction === 4) {
      this.prefetchVocabPhonetics(testWords);
    }

    const bookName = (set.book || '').trim();
    const formattedTitle = (bookName && bookName !== '기본 단어장') ? `[${bookName}] ${set.title}` : set.title;

    this.state.vocabTest = {
      setId: set.id,
      studentId: Number(studentId),
      setTitle: formattedTitle,
      bookName: bookName || '기본 단어장',
      testId: effectiveTestId,
      startedAt,

      allWords: testWords,
      sourceWordCount: eligibleWords.length,
      direction,
      questions: this.buildVocabQuestions(testWords, direction, direction === 5 ? eligibleWords : set.words),
      currentIndex: 0,
      score: 0,
      currentRound,
      baseCutoff,
      cutoffScore,
      timerId: null,
      timeRemaining: initialTime,
      initialTimeLimit: initialTime,
      isCompleted: false
    };

    try {
      history.pushState({ inVocabTest: true }, '');
    } catch (e) {}

    this.closeTestDetailModal();
    this.showVocabTestView();
    this.renderVocabQuestion();
  },

  shuffleItems(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  },

  selectVocabTestWords(words, maxCount = 40) {
    return this.shuffleItems(words).slice(0, Math.min(words.length, maxCount));
  },

  buildVocabQuestions(words, direction, choicePool = words) {
    const shuffled = this.shuffleItems(words);
    return shuffled.map(word => {
      if (direction === 2) {
        const others = this.shuffleItems(choicePool.filter(w => w !== word)).slice(0, 4);
        const correctChoice = word.ko;
        const wrongChoices = others.map(w => w.ko);
        const allChoices = this.shuffleItems([correctChoice, ...wrongChoices]);
        return {
          word,
          question: word.en,
          correct: correctChoice,
          choices: allChoices,
          answered: null,
          isCorrect: false
        };
      } else if (direction === 5) {
        return {
          word,
          question: word.defEn,
          correct: word.en,
          answered: null,
          isCorrect: false
        };
      } else if (direction === 3) {
        return {
          word,
          question: word.en,
          correct: word.en,
          answered: null,
          isCorrect: false
        };
      } else {
        return {
          word,
          question: word.en,
          correct: `${word.en} / ${word.ko}`,
          answered: null,
          isCorrect: false
        };
      }
    });
  },

  async renderVocabQuestion() {
    const vt = this.state.vocabTest;
    const q = vt.questions[vt.currentIndex];
    const total = vt.questions.length;
    const dir = vt.direction;

    // Top info bar
    document.getElementById('vocabTestTopInfo').innerHTML = `
      <div class="flex items-center gap-2 sm:gap-3 flex-wrap w-full">
        <div>
          <span class="font-bold text-slate-800 text-sm">${this.escapeHtml(vt.setTitle)}</span>
          <span class="text-xs text-slate-500 ml-2">문항 ${vt.currentIndex + 1} / ${total}</span>
        </div>
        <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${dir === 2 ? 'bg-violet-100 text-violet-700' : (dir === 3 ? 'bg-blue-100 text-blue-700' : (dir === 5 ? 'bg-teal-100 text-teal-700' : 'bg-emerald-100 text-emerald-700'))}">
          ${this.getVocabDirectionLabel(dir)}
        </span>
        <span class="px-2.5 py-0.5 rounded-full text-xs font-black ${vt.currentRound > 1 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
          ${vt.currentRound ? `${vt.currentRound}회차 · ` : ''}커트라인 ${vt.cutoffScore || 80}점
        </span>
        <span id="vocabTestTimer" class="ml-auto px-4 py-1.5 rounded-full bg-rose-100 text-rose-700 text-sm sm:text-base font-black flex items-center gap-1.5">
          <i class="fa-regular fa-clock"></i>${vt.timeRemaining}초
        </span>
      </div>`;

    const progressPct = ((vt.currentIndex) / total) * 100;
    const contentEl = document.getElementById('vocabTestContent');

    if (dir === 2) {
      // ── 모드 2: 영어 → 한글 (5지선다) ──────────────────────
      contentEl.innerHTML = `
        <div class="space-y-6 max-w-2xl mx-auto">
          <div class="w-full bg-slate-200 rounded-full h-2">
            <div class="bg-indigo-600 h-2 rounded-full transition-all duration-300" style="width:${progressPct}%"></div>
          </div>

          <div class="glass-card rounded-2xl p-6 sm:p-8 text-center space-y-6">
            <p class="text-xs font-bold text-slate-400">
              다음 영어 단어의 올바른 한국어 뜻을 고르세요
              <span class="hidden sm:inline font-medium text-slate-400 ml-1.5">(키보드 숫자 <kbd class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-[11px] font-mono font-bold text-slate-700">1</kbd> ~ <kbd class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-[11px] font-mono font-bold text-slate-700">5</kbd> 로도 선택 가능)</span>
            </p>
            <div class="flex items-center justify-center gap-3 py-4 px-6 bg-indigo-50/80 rounded-2xl border border-indigo-100 inline-flex min-w-[220px] shadow-inner">
              <span class="text-3xl sm:text-4xl font-black text-slate-900">${this.escapeHtml(q.word.en)}</span>
              <button type="button" onclick="App.playDictionaryAudio('${this.escapeHtml(q.word.en)}')" class="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-sm transition flex-shrink-0 cursor-pointer" title="발음 다시 듣기">
                <i class="fa-solid fa-volume-high text-sm"></i>
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
              ${q.choices.map((choice, i) => `
                <button
                  id="vocabChoice_${i}"
                  onclick="App.selectVocabAnswer(${i})"
                  class="vocab-choice-btn w-full p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 text-sm font-semibold text-slate-800 transition text-left flex items-center justify-between gap-3 group cursor-pointer"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="w-7 h-7 rounded-full bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0 transition">${['①','②','③','④','⑤'][i]}</span>
                    <span class="break-words">${this.escapeHtml(choice)}</span>
                  </div>
                  <kbd class="hidden sm:inline-flex items-center justify-center w-6 h-6 text-[11px] font-mono font-bold text-slate-400 group-hover:text-indigo-600 bg-slate-100 group-hover:bg-indigo-50 rounded border border-slate-200 transition flex-shrink-0">${i + 1}</kbd>
                </button>
              `).join('')}
            </div>
          </div>
        </div>`;
    } else if (dir === 5) {
      // ── 모드 5: 영영풀이 → 영어 단어 (스펠링 주관식) ──────────────
      contentEl.innerHTML = `
        <div class="space-y-6 max-w-2xl mx-auto">
          <div class="w-full bg-slate-200 rounded-full h-2">
            <div class="bg-teal-600 h-2 rounded-full transition-all duration-300" style="width:${progressPct}%"></div>
          </div>

          <div class="glass-card rounded-2xl p-6 sm:p-8 text-center space-y-6 border border-teal-200/80 shadow-md">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <span class="px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold inline-flex items-center gap-1.5">
                <i class="fa-solid fa-graduation-cap text-teal-600"></i> 영영풀이 (English Definition)
              </span>
              <p class="text-xs font-bold text-slate-400">
                정의를 읽고 알맞은 영어 단어 스펠링을 입력하세요
              </p>
            </div>

            <!-- 영영 정의 박스 -->
            <div class="py-5 px-6 bg-teal-50/60 rounded-2xl border border-teal-100 text-left shadow-inner">
              <p class="text-base sm:text-lg font-bold text-slate-800 leading-relaxed tracking-normal select-text">
                ${this.escapeHtml(q.question)}
              </p>
            </div>

            <!-- Input Box -->
            <div class="pt-1">
              <input
                type="text"
                id="vocabSpellingInput"
                class="w-full p-4 rounded-2xl border-2 border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 text-center text-xl sm:text-2xl font-black text-slate-900 outline-none transition shadow-inner placeholder:text-slate-300 placeholder:font-normal"
                placeholder="영어 단어 입력"
                autofocus
                autocomplete="off"
                autocorrect="off"
                autocapitalize="none"
                spellcheck="false"
                lang="en"
                inputmode="latin"
                onkeydown="if(event.key==='Enter') App.submitVocabSpellingAnswer(false)"
              />
            </div>

            <button
              type="button"
              onclick="App.submitVocabSpellingAnswer(false)"
              class="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <span>답안 제출 및 다음 문제 (Enter)</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>`;
    } else if (dir === 3) {
      // ── 모드 3: 발음/발음기호 → 영어 스펠링 쓰기 ────────────
      const directIpa = q.word.ipa || q.word.phonetic;
      const cachedIpa = directIpa || this.vocabIpaCache[q.word.en.trim().toLowerCase()] || '';
      contentEl.innerHTML = `
        <div class="space-y-6 max-w-2xl mx-auto">
          <div class="w-full bg-slate-200 rounded-full h-2">
            <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width:${progressPct}%"></div>
          </div>

          <div class="glass-card rounded-3xl p-6 sm:p-8 text-center space-y-6 border border-slate-200/80 shadow-md">
            <!-- 심플 대형 발음기호 (유형 배지 없이 깔끔하게) -->
            <div class="py-8 px-6 bg-slate-50 border border-slate-200/80 rounded-3xl text-center flex items-center justify-center min-h-[96px]">
              <div id="vocabPhoneticBadge" class="font-ipa text-4xl sm:text-5xl font-bold text-slate-900 tracking-wider select-none">
                ${cachedIpa ? this.escapeHtml(cachedIpa) : '<i class="fa-solid fa-spinner fa-spin text-slate-400 text-2xl"></i>'}
              </div>
            </div>

            <!-- Input Box -->
            <div class="pt-1">
              <input
                type="text"
                id="vocabSpellingInput"
                class="w-full p-4 rounded-2xl border-2 border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-center text-xl sm:text-2xl font-black text-slate-900 outline-none transition shadow-inner placeholder:text-slate-300 placeholder:font-normal"
                placeholder="영어 단어 입력"
                autofocus
                autocomplete="off"
                autocorrect="off"
                autocapitalize="none"
                spellcheck="false"
                lang="en"
                inputmode="latin"
                onkeydown="if(event.key==='Enter') App.submitVocabSpellingAnswer(false)"
              />
            </div>

            <button
              type="button"
              onclick="App.submitVocabSpellingAnswer(false)"
              class="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm"
            >
              <span>답안 제출 및 다음 문제 (Enter)</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>`;
    } else if (dir === 4) {
      // ── 모드 4: 발음/발음기호 → 스펠링 + 한글 뜻 쓰기 (일체형 가운데 정렬) ──────────
      const directIpa = q.word.ipa || q.word.phonetic;
      const cachedIpa = directIpa || this.vocabIpaCache[q.word.en.trim().toLowerCase()] || '';
      contentEl.innerHTML = `
        <div class="space-y-6 max-w-2xl mx-auto">
          <div class="w-full bg-slate-200 rounded-full h-2">
            <div class="bg-emerald-600 h-2 rounded-full transition-all duration-300" style="width:${progressPct}%"></div>
          </div>

          <div class="glass-card rounded-3xl p-6 sm:p-8 text-center space-y-6 border border-slate-200/80 shadow-md">
            <!-- 심플 대형 발음기호 (유형 배지 없이 깔끔하게) -->
            <div class="py-8 px-6 bg-slate-50 border border-slate-200/80 rounded-3xl text-center flex items-center justify-center min-h-[96px]">
              <div id="vocabPhoneticBadge" class="font-ipa text-4xl sm:text-5xl font-bold text-slate-900 tracking-wider select-none">
                ${cachedIpa ? this.escapeHtml(cachedIpa) : '<i class="fa-solid fa-spinner fa-spin text-slate-400 text-2xl"></i>'}
              </div>
            </div>

            <!-- Inputs Box: 위/아래 일체형 연결 & 가운데 정렬 -->
            <div class="pt-1">
              <div class="rounded-2xl border-2 border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 overflow-hidden bg-white shadow-inner transition divide-y divide-slate-200">
                <input
                  type="text"
                  id="vocabSpellingInput"
                  class="w-full p-4 text-center text-xl sm:text-2xl font-black text-slate-900 outline-none bg-transparent placeholder:text-slate-300 placeholder:font-normal transition"
                  placeholder="영어 스펠링 입력"
                  autofocus
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="none"
                  spellcheck="false"
                  lang="en"
                  inputmode="latin"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('vocabMeaningInput')?.focus();}"
                />
                <input
                  type="text"
                  id="vocabMeaningInput"
                  class="w-full p-4 text-center text-xl sm:text-2xl font-black text-slate-900 outline-none bg-transparent placeholder:text-slate-300 placeholder:font-normal transition"
                  placeholder="한국어 뜻 입력"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                  lang="ko"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();App.submitVocabComprehensiveAnswer(false);}"
                />
              </div>
            </div>

            <button
              type="button"
              onclick="App.submitVocabComprehensiveAnswer(false)"
              class="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm"
            >
              <span>답안 제출 및 다음 문제 (Enter)</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>`;
    }

    // 객관식, 스펠링, 통합: 사전식 MP3 자동 1회 재생 (영영풀이는 정답 단어 음성 유출 방지를 위해 자동 재생 제외)
    if (dir !== 5) {
      setTimeout(() => {
        this.playDictionaryAudio(q.word.en);
        const inputEl = document.getElementById('vocabSpellingInput');
        if (inputEl) inputEl.focus();
      }, 50);
    } else {
      setTimeout(() => {
        const inputEl = document.getElementById('vocabSpellingInput');
        if (inputEl) inputEl.focus();
      }, 50);
    }

    // 스펠링/통합 시험인 경우: 대형 발음기호 비동기 주입 (직접 발음기호 우선)
    if (dir === 3 || dir === 4) {
      const directIpa = q.word.ipa || q.word.phonetic;
      if (directIpa) {
        const badgeEl = document.getElementById('vocabPhoneticBadge');
        if (badgeEl) {
          badgeEl.innerHTML = `<span class="tracking-wider">${this.escapeHtml(directIpa)}</span>`;
        }
      } else {
        this.fetchWordPhonetic(q.word.en).then(ipa => {
          const badgeEl = document.getElementById('vocabPhoneticBadge');
          if (badgeEl) {
            badgeEl.innerHTML = ipa
              ? `<span class="tracking-wider">${this.escapeHtml(ipa)}</span>`
              : `<span class="text-xl font-mono text-slate-500 font-bold">[${this.escapeHtml(q.word.en)}]</span>`;
          }
        });
      }
    }

    this.startVocabQuestionTimer();
  },

  startVocabQuestionTimer() {
    const vt = this.state.vocabTest;
    this.clearVocabQuestionTimer();

    const defaultTime = vt.direction === 2 ? 7 : (vt.direction === 5 ? 20 : (vt.direction === 3 ? 15 : 20));
    vt.timeRemaining = vt.initialTimeLimit || defaultTime;
    const timer = document.getElementById('vocabTestTimer');
    if (timer) timer.innerHTML = `<i class="fa-regular fa-clock"></i>${vt.timeRemaining}초`;
    vt.timerId = setInterval(() => {
      vt.timeRemaining--;
      const timerEl = document.getElementById('vocabTestTimer');
      if (timerEl) timerEl.innerHTML = `<i class="fa-regular fa-clock"></i>${vt.timeRemaining}초`;
      if (vt.timeRemaining <= 0) {
        if (vt.direction === 2) {
          this.submitVocabAnswer(null, true);
        } else if (vt.direction === 3 || vt.direction === 5) {
          this.submitVocabSpellingAnswer(true);
        } else {
          this.submitVocabComprehensiveAnswer(true);
        }
      }
    }, 1000);
  },

  clearVocabQuestionTimer() {
    if (this.state.vocabTest && this.state.vocabTest.timerId) {
      clearInterval(this.state.vocabTest.timerId);
      this.state.vocabTest.timerId = null;
    }
  },

  // ── 모드 2 답안 제출 (5지선다) ──────────────────────────
  selectVocabAnswer(choiceIndex) {
    this.submitVocabAnswer(choiceIndex, false);
  },

  submitVocabAnswer(choiceIndex, timedOut) {
    const vt = this.state.vocabTest;
    const q = vt.questions[vt.currentIndex];
    if (q.answered !== null && q.answered !== undefined) return;
    this.clearVocabQuestionTimer();

    const chosen = timedOut ? '시간 초과' : q.choices[choiceIndex];
    q.answered = chosen;
    const isCorrect = !timedOut && chosen === q.correct;
    q.isCorrect = isCorrect;
    if (isCorrect) vt.score++;

    q.choices.forEach((choice, i) => {
      const btn = document.getElementById(`vocabChoice_${i}`);
      if (!btn) return;
      btn.disabled = true;
      if (!timedOut && i === choiceIndex) {
        btn.className = vt.direction === 5
          ? 'vocab-choice-btn w-full p-4 rounded-xl border-2 border-teal-500 bg-teal-50 text-base font-bold text-teal-900 transition text-left flex items-center gap-3'
          : 'vocab-choice-btn w-full p-4 rounded-xl border-2 border-indigo-500 bg-indigo-50 text-sm font-bold text-indigo-900 transition text-left flex items-center gap-3';
      }
    });

    setTimeout(() => {
      vt.currentIndex++;
      if (vt.currentIndex < vt.questions.length) {
        this.renderVocabQuestion();
      } else {
        this.renderVocabResult();
      }
    }, 120);
  },

  // ── 모드 3 답안 제출 (스펠링 주관식) ────────────────────
  submitVocabSpellingAnswer(timedOut) {
    const vt = this.state.vocabTest;
    const q = vt.questions[vt.currentIndex];
    if (q.answered !== null && q.answered !== undefined) return;
    this.clearVocabQuestionTimer();

    let inputVal = timedOut ? '' : (document.getElementById('vocabSpellingInput')?.value || '').trim();
    // 한글 자모로 영단어를 친 경우 (제출 시점에만 안전 변환 체크)
    if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(inputVal)) {
      const converted = this.convertKorToEng(inputVal);
      if (converted.toLowerCase() === q.word.en.trim().toLowerCase()) {
        inputVal = converted;
      }
    }
    const isCorrect = !timedOut && Boolean(inputVal) && inputVal.toLowerCase() === q.word.en.trim().toLowerCase();
    q.answered = timedOut ? '시간 초과' : (inputVal || '(미입력)');
    q.isCorrect = isCorrect;
    if (isCorrect) vt.score++;

    const inputEl = document.getElementById('vocabSpellingInput');
    if (inputEl) {
      inputEl.disabled = true;
    }

    setTimeout(() => {
      vt.currentIndex++;
      if (vt.currentIndex < vt.questions.length) {
        this.renderVocabQuestion();
      } else {
        this.renderVocabResult();
      }
    }, 120);
  },

  // ── 모드 4 답안 제출 (스펠링 + 뜻 종합) ──────────────────
  submitVocabComprehensiveAnswer(timedOut) {
    const vt = this.state.vocabTest;
    const q = vt.questions[vt.currentIndex];
    if (q.answered !== null && q.answered !== undefined) return;
    this.clearVocabQuestionTimer();

    let spelling = timedOut ? '' : (document.getElementById('vocabSpellingInput')?.value || '').trim();
    // 한글 자모로 영단어 스펠링을 친 경우 (제출 시점에만 안전 변환 체크)
    if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(spelling)) {
      const converted = this.convertKorToEng(spelling);
      if (converted.toLowerCase() === q.word.en.trim().toLowerCase()) {
        spelling = converted;
      }
    }

    let meaning = timedOut ? '' : (document.getElementById('vocabMeaningInput')?.value || '').trim();
    // 영문 키보드로 한글 뜻을 친 경우 (제출 시점에만 안전 변환 체크)
    if (/[a-zA-Z]/.test(meaning)) {
      const convertedMeaning = this.convertEngToKor(meaning);
      if (this.checkKoreanMeaningMatch(convertedMeaning, q.word.ko)) {
        meaning = convertedMeaning;
      }
    }

    // 1단계: 스펠링 우선 검증 (틀리면 즉시 오답)
    const spellingCorrect = !timedOut && Boolean(spelling) && spelling.toLowerCase() === q.word.en.trim().toLowerCase();

    // 2단계: 스펠링이 맞았을 때 한국어 뜻 검증
    const meaningCorrect = spellingCorrect ? this.checkKoreanMeaningMatch(meaning, q.word.ko) : false;
    const isCorrect = spellingCorrect && meaningCorrect;

    q.spellingInput = spelling;
    q.meaningInput = meaning;
    q.spellingCorrect = spellingCorrect;
    q.meaningCorrect = meaningCorrect;
    q.answered = timedOut ? '시간 초과' : `${spelling || '(스펠링 미입력)'} / ${meaning || '(뜻 미입력)'}`;
    q.isCorrect = isCorrect;
    if (isCorrect) vt.score++;

    const spellingEl = document.getElementById('vocabSpellingInput');
    const meaningEl = document.getElementById('vocabMeaningInput');
    if (spellingEl) spellingEl.disabled = true;
    if (meaningEl) meaningEl.disabled = true;

    setTimeout(() => {
      vt.currentIndex++;
      if (vt.currentIndex < vt.questions.length) {
        this.renderVocabQuestion();
      } else {
        this.renderVocabResult();
      }
    }, 120);
  },

  renderVocabWrongAnswerList(items) {
    return `<div class="vocab-wrong-answer-list overflow-y-auto rounded-xl border border-rose-100 divide-y divide-slate-100 bg-rose-50/30 text-xs">${items.map((item, index) => `
      <div class="p-3 space-y-1.5">
        <div class="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-2 items-center">
          <span class="font-bold text-slate-400 w-6">${index + 1}</span>
          <div><span class="font-bold text-slate-800">${this.escapeHtml(item.question)}</span><div class="text-[11px] text-rose-600 mt-0.5">내가 적은 답: <strong>${this.escapeHtml(item.answer)}</strong></div></div>
          <div class="text-left sm:text-right"><span class="text-[11px] text-slate-500">정답:</span><span class="font-bold text-emerald-700 ml-1">${this.escapeHtml(item.correct)}</span></div>
        </div>
        ${item.desc ? `<div class="ml-8 p-2 rounded-lg bg-amber-50/90 border border-amber-200 text-[11px] text-amber-950 leading-relaxed font-medium text-left">${this.escapeHtml(item.desc)}</div>` : ''}
      </div>`).join('')}</div>`;
  },

  // ── 단어 테스트 결과 렌더링 ──────────────────────────────
  async renderVocabResult() {
    const vt = this.state.vocabTest;
    this.clearVocabQuestionTimer();
    vt.isCompleted = true;
    const total = (vt.allWords && vt.allWords.length) || vt.questions.length;
    const directionLabel = this.getVocabDirectionLabel(vt.direction);
    const test = vt.testId && AppData.getTests().find(item => item.id === vt.testId);
    const currentRound = vt.currentRound || 1;
    const cutoffScore = vt.cutoffScore || this.getVocabCutoffScore(test, vt.direction, currentRound);

    const questionDetails = vt.questions.map((q, idx) => ({
      index: idx,
      word: q.word || { en: q.question, ko: q.correct },
      question: q.word ? (vt.direction === 5 ? q.word.defEn : q.word.en) : q.question,
      correct: q.word ? (vt.direction === 4 ? `${q.word.en} : ${q.word.ko}` : (vt.direction === 2 ? q.word.ko : q.word.en)) : q.correct,
      answered: q.answered || '시간 초과',
      spellingInput: q.spellingInput ?? (vt.direction === 3 ? q.answered : ''),
      meaningInput: q.meaningInput ?? '',
      spellingCorrect: q.spellingCorrect ?? (vt.direction === 3 ? q.isCorrect : null),
      meaningCorrect: q.meaningCorrect ?? (vt.direction === 2 ? q.isCorrect : (vt.direction === 5 ? q.isCorrect : null)),
      isCorrect: Boolean(q.isCorrect)
    }));

    let score = 0;
    let correctCount = 0;
    let passed = false;
    let waitingGrading = false;
    let retryAvailableAt = null;

    if (vt.direction === 4) {
      // ── 모드 4 (스펠링, 뜻): 스펠링으로 먼저 1차 채점 ──
      const spellingCorrectCount = questionDetails.filter(q => q.spellingCorrect).length;
      const spellingScore = Math.round((spellingCorrectCount / total) * 100);
      score = spellingScore;
      correctCount = spellingCorrectCount;

      if (spellingScore < cutoffScore) {
        // 스펠링 점수가 커트라인 미달 -> 바로 불합격 & 10분 후 재응시
        passed = false;
        waitingGrading = false;
        retryAvailableAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      } else {
        // 스펠링 점수가 커트라인 이상 -> 채점 대기중!
        passed = false;
        waitingGrading = true;
        retryAvailableAt = null;
      }
    } else {
      // ── 모드 2 (객관식), 모드 3 (스펠링), 모드 5 (영영풀이) ──
      correctCount = vt.score;
      score = Math.round((correctCount / total) * 100);
      passed = score >= cutoffScore;
      waitingGrading = false;
      retryAvailableAt = passed ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString();
    }

    const wrongAnswers = vt.direction === 4
      ? questionDetails.filter(q => !q.spellingCorrect).map(q => ({
          question: q.word ? `${q.word.en} (${q.word.ko})` : q.question,
          answer: q.spellingInput || '시간 초과 / 미입력',
          correct: q.word ? q.word.en : q.correct
        }))
      : (vt.direction === 5
        ? questionDetails.filter(q => !q.isCorrect).map(q => ({
            question: q.word ? `${q.word.defEn}` : q.question,
            answer: q.answered || '시간 초과',
            correct: q.word ? `${q.word.en} (${q.word.ko})` : q.correct
          }))
        : questionDetails.filter(q => !q.isCorrect).map(q => ({
            question: q.word ? `${q.word.en} (${q.word.ko})` : q.question,
            answer: q.answered || '시간 초과',
            correct: q.word ? (vt.direction === 2 ? q.word.ko : q.word.en) : q.correct
          })));

    const completedAt = vt.completedAt ||= new Date().toISOString();
    const startedAt = vt.startedAt || completedAt;

    try {
      await AppData.saveVocabTestResult({
        studentId: vt.studentId,
        setId: vt.setId,
        testId: vt.testId,
        direction: vt.direction,
        score,
        correctCount,
        total,
        passed,
        waitingGrading,
        spellingScore: score,
        round: currentRound,
        cutoffScore,
        questionDetails,
        wrongAnswers,
        retryAvailableAt,
        startedAt,
        completedAt
      });
      if (test && !AppData.queueVocabResult) {
        await this.updateVocabScheduleStatus(test.id);
      }
    } catch (error) {
      console.error('단어 테스트 결과 저장 오류:', error);
      vt.localSaveFailed = true;
      document.getElementById('vocabTestContent').innerHTML = `<div class="glass-card p-6"><h2>결과를 기기에 보관하지 못했어요.</h2><p>이 화면을 닫지 말고 기기의 저장 공간을 확인한 뒤 다시 시도해주세요. 답안은 현재 화면에 유지돼요.</p><button type="button" class="signup-primary" onclick="App.renderVocabResult()">결과 저장 다시 시도</button></div>`;
      return;
    }

    vt.localSaveFailed = false;
    this.updateHeaderActions();
    const nextCutoff = this.getVocabCutoffScore(test, vt.direction, currentRound + 1);
    const student = AppData.getStudentById(vt.studentId);
    const verdict = waitingGrading ? 'REVIEW' : passed ? 'PASS' : 'FAIL';
    const resultClass = waitingGrading ? 'is-pending' : passed ? 'is-pass' : 'is-fail';
    const resultMessage = waitingGrading ? '채점 대기 중' : passed ? '통과 기준을 달성했어요!' : '틀린 단어를 확인하고 다시 준비해 보세요.';
    const nextMessage = waitingGrading
      ? '스펠링 1차 채점을 통과했습니다. 한국어 뜻을 확인한 뒤 최종 통과 여부가 반영됩니다.'
      : !passed
        ? `10분 후 다시 도전할 수 있습니다. ${`다음 ${currentRound + 1}회차 통과 기준은 ${nextCutoff}점입니다.`}`
        : '이번 단계를 통과했습니다. 학습공간에서 다음 학습을 확인해 보세요.';
    document.getElementById('vocabTestContent').innerHTML = `
      <div class="grammar-result-page vocab-result-page">
        <header class="grammar-result-heading"><div><p class="grammar-result-eyebrow">VOCABULARY TEST · ${currentRound}회차</p><h1>단어 테스트를 마쳤어요.</h1><p id="vocabSyncStatus" role="status" aria-live="polite" class="grammar-result-subtitle"></p><p class="grammar-result-subtitle">${this.escapeHtml(student?.name || '')} 학생 · ${this.escapeHtml(vt.setTitle)} · ${this.escapeHtml(directionLabel)}</p></div><button type="button" class="grammar-result-back" onclick="App.exitVocabTest()">학습공간으로 돌아가기 <span aria-hidden="true">→</span></button></header>
        <section class="grammar-result-panel grammar-result-practice vocab-single-result ${resultClass}">
          <div class="grammar-result-panel-top"><span class="grammar-result-eyebrow">${this.escapeHtml(directionLabel)} · ${currentRound}회차</span><span class="grammar-result-tag">${waitingGrading ? '채점 대기' : '채점 완료'}</span></div>
          <div class="grammar-result-main"><h2 class="grammar-completion-verdict">${verdict}</h2><p>${resultMessage}</p><div class="grammar-completion-score vocab-score-value">${score}<span>점</span></div>${waitingGrading ? '<p>스펠링 1차 점수 · 최종 성적은 채점 후 확정</p>' : ''}
            <div class="vocab-result-stats"><div><strong>${total}</strong><span>출제 단어</span></div><div><strong>${correctCount}</strong><span>${vt.direction === 4 ? '스펠링 정답' : '정답'}</span></div><div><strong>${wrongAnswers.length}</strong><span>${vt.direction === 4 ? '스펠링 오답' : '오답'}</span></div></div>
            <div class="grammar-result-score-track"><div style="width:${score}%"></div><span style="left:${cutoffScore}%" title="통과 기준 ${cutoffScore}점"></span></div>
          </div>
          <p class="vocab-result-guidance">${nextMessage}</p>
          <div class="grammar-result-panel-bottom"><span>${currentRound}회차 통과 기준 <strong>${cutoffScore}점 이상</strong></span>${wrongAnswers.length ? '<a href="#vocabWrongAnswers" class="grammar-result-action">오답 확인 <span aria-hidden="true">↓</span></a>' : '<span>답안 제출 완료</span>'}${!passed && retryAvailableAt ? '<span class="font-bold">10분 후 재응시 가능</span>' : ''}</div>
        </section>
        <section id="vocabWrongAnswers" class="vocab-result-review">
        <!-- 오답 노트 섹션 -->
        ${wrongAnswers.length > 0 ? `
          <div class="text-left space-y-3 pt-2">
            <h4 class="text-xs font-bold text-rose-700 flex items-center gap-1.5 uppercase tracking-wider">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>${vt.direction === 4 ? '틀린 단어 목록' : '틀린 단어 오답 노트'} (${wrongAnswers.length}개)</span>
            </h4>
            ${this.renderVocabWrongAnswerList(wrongAnswers.map(item => {
              const word = vt.questions.find(q => q.word?.en === item.question || q.word?.ko === item.question || q.word?.en === item.correct || q.word?.ko === item.correct)?.word;
              return { ...item, desc: item.desc || word?.desc };
            }))}
          </div>
        ` : `
          <div class="p-4 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">
            ${waitingGrading ? '스펠링 1차 채점이 끝났습니다. 한국어 뜻은 채점 후 최종 성적에 반영됩니다.' : vt.direction === 3 ? '모든 스펠링 문제를 완벽하게 맞혔습니다! (100점)' : (vt.direction === 2 ? '모든 객관식 문제를 완벽하게 맞혔습니다! (100점)' : '모든 단어 문제를 완벽하게 맞혔습니다! (100점)')}
          </div>
        `}

        </section>
      </div>`;
    AppData.updateVocabSyncStatus?.();
    window.scrollTo({ top: 0 });
  },

  async exitVocabTest() {
    const vt = this.state.vocabTest;
    if (vt?.localSaveFailed) { this.toast('아직 결과를 기기에 보관하지 못했어요. 결과 저장을 다시 시도해주세요.', 'error'); return; }
    if (vt && !vt.isCompleted) {
      const confirmExit = confirm('시험 진행 중에 나가면 0점(불합격) 처리되며 10분 동안 다시 응시할 수 없습니다.\n\n정말 시험을 종료하고 나가시겠습니까?');
      if (!confirmExit) return;
      try {
        await this.forfeitVocabTest();
      } catch (err) {
        console.error(err);
      }
    }
    this.clearVocabQuestionTimer();
    const studentId = Number(vt?.studentId || this.state.selectedStudentId || this.state.adminSelectedStudentId || 1);
    this.state.vocabTest = null;

    if (this.state.isStudentLoggedIn) {
      this.selectStudent(studentId);
    } else if (this.state.isAdminLoggedIn) {
      this.selectStudent(studentId);
    } else {
      if (studentId && AppData.getStudentById(studentId)) {
        this.state.isStudentLoggedIn = true;
        this.selectStudent(studentId);
      } else {
        await this.showLanding();
      }
    }
  },

  async forfeitVocabTest() {
    const vt = this.state.vocabTest;
    if (!vt || vt.isCompleted) return;
    this.clearVocabQuestionTimer();
    vt.isCompleted = true;

    const total = vt.allWords.length;
    const test = vt.testId && AppData.getTests().find(item => item.id === vt.testId);
    const completedAt = new Date().toISOString();
    const startedAt = vt.startedAt || completedAt;

    const wrongAnswers = vt.questions.map(q => ({
      question: q.word ? `${q.word.en} (${q.word.ko})` : q.question,
      answer: q.answered || '중도 이탈',
      correct: q.word ? `${q.word.en} : ${q.word.ko}` : q.correct
    }));

    try {
      await AppData.saveVocabTestResult({
        studentId: vt.studentId,
        setId: vt.setId,
        testId: vt.testId,
        direction: vt.direction,
        score: 0,
        correctCount: 0,
        total,
        passed: false,
        round: vt.currentRound || 1,
        cutoffScore: vt.cutoffScore || 80,
        wrongAnswers,
        retryAvailableAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        startedAt,
        completedAt
      });
      if (test && !AppData.queueVocabResult) {
        test.status = 'FAIL';
        await this.updateVocabScheduleStatus(test.id);
      }
      this.toast('시험 중도 이탈로 0점(불합격) 처리되었습니다. (10분 후 재응시 가능)', 'error');
    } catch (error) {
      console.error(error);
    }
  },

  getBaseVocabCutoffScore(test, direction = null) {
    if (!test) return 80;


    // 1. 유형별 개별 커트라인 우선 조회
    if (direction) {
      if (test.vocabCutoffs && typeof test.vocabCutoffs === 'object') {
        const dirVal = Number(test.vocabCutoffs[direction] ?? test.vocabCutoffs[String(direction)]);
        if (Number.isInteger(dirVal) && dirVal >= 1 && dirVal <= 100) {
          return dirVal;
        }
      }
      if (test[`vocabCutoff_${direction}`] !== undefined) {
        const dirVal = Number(test[`vocabCutoff_${direction}`]);
        if (Number.isInteger(dirVal) && dirVal >= 1 && dirVal <= 100) {
          return dirVal;
        }
      }
    }

    // 2. 단일 vocabCutoff fallback
    const configuredCutoff = Number(test?.vocabCutoff);
    if (Number.isInteger(configuredCutoff) && configuredCutoff >= 1 && configuredCutoff <= 100) {
      return configuredCutoff;
    }

    // 3. 기존 legacy cutoff 문자열 파싱
    const match = String(test?.cutoff || '').match(/(\d+)/);
    const legacyCutoff = match ? Number(match[1]) : null;
    return Number.isInteger(legacyCutoff) && legacyCutoff >= 1 && legacyCutoff <= 100 ? legacyCutoff : 80;
  },

  getVocabCutoffScore(test, direction = null, round = 1) {
    const baseCutoff = this.getBaseVocabCutoffScore(test, direction);
    const r = Math.max(1, Number(round) || 1);
    let extra = 0;
    if (r === 2) {
      extra = 2; // 2회차: +2점
    } else if (r >= 3) {
      extra = 4; // 3회차: +4점, 4회차부터 +4점 고정
    }
    return Math.min(100, baseCutoff + extra);
  },

  getVocabAttemptCount(studentId, setId, direction, testId = null) {
    const result = AppData.getVocabTestResult(studentId, setId, direction, testId);
    if (!result) return 0;
    if (Array.isArray(result.attempts) && result.attempts.length > 0) {
      return result.attempts.length;
    }
    return (result.score !== undefined || result.completedAt) ? 1 : 0;
  },

  async updateVocabScheduleStatus(testId) {
    const test = AppData.getTests().find(item => item.id === testId);
    if (!test || test.type !== 'VOCAB') return;



    // 🔥 영영풀이 전용 시험인 경우: Direction 5(영영풀이) 결과만으로 합격/불합격 판정
    if (test.isEnglishDefTest) {
      const results = AppData.getVocabTestResults().filter(result => result.testId === testId);
      const defResult = results.find(r => r.direction === 5);
      if (defResult) {
        if (defResult.passed) {
          test.status = 'PASS';
          test.score = `영영풀이 ${defResult.score}점 (통과)`;
        } else {
          test.status = 'FAIL';
          test.score = `영영풀이 ${defResult.score}점 (불합격)`;
        }
      } else {
        test.status = 'SCHEDULED';
        test.score = '';
      }
      test.retestStatus = 'NONE';
      await AppData.saveOrUpdateTest(test);
      return;
    }

    const requiredDirections = AppData.getVocabDirections(test);
    const results = AppData.getVocabTestResults().filter(result => result.testId === testId && requiredDirections.includes(Number(result.direction)));
    // 실제 출제한 유형만 모두 통과하면 전체 PASS.
    const allPassed = requiredDirections.length > 0 && requiredDirections.every(dir => results.some(r => Number(r.direction) === dir && r.passed));
    const hasWaitingGrading = results.some(r => r.direction === 4 && r.waitingGrading && !r.gradedByAdmin);
    const anyFailed = results.some(r => !r.passed && !r.waitingGrading);

    test.status = allPassed ? 'PASS' : (hasWaitingGrading ? 'SCHEDULED' : (results.length > 0 ? (anyFailed ? 'FAIL' : 'SCHEDULED') : 'SCHEDULED'));
    test.score = results
      .sort((a, b) => a.direction - b.direction)
      .map(result => {
        if (result.direction === 4 && result.waitingGrading && !result.gradedByAdmin) {
          return `${this.getVocabDirectionShortLabel(result.direction)} ${result.score}점(채점대기)`;
        }
        return `${this.getVocabDirectionShortLabel(result.direction)} ${result.score}점`;
      })
      .join(' · ');
    test.retestStatus = 'NONE';
    await AppData.saveOrUpdateTest(test);
  },


  // ── 관리자 단어 채점 모달 ──────────────────────────────────
  _vocabGradingState: null,

  async openVocabGradingModal(studentIdOrResult, testId, direction, completedAt) {
    let result = null;

    if (typeof studentIdOrResult === 'object' && studentIdOrResult !== null) {
      result = studentIdOrResult;
    } else {
      const studentId = studentIdOrResult;
      const allResults = AppData.getVocabTestResults();

      // 1. 정확한 매칭 시도
      result = allResults.find(r =>
        String(r.studentId) === String(studentId) &&
        String(r.testId || '') === String(testId || '') &&
        Number(r.direction) === Number(direction) &&
        (!completedAt || r.completedAt === completedAt)
      );

      // 2. 시간 제외 매칭
      if (!result) {
        result = allResults.find(r =>
          String(r.studentId) === String(studentId) &&
          String(r.testId || '') === String(testId || '') &&
          Number(r.direction) === Number(direction)
        );
      }

      // 3. ID 매칭 시도
      if (!result) {
        result = allResults.find(r => r.id === studentId);
      }
    }

    if (!result) {
      this.toast('채점 대상을 찾을 수 없습니다.', 'error');
      return;
    }

    const student = AppData.getStudents().find(s => String(s.id) === String(result.studentId));
    const test = AppData.getTests().find(t => String(t.id) === String(result.testId));
    let matchingSets = [];
    if (test) {
      const setIds = Array.isArray(test.vocabSetIds) && test.vocabSetIds.length > 0
        ? test.vocabSetIds
        : (test.vocabSetId ? [test.vocabSetId] : []);
      matchingSets = setIds.map(id => AppData.getVocabSets().find(s => String(s.id) === String(id))).filter(Boolean);
    }
    const set = matchingSets[0] || AppData.getVocabSets().find(s => String(s.id) === String(result.setId));
    if (matchingSets.length === 0 && set) {
      matchingSets = [set];
    }
    const combinedSetWords = [];
    matchingSets.forEach(s => {
      if (Array.isArray(s.words)) combinedSetWords.push(...s.words);
    });
    const setTitles = matchingSets.map(s => s.title).join(' + ') || set?.title || '단어 세트';

    // questionDetails가 없는 이전 기록인 경우 세트 단어로부터 기본 구성
    if (!result.questionDetails || result.questionDetails.length === 0) {
      const wrongList = result.wrongAnswers || [];
      if (combinedSetWords.length > 0) {
        result.questionDetails = combinedSetWords.map((w, idx) => {
          const wrongItem = wrongList.find(wr =>
            (wr.question && wr.question.includes(w.en)) ||
            (wr.correct && wr.correct.includes(w.en))
          );
          const isCorrect = !wrongItem;
          return {
            index: idx,
            word: w,
            question: w.en,
            correct: `${w.en} : ${w.ko}`,
            answered: wrongItem ? wrongItem.answer : `${w.en} / ${w.ko}`,
            spellingInput: wrongItem ? (wrongItem.answer?.split('/')[0]?.trim() || '') : w.en,
            meaningInput: wrongItem ? (wrongItem.answer?.split('/')[1]?.trim() || '') : w.ko,
            spellingCorrect: isCorrect,
            meaningCorrect: isCorrect,
            isCorrect: isCorrect
          };
        });
      } else {
        this.toast('이 시험 기록의 단어 정보를 불러올 수 없습니다.', 'warning');
        return;
      }
    }

    // 채점 상태를 클론해서 메모리에서 수정
    this._vocabGradingState = {
      result,
      student,
      test,
      set,
      items: result.questionDetails.map((q, i) => ({ ...q, _gradingCorrect: Boolean(q.isCorrect) }))
    };

    // 헤더/서브타이틀
    document.getElementById('vocabGradingTitle').textContent = `${student?.name || '학생'} — 통합 채점`;
    document.getElementById('vocabGradingSubtitle').textContent =
      `${test?.title || '단어 테스트'} · ${setTitles} · ${this.getVocabResultTimeString(result)}`;

    this._renderVocabGradingSummary();
    this._renderVocabGradingItems();

    const modal = document.getElementById('vocabGradingModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  closeVocabGradingModal() {
    const modal = document.getElementById('vocabGradingModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    this._vocabGradingState = null;
  },

  _renderVocabGradingSummary() {
    const gs = this._vocabGradingState;
    if (!gs) return;
    const items = gs.items;
    const correctCount = items.filter(q => q._gradingCorrect).length;
    const total = items.length;
    const test = gs.test;
    const cutoffScore = this.getVocabCutoffScore(test, 4);
    const score = Math.round((correctCount / total) * 100);
    const passed = score >= cutoffScore;
    const pendingCount = items.filter(q => q.spellingCorrect && !q.meaningCorrect).length;

    document.getElementById('vocabGradingSummaryBar').innerHTML = `
      <div class="flex items-center gap-1.5">
        <span class="font-bold text-indigo-900">정답</span>
        <span class="font-black text-indigo-700 text-sm">${correctCount} / ${total}</span>
      </div>
      <div class="w-px h-4 bg-indigo-200"></div>
      <div class="flex items-center gap-1.5">
        <span class="font-bold text-indigo-900">점수</span>
        <span class="font-black text-sm ${passed ? 'text-emerald-700' : 'text-rose-700'}">${score}점</span>
        <span class="font-bold text-xs ${passed ? 'text-emerald-600 bg-emerald-100 border-emerald-200' : 'text-rose-600 bg-rose-100 border-rose-200'} px-2 py-0.5 rounded-full border">${passed ? 'PASS' : 'FAIL'}</span>
      </div>
      ${pendingCount > 0 ? `
        <div class="w-px h-4 bg-indigo-200"></div>
        <div class="flex items-center gap-1 text-amber-700">
          <i class="fa-solid fa-triangle-exclamation text-amber-500 text-[10px]"></i>
          <span>뜻 검토 필요 ${pendingCount}개</span>
        </div>
      ` : ''}
      <div class="ml-auto text-[10px] text-indigo-400">합격 기준: ${cutoffScore}점</div>
    `;
  },

  _renderVocabGradingItems() {
    const gs = this._vocabGradingState;
    if (!gs) return;
    const items = gs.items;

    const html = items.map((q, i) => {
      const isSpellingWrong = !q.spellingCorrect;
      const spellingOk = q.spellingCorrect;
      const isMeaningPending = spellingOk && !q.isCorrect; // 스펠링은 맞지만 원래 오답(뜻 오류) -> 검토 대상
      const isMeaningManuallyOverridden = spellingOk && q._gradingCorrect !== q.isCorrect;

      let statusBadge = '';
      let cardBg = 'bg-white border-slate-200';

      if (isSpellingWrong) {
        cardBg = 'bg-rose-50/60 border-rose-200';
        statusBadge = `<span class="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200 flex items-center gap-1"><i class="fa-solid fa-times-circle"></i> 스펠링 오답</span>`;
      } else if (q._gradingCorrect) {
        cardBg = 'bg-emerald-50/60 border-emerald-200';
        statusBadge = `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1"><i class="fa-solid fa-check-circle"></i> 정답</span>`;
      } else {
        cardBg = 'bg-amber-50/60 border-amber-200';
        statusBadge = `<span class="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1"><i class="fa-solid fa-exclamation-circle"></i> 뜻 오답</span>`;
      }

      const wordEn = q.word?.en || q.question || '';
      const wordKo = q.word?.ko || '';
      const spellingIn = q.spellingInput || '';
      const meaningIn = q.meaningInput || '';

      const toggleBtn = !isSpellingWrong ? `
        <button onclick="App._toggleVocabGradingItem(${i})"
          class="text-[11px] font-bold px-3 py-1.5 rounded-xl border transition flex items-center gap-1 ${q._gradingCorrect
            ? 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50'
            : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}">
          ${q._gradingCorrect
            ? '<i class="fa-solid fa-xmark"></i> 오답으로 변경'
            : '<i class="fa-solid fa-check"></i> 정답 인정'}
        </button>` : '';

      return `
        <div class="rounded-xl border ${cardBg} p-3.5 space-y-2.5" id="grading-item-${i}">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-bold text-slate-400 bg-slate-100 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">${i + 1}</span>
              <div>
                <span class="font-extrabold text-slate-800 text-sm">${this.escapeHtml(wordEn)}</span>
                <span class="text-slate-400 text-xs ml-1.5">${this.escapeHtml(wordKo)}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              ${statusBadge}
              ${toggleBtn}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="rounded-lg p-2 ${spellingOk ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}">
              <p class="text-[10px] font-bold ${spellingOk ? 'text-emerald-600' : 'text-rose-500'} mb-0.5">스펠링 입력</p>
              <p class="font-mono font-bold ${spellingOk ? 'text-emerald-800' : 'text-rose-700'}">${this.escapeHtml(spellingIn) || '(미입력)'}</p>
              ${!spellingOk ? `<p class="text-[10px] text-slate-500 mt-0.5">정답: <strong>${this.escapeHtml(wordEn)}</strong></p>` : ''}
            </div>
            <div class="rounded-lg p-2 ${q._gradingCorrect && spellingOk ? 'bg-emerald-50 border border-emerald-200' : spellingOk ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}">
              <p class="text-[10px] font-bold ${q._gradingCorrect && spellingOk ? 'text-emerald-600' : spellingOk ? 'text-amber-600' : 'text-slate-400'} mb-0.5">뜻 입력</p>
              <p class="font-bold ${q._gradingCorrect && spellingOk ? 'text-emerald-800' : spellingOk ? 'text-amber-800' : 'text-slate-400'}">${this.escapeHtml(meaningIn) || '(미입력)'}</p>
              ${spellingOk ? `<p class="text-[10px] text-slate-500 mt-0.5">정답 뜻: <strong>${this.escapeHtml(wordKo)}</strong></p>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    document.getElementById('vocabGradingQuestionsList').innerHTML = html;
  },

  _toggleVocabGradingItem(index) {
    const gs = this._vocabGradingState;
    if (!gs) return;
    const item = gs.items[index];
    if (!item || !item.spellingCorrect) return; // 스펠링 오답은 토글 불가
    item._gradingCorrect = !item._gradingCorrect;
    this._renderVocabGradingSummary();
    this._renderVocabGradingItems();
  },

  autoGradeWithAI() {
    const gs = this._vocabGradingState;
    if (!gs) return;
    let autoGrantedCount = 0;
    gs.items.forEach(item => {
      if (!item.spellingCorrect) return; // 스펠링 오답은 건드리지 않음
      if (item.isCorrect) return; // 이미 정답인 항목은 그냥 유지
      // AI 시맨틱 분석
      const evalResult = this.evaluateKoreanMeaningAI(item.meaningInput || '', item.word?.ko || '');
      if (evalResult.match) {
        item._gradingCorrect = true;
        item._aiGranted = true;
        item._aiReason = evalResult.reason;
        autoGrantedCount++;
      }
    });
    this._renderVocabGradingSummary();
    this._renderVocabGradingItems();
    if (autoGrantedCount > 0) {
      this.toast(`AI가 ${autoGrantedCount}개 문항의 뜻을 유의어/동의어로 자동 인정했습니다. 검토 후 저장해주세요.`, 'success');
    } else {
      this.toast('AI가 추가로 인정할 수 있는 뜻이 없습니다.', 'info');
    }
  },

  async saveVocabGradingChanges() {
    const gs = this._vocabGradingState;
    if (!gs) return;
    const items = gs.items;
    const total = items.length;
    const correctCount = items.filter(q => q._gradingCorrect).length;
    const score = Math.round((correctCount / total) * 100);
    const test = gs.test;
    const cutoffScore = this.getVocabCutoffScore(test, 4);
    const passed = score >= cutoffScore;

    const updatedDetails = items.map(q => ({
      ...q,
      isCorrect: q._gradingCorrect
    }));
    const updatedWrongAnswers = updatedDetails.filter(q => !q.isCorrect).map(q => ({
      question: q.word ? `${q.word.en} (${q.word.ko})` : q.question,
      answer: q.answered || '',
      correct: q.word ? `${q.word.en} : ${q.word.ko}` : q.correct
    }));

    const updatedResult = {
      ...gs.result,
      score,
      correctCount,
      total,
      passed,
      waitingGrading: false,
      questionDetails: updatedDetails,
      wrongAnswers: updatedWrongAnswers,
      retryAvailableAt: passed ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      gradedByAdmin: true,
      gradedAt: new Date().toISOString()
    };

    try {
      await AppData.saveVocabTestResult(updatedResult);
      if (test && !AppData.queueVocabResult) await this.updateVocabScheduleStatus(test.id);
      this.toast(`채점 저장 완료! (${score}점, ${passed ? 'PASS 통과' : 'FAIL 불합격'})`, passed ? 'success' : 'error');
      this.closeVocabGradingModal();
      // 관리자 탭 새로고침
      if (this.state.adminTab === 'vocab') this.renderAdminVocabTab?.();
    } catch (error) {
      console.error('채점 저장 오류:', error);
      this.toast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  getAllTextMemorizePassages() {
    const ybmPassages = (typeof YBM_ENGLISH2_PASSAGES !== 'undefined') ? YBM_ENGLISH2_PASSAGES : [];
    return ybmPassages;
  },

  onTextMemorizeBookChange(bookName) {
    this.renderTextMemorizePassages(bookName);
  },

  onTextMemorizeDescriptiveOnlyChange() {
    const bookName = document.getElementById('formTextMemorizeBookSelect')?.value || 'YBM(박준언) 공통영어 2';
    const checked = Array.from(document.querySelectorAll('input[name="formPassageCheckbox"]:checked')).map(cb => cb.value);
    this.renderTextMemorizePassages(bookName, checked);
  },

  renderTextMemorizePassages(bookName = 'YBM(박준언) 공통영어 2', selectedPassageIds = []) {
    const container = document.getElementById('formTextMemorizePassageList');
    if (!container) return;

    const allPassages = this.getAllTextMemorizePassages();
    // 교재별 필터링: YBM은 1과와 2과 본문만 허용 (Further Reading 및 3, 4과 배제), 모의고사는 29~40번
    const filtered = allPassages.filter(p => {
      if (!bookName) return true;
      if (bookName.includes('YBM')) {
        return (p.book && p.book.includes('YBM')) && (p.lesson === 1 || p.lesson === 2);
      }
      if (bookName.includes('인천학평') || bookName.includes('모의고사')) {
        return (p.book && (p.book.includes('인천학평') || p.book.includes('29~40')));
      }
      return p.book === bookName;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 py-3 text-center">선택한 교재의 본문 데이터가 없습니다.</p>';
      this.updateTextMemorizeCountBadge();
      return;
    }

    const isDescOnly = Boolean(document.getElementById('formTextMemorizeDescriptiveOnly')?.checked);

    // 단원(lesson)별 그룹화
    const lessonMap = {};
    filtered.forEach(p => {
      if (!lessonMap[p.lesson]) {
        lessonMap[p.lesson] = {
          lessonTitle: p.lessonTitle,
          passages: []
        };
      }
      lessonMap[p.lesson].passages.push(p);
    });

    let html = '';
    Object.keys(lessonMap).sort((a, b) => Number(a) - Number(b)).forEach(lessonNum => {
      const group = lessonMap[lessonNum];
      const allSelectedInLesson = group.passages.every(p => selectedPassageIds.includes(p.id));

      html += `
        <div class="p-3 rounded-xl bg-white border border-indigo-200 shadow-2xs space-y-2">
          <div class="flex items-center justify-between gap-2 border-b border-indigo-100 pb-1.5">
            <h5 class="text-xs font-black text-indigo-950 flex items-center gap-1.5">
              <i class="fa-solid fa-bookmark text-indigo-500"></i> ${this.escapeHtml(group.lessonTitle)}
            </h5>
            <button type="button" onclick="App.toggleAllPassagesInLesson(${lessonNum}, ${!allSelectedInLesson})" class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer">
              ${allSelectedInLesson ? '단원 전체 해제' : '단원 전체 선택'}
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            ${group.passages.map(p => {
              const isChecked = selectedPassageIds.includes(p.id);
              const sentenceCount = p.sentences.length;
              const descCount = p.sentences.filter(s => s.isDescriptiveTarget).length;
              const badgeText = isDescOnly
                ? `<span class="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-black">서술형 대비 ${descCount}문장</span>`
                : `<span class="text-slate-500 font-semibold">총 ${sentenceCount}문장</span> <span class="text-violet-600 font-bold ml-1">(서술형 ${descCount})</span>`;

              return `
                <label class="flex items-start gap-2 p-2.5 rounded-lg border ${isChecked ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-bold' : 'bg-slate-50/50 border-slate-200 text-slate-700 font-medium'} hover:bg-indigo-50 transition cursor-pointer text-xs">
                  <input type="checkbox" name="formPassageCheckbox" value="${p.id}" data-lesson="${p.lesson}" ${isChecked ? 'checked' : ''} onchange="App.onPassageCheckboxChange(this)" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500" />
                  <div class="flex-1 min-w-0">
                    <p class="font-bold leading-tight">${this.escapeHtml(p.partTitle)}</p>
                    <p class="text-[10px] mt-1">${badgeText}</p>
                  </div>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    this.updateTextMemorizeCountBadge();
  },

  onPassageCheckboxChange(checkbox) {
    const parentLabel = checkbox.closest('label');
    if (parentLabel) {
      if (checkbox.checked) {
        parentLabel.className = 'flex items-start gap-2 p-2.5 rounded-lg border bg-indigo-50/80 border-indigo-300 text-indigo-950 font-bold hover:bg-indigo-50 transition cursor-pointer text-xs';
      } else {
        parentLabel.className = 'flex items-start gap-2 p-2.5 rounded-lg border bg-slate-50/50 border-slate-200 text-slate-700 font-medium hover:bg-indigo-50 transition cursor-pointer text-xs';
      }
    }
    this.updateTextMemorizeCountBadge();
  },

  toggleAllPassagesInLesson(lessonNum, checked) {
    const checkboxes = document.querySelectorAll(`input[name="formPassageCheckbox"][data-lesson="${lessonNum}"]`);
    checkboxes.forEach(cb => {
      cb.checked = checked;
      this.onPassageCheckboxChange(cb);
    });
    this.updateTextMemorizeCountBadge();
  },

  updateTextMemorizeCountBadge() {
    const checked = Array.from(document.querySelectorAll('input[name="formPassageCheckbox"]:checked')).map(cb => cb.value);
    const badge = document.getElementById('formTextMemorizeCountBadge');
    const descBadge = document.getElementById('formTextMemorizeDescriptiveCountBadge');
    const isDescOnly = Boolean(document.getElementById('formTextMemorizeDescriptiveOnly')?.checked);

    const allPassages = this.getAllTextMemorizePassages();
    const matched = allPassages.filter(p => checked.includes(p.id));
    const totalSentences = matched.reduce((acc, p) => acc + p.sentences.length, 0);
    const descSentences = matched.reduce((acc, p) => acc + p.sentences.filter(s => s.isDescriptiveTarget).length, 0);

    if (descBadge) {
      descBadge.innerText = `${descSentences}문장`;
    }
    if (badge) {
      if (isDescOnly) {
        badge.innerText = `${checked.length}개 지문 선택됨 (서술형 엄선 ${descSentences}문장)`;
      } else {
        badge.innerText = `${checked.length}개 지문 선택됨 (총 ${totalSentences}문장 / 서술형 ${descSentences}문장)`;
      }
    }
  },

  // ── 스마트 빈칸 자동 추출 엔진 (시험 볼 때마다 랜덤으로 다른 위치 빈칸 생성) ──
  generateClozeBlanks(sentenceEn, sentIndex = 0) {
    const stopwords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
      'of', 'in', 'on', 'at', 'to', 'for', 'with', 'as', 'by', 'that',
      'this', 'it', 'its', 'they', 'them', 'their', 'he', 'his', 'him',
      'she', 'her', 'we', 'us', 'our', 'you', 'your', 'i', 'my', 'me',
      'so', 'if', 'not', 'no', 'do', 'does', 'did', 'have', 'has', 'had',
      'will', 'would', 'can', 'could', 'may', 'might', 'should', 'be',
      'been', 'being', 'than', 'into', 'who', 'which', 'from', 'when',
      'where', 'what', 'how', 'there', 'here', 'all', 'any', 'some',
      'up', 'out', 'off', 'down', 'over', 'under', 'again', 'then', 'once'
    ]);

    // 토큰 분리 (공백 기준)
    const tokens = sentenceEn.split(/\s+/);
    const blanks = [];

    // 빈칸 후보군 찾기
    const candidates = [];
    tokens.forEach((token, tokenIdx) => {
      const match = token.match(/^([^a-zA-Z0-9]*)([a-zA-Z0-9'-]+)([^a-zA-Z0-9]*)$/);
      if (match) {
        const prefix = match[1];
        const word = match[2];
        const suffix = match[3];
        const lower = word.toLowerCase();

        // 3글자 이상이고 불용어가 아닌 핵심 단어
        if (word.length >= 3 && !stopwords.has(lower) && !/^\d+$/.test(word)) {
          candidates.push({ tokenIdx, prefix, word, suffix });
        }
      }
    });

    // 문장당 빈칸 개수 계산 (단어 수의 약 35~45%, 최소 1개, 최대 4개)
    let targetCount = Math.max(1, Math.min(candidates.length, Math.round(candidates.length * 0.4)));
    if (candidates.length <= 2) targetCount = candidates.length;

    // 매 시험마다 다른 빈칸을 뚫기 위해 랜덤 셔플 (Fisher-Yates) 후 targetCount개 선택
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    const selectedIndices = new Set(shuffled.slice(0, targetCount).map(c => c.tokenIdx));

    let blankSeq = 0;
    const tokenObjects = tokens.map((token, tokenIdx) => {
      const match = token.match(/^([^a-zA-Z0-9]*)([a-zA-Z0-9'-]+)([^a-zA-Z0-9]*)$/);
      if (match && selectedIndices.has(tokenIdx)) {
        const prefix = match[1];
        const word = match[2];
        const suffix = match[3];
        const blankId = `blank_${sentIndex}_${blankSeq++}`;
        const blankObj = {
          id: blankId,
          sentIndex,
          prefix,
          word,
          cleanWord: word.toLowerCase(),
          suffix,
          firstChar: word.charAt(0),
          length: word.length
        };
        blanks.push(blankObj);
        return { isBlank: true, blankObj };
      } else {
        return { isBlank: false, text: token };
      }
    });

    return { tokens: tokenObjects, blanks };
  },

  // ── 캘린더/목록에서 본문암기 시험 상세 모달 ──────────────────
  openTextMemorizeScheduleModal(testId) {
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) { this.toast('시험 정보를 찾을 수 없습니다.', 'error'); return; }

    const student = AppData.getStudentById(test.studentId);
    const timeStatus = this.getTestTimeStatus(test);
    const existingResult = AppData.getTextMemorizeResult(test.studentId, test.id);
    const isPassed = test.status === 'PASS' || existingResult?.passed;
    const isAdmin = this.state.isAdminLoggedIn;

    const allPassages = this.getAllTextMemorizePassages();
    let passageIds = test.passageIds || [];
    if ((!Array.isArray(passageIds) || passageIds.length === 0) && allPassages.length > 0) {
      passageIds = [allPassages[0].id];
    }
    const matchedPassages = allPassages.filter(p => passageIds.includes(p.id));
    const isDescriptiveOnly = Boolean(test.textMemorizeDescriptiveOnly);
    const totalSentences = isDescriptiveOnly
      ? matchedPassages.reduce((acc, p) => acc + p.sentences.filter(s => s.isDescriptiveTarget).length, 0)
      : matchedPassages.reduce((acc, p) => acc + (p.sentences?.length || 0), 0);

    document.getElementById('tmScheduleStudentBadge').innerText = student ? `${student.name} 학생 · ${isDescriptiveOnly ? '서술형 대비 본문암기' : '본문암기'}` : '본문암기 테스트';
    document.getElementById('tmScheduleTitle').innerText = test.title || '본문암기 테스트';

    let statusBadge = { class: 'bg-blue-100 text-blue-800 border border-blue-200', label: '시험 대기' };
    if (isPassed) {
      statusBadge = { class: 'bg-emerald-100 text-emerald-800 border border-emerald-300', label: '완료 (PASS)' };
    } else if (existingResult && !existingResult.passed) {
      if (test.allowRetest) {
        statusBadge = { class: 'bg-amber-100 text-amber-800 border border-amber-300', label: '재시험 응시 가능' };
      } else {
        statusBadge = { class: 'bg-rose-100 text-rose-800 border border-rose-300', label: '불합격 (FAIL)' };
      }
    } else if (test.allowLate) {
      statusBadge = { class: 'bg-emerald-100 text-emerald-800 border border-emerald-300', label: '상시 응시 가능' };
    } else if (timeStatus.status === 'EXPIRED') {
      statusBadge = { class: 'bg-rose-100 text-rose-800 border border-rose-300', label: '마감' };
    } else if (timeStatus.status === 'NOT_STARTED') {
      statusBadge = { class: 'bg-blue-100 text-blue-800 border border-blue-200', label: '시작 전' };
    } else {
      statusBadge = { class: 'bg-emerald-100 text-emerald-800 border border-emerald-300', label: '응시 가능' };
    }

    let actionButtonHtml = '';
    if (isAdmin) {
      actionButtonHtml = `
        <div class="space-y-2.5 pt-2">
          ${existingResult ? `
            <div class="p-3.5 rounded-xl ${existingResult.passed ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-amber-50 border border-amber-200 text-amber-800'} text-xs font-semibold flex items-center justify-between">
              <span>학생 점수: <strong>${existingResult.score}점 (${existingResult.correct}/${existingResult.total} 정답)</strong></span>
              <span class="px-2.5 py-1 rounded-full text-xs font-extrabold ${existingResult.passed ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}">${existingResult.passed ? 'PASS 통과' : '불합격'}</span>
            </div>

            <!-- 관리자 재시험 허용 토글 카드 (불합격 시 - 주황색) -->
            ${!existingResult.passed ? `
              <div class="p-3 rounded-xl border flex items-center justify-between gap-3 ${test.allowRetest ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}">
                <div>
                  <span class="text-xs font-bold ${test.allowRetest ? 'text-amber-900' : 'text-slate-700'}">
                    <i class="fa-solid fa-rotate-right mr-1"></i>재시험 응시 허용
                  </span>
                  <p class="text-[11px] ${test.allowRetest ? 'text-amber-700 font-semibold' : 'text-slate-400'}">
                    ${test.allowRetest ? '허용 중 — 학생이 재시험에 응시할 수 있습니다.' : '현재 비허용 — 학생이 다시 응시할 수 없습니다.'}
                  </p>
                </div>
                <button onclick="App.toggleTextMemorizeAllowRetest('${test.id}')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${test.allowRetest ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}">
                  ${test.allowRetest ? '허용 취소' : '재시험 허용하기'}
                </button>
              </div>
            ` : ''}
          ` : (isPassed ? `
            <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center">
              <i class="fa-solid fa-circle-check mr-1"></i>본시험 통과 처리됨 · 완료
            </div>
          ` : `
            <div class="p-3 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold text-center">
              <i class="fa-solid fa-clock mr-1"></i>아직 학생이 시험에 응시하지 않았습니다. (${timeStatus.label})
            </div>
          `)}
          <div class="flex items-center gap-2">
            <button onclick="App.openRescheduleModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
              <i class="fa-solid fa-calendar-days"></i> 일정 이동
            </button>
            <button onclick="App.openExtendTestModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
              <i class="fa-solid fa-clock-rotate-left"></i> 시험 시간 연장
            </button>
            <button onclick="App.closeTextMemorizeScheduleModal(); App.openEditTestModal('${test.id}')" class="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-pen-to-square"></i> 전체 수정
            </button>
          </div>
          <!-- 본문암기 시험지 형태로 보기 (관리자용) -->
          <button type="button" onclick="App.viewTextMemorizeExamPaper('${test.id}')" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
            <i class="fa-solid fa-file-lines"></i> 본문암기 시험지 형태로 보기 (인쇄 및 정답·해설)
          </button>
          <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}')" class="w-full py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-indigo-200 cursor-pointer shadow-2xs">
            <i class="fa-solid fa-book-open-reader text-indigo-600"></i> 본문 암기학습 미리보기 (학생 모드)
          </button>
        </div>
      `;
    } else {
      if (existingResult) {
        actionButtonHtml = `
          <div class="space-y-2.5 pt-2">
            <div class="p-3.5 rounded-xl ${existingResult.passed ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'} text-xs font-semibold flex items-center justify-between">
              <span>내 점수: <strong>${existingResult.score}점 (${existingResult.correct}/${existingResult.total} 정답)</strong></span>
              <span class="px-2.5 py-1 rounded-full text-xs font-extrabold ${existingResult.passed ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}">${existingResult.passed ? 'PASS 통과' : '불합격'}</span>
            </div>

            <!-- 본문암기 시험지 결과 확인 버튼 (학생용) -->
            <button type="button" onclick="App.viewTextMemorizeExamPaper('${test.id}')" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-file-lines"></i> 나의 풀이 답안 & 정답·해설 시험지 보기
            </button>

            ${existingResult.passed ? `
              <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center">
                <i class="fa-solid fa-circle-check mr-1"></i>축하합니다! 본문암기 테스트를 통과했습니다.
              </div>
              <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}')" class="w-full py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs">
                <i class="fa-solid fa-book-open"></i> 본문 복습 및 다시 외우기
              </button>
            ` : (test.allowRetest ? `
              <!-- 재시험 허용 시 본문 암기학습 & 재시험 응시 버튼 -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}')" class="py-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs sm:text-sm border border-indigo-200 transition flex items-center justify-center gap-2 cursor-pointer">
                  <i class="fa-solid fa-book-open-reader"></i> 본문 다시 외우기
                </button>
                <button type="button" onclick="App.closeTextMemorizeScheduleModal(); App.startTextMemorizeExam('${test.id}', ${test.studentId})" class="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
                  <i class="fa-solid fa-rotate-right"></i> 본문암기 재시험 응시
                </button>
              </div>
            ` : `
              <div class="p-3.5 rounded-xl border bg-slate-50 border-slate-200 text-slate-600 text-xs text-center font-medium leading-relaxed">
                <i class="fa-solid fa-lock text-slate-400 mr-1"></i>불합격 처리되었습니다.<br>빽빽이 검사 후 다시 시도해주세요.
              </div>
              <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}')" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-xs">
                <i class="fa-solid fa-book-open-reader"></i> 불합격 본문 집중 암기하기
              </button>
            `)}
          </div>
        `;
      } else if (isPassed) {
        actionButtonHtml = `
          <div class="space-y-2 pt-2">
            <div class="w-full py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-center gap-2">
              <i class="fa-solid fa-circle-check"></i> 본문암기 테스트 완료
            </div>
            <button type="button" onclick="App.viewTextMemorizeExamPaper('${test.id}')" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-file-lines"></i> 정답·해설 시험지 보기
            </button>
            <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}')" class="w-full py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs">
              <i class="fa-solid fa-book-open"></i> 본문 복습 및 다시 외우기
            </button>
          </div>
        `;
      } else if (timeStatus.status === 'NOT_STARTED') {
        actionButtonHtml = `
          <div class="space-y-2 pt-2">
            <button type="button" onclick="App.viewTextMemorizeExamPaper('${test.id}')" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-file-lines"></i> 출제 문항 시험지로 미리보기
            </button>
            <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}')" class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition shadow-md shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer">
              <i class="fa-solid fa-graduation-cap"></i> 시험 전 본문 미리 외우기 (암기학습)
            </button>
            <button disabled class="w-full py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold flex items-center justify-center gap-2 cursor-not-allowed">
              <i class="fa-solid fa-lock"></i> 시험 응시: ${timeStatus.label}
            </button>
            <p class="text-[11px] text-center text-slate-400">시험 시작 시간 전까지 본문 암기학습으로 미리 완벽하게 외워두세요!</p>
          </div>
        `;
      } else if (timeStatus.status === 'EXPIRED') {
        actionButtonHtml = `
          <div class="space-y-2 pt-2">
            <button type="button" onclick="App.viewTextMemorizeExamPaper('${test.id}')" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-file-lines"></i> 출제 문항 시험지로 보기
            </button>
            <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}')" class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition shadow-md shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer">
              <i class="fa-solid fa-book-open-reader"></i> 본문 자유 암기학습
            </button>
            <button disabled class="w-full py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold flex items-center justify-center gap-2 cursor-not-allowed">
              <i class="fa-solid fa-clock"></i> 응시 시간이 종료되었습니다
            </button>
            <p class="text-[11px] text-center text-slate-400">지정된 시험 종료 시각(${test.endTime || test.date})이 지났습니다.</p>
          </div>
        `;
      } else {
        actionButtonHtml = `
          <div class="space-y-2 pt-2">
            <button type="button" onclick="App.viewTextMemorizeExamPaper('${test.id}')" class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
              <i class="fa-solid fa-file-lines"></i> 출제 문항 시험지로 미리보기
            </button>
            <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}')" class="w-full py-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-2 border-indigo-300 font-black text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-xs">
              <i class="fa-solid fa-graduation-cap text-indigo-600"></i> 본문 미리 외우기 (암기학습)
            </button>
            <button type="button" onclick="App.closeTextMemorizeScheduleModal(); App.startTextMemorizeExam('${test.id}', ${test.studentId})" class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm transition shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer">
              <i class="fa-solid fa-play"></i> 본문암기 테스트 시작하기 (${totalSentences}문장)
            </button>
          </div>
        `;
      }
    }

    const isFullSentence = test.textMemorizeMode === 'FULL_SENTENCE';
    const cutoffText = test.textMemorizeCutoffType === 'WRONG_COUNT'
      ? `오답 ${test.textMemorizeMaxWrong ?? 3}개 이하 허용`
      : `${test.textMemorizeCutoff || test.cutoffScore || 80}점 이상`;

    const body = document.getElementById('tmScheduleBody');
    body.innerHTML = `
      <div class="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-1.5">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-600 text-white shadow-2xs inline-flex items-center gap-1">
              <i class="fa-solid fa-book text-[9px]"></i> ${this.escapeHtml(test.passageBook || 'YBM(박준언) 공통영어 2')}
            </span>
            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${isFullSentence ? 'bg-violet-100 text-violet-800 border border-violet-200' : 'bg-indigo-100 text-indigo-800 border border-indigo-200'} inline-flex items-center gap-1">
              <i class="fa-solid ${isFullSentence ? 'fa-pen-clip' : 'fa-align-left'} text-[9px]"></i> ${isFullSentence ? '문장 전체 영작 (서술형)' : '빈칸 채우기'}
            </span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold ${statusBadge.class}">
            ${statusBadge.label}
          </span>
        </div>
        <p class="text-xs text-slate-600 mt-1">
          시험일: <strong>${test.date}</strong> · 통과 기준: <strong class="text-indigo-900">${cutoffText}</strong>
        </p>
        <p class="text-xs text-slate-600 mt-0.5">
          출제 범위: <strong>총 ${matchedPassages.length}개 문단 · ${totalSentences}개 문장</strong>
        </p>
      </div>

      <!-- 본문 미리 외우기 (암기학습) 배너 카드 -->
      <div class="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200 shadow-2xs flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center text-lg shadow-xs flex-shrink-0">
            <i class="fa-solid fa-book-open-reader"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <h4 class="text-sm font-black text-slate-900 truncate">본문 미리 외우기</h4>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-200 text-indigo-800">총 ${totalSentences}문장</span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">플래시카드 · 가리기 · 어순배열로 미리 암기하세요</p>
          </div>
        </div>
        <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}')" class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs flex-shrink-0 cursor-pointer">
          <i class="fa-solid fa-graduation-cap text-[11px]"></i>
          <span>암기학습 시작</span>
        </button>
      </div>

      <!-- 문단 목록 -->
      <div class="space-y-2">
        <h4 class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <i class="fa-solid fa-list-check text-indigo-600"></i> 출제 문단 범위
        </h4>
        <div class="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
          ${matchedPassages.length > 0 ? matchedPassages.map((p, idx) => `
            <div class="p-3 text-xs flex items-center justify-between hover:bg-slate-50 transition gap-2">
              <div>
                <span class="font-bold text-indigo-900">${this.escapeHtml(p.lessonTitle)}</span>
                <p class="text-slate-600 font-medium mt-0.5">${this.escapeHtml(p.partTitle)}</p>
              </div>
              <div class="flex items-center gap-1.5 flex-shrink-0">
                <span class="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md whitespace-nowrap">${p.sentences.length}문장</span>
                <button type="button" onclick="App.openTextMemorizeStudyModal('${test.id}', '${p.id}')" class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition cursor-pointer" title="이 문단 집중 암기">
                  <i class="fa-solid fa-book-open text-[10px] mr-1"></i>외우기
                </button>
              </div>
            </div>
          `).join('') : '<div class="p-3 text-xs text-slate-400 text-center">선택된 본문 범위가 없습니다.</div>'}
        </div>
      </div>

      ${actionButtonHtml}
    `;

    this.showModal('textMemorizeScheduleModal');
  },

  closeTextMemorizeScheduleModal() {
    this.hideModal('textMemorizeScheduleModal');
  },

  // ── 학생 본문암기 시험 응시 엔진 ────────────────────────────
  startTextMemorizeExam(testId, studentId) {
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) { this.toast('시험 정보를 찾을 수 없습니다.', 'error'); return; }

    const existingResult = AppData.getTextMemorizeResult(test.studentId, test.id);
    const isPassed = test.status === 'PASS' || existingResult?.passed;
    if (isPassed && !this.state.isAdminLoggedIn) {
      this.toast('이미 통과(PASS)한 본문암기 시험입니다.', 'info');
      return;
    }
    if (existingResult && !existingResult.passed && !test.allowRetest && !this.state.isAdminLoggedIn) {
      this.toast('관리자의 재시험 허용 후 다시 응시할 수 있습니다.', 'warning');
      return;
    }

    // 재시험으로 응시하는 경우, 일회성 허용이므로 시작 즉시 allowRetest = false로 소진 처리
    if (test.allowRetest) {
      test.allowRetest = false;
      AppData.saveOrUpdateTest(test).catch(err => console.error('재시험 권한 일회성 소진 저장 오류:', err));
    }

    const allPassages = this.getAllTextMemorizePassages();
    const passageIds = test.passageIds || [];
    let matchedPassages = allPassages.filter(p => passageIds.includes(p.id));

    // 만약 passageIds가 구버전이거나 일치하지 않을 경우 안전하게 기본 본문 매칭
    if (matchedPassages.length === 0 && allPassages.length > 0) {
      if (test.title && (test.title.includes('2과') || (test.scope && test.scope.includes('2과')))) {
        matchedPassages = allPassages.filter(p => p.id === 'ybm2_l2_all' || p.lesson === 2);
      } else if (test.title && (test.title.includes('모의고사') || (test.scope && test.scope.includes('모의고사')))) {
        matchedPassages = allPassages.filter(p => p.book && p.book.includes('인천학평'));
      } else {
        matchedPassages = allPassages.filter(p => p.id === 'ybm2_l1_all' || p.lesson === 1);
      }
      if (matchedPassages.length === 0) matchedPassages = [allPassages[0]];
    }

    if (matchedPassages.length === 0) {
      this.toast('출제된 본문 데이터가 없습니다.', 'error');
      return;
    }

    const isFullSentence = test.textMemorizeMode === 'FULL_SENTENCE';
    const isDescriptiveOnly = Boolean(test.textMemorizeDescriptiveOnly);
    const cutoffType = test.textMemorizeCutoffType || 'SCORE';
    const maxWrong = test.textMemorizeMaxWrong ?? 3;
    const cutoffScore = test.textMemorizeCutoff || test.cutoffScore || 80;

    // 시험 상태 생성
    const examSentences = [];
    const allBlanks = [];
    let globalSentIdx = 0;

    matchedPassages.forEach(passage => {
      passage.sentences.forEach(s => {
        // 서술형 대비 문장만 출제 체크 시 서술형 문장만 추출
        if (isDescriptiveOnly && !s.isDescriptiveTarget) return;

        if (isFullSentence) {
          examSentences.push({
            sentIndex: globalSentIdx,
            passageId: passage.id,
            lessonTitle: passage.lessonTitle,
            partTitle: passage.partTitle,
            en: s.en,
            ko: s.ko,
            isDescriptiveTarget: Boolean(s.isDescriptiveTarget),
            grammarPoint: s.grammarPoint || ''
          });
        } else {
          const cloze = this.generateClozeBlanks(s.en, globalSentIdx);
          examSentences.push({
            sentIndex: globalSentIdx,
            passageId: passage.id,
            lessonTitle: passage.lessonTitle,
            partTitle: passage.partTitle,
            en: s.en,
            ko: s.ko,
            tokens: cloze.tokens,
            blanks: cloze.blanks,
            isDescriptiveTarget: Boolean(s.isDescriptiveTarget),
            grammarPoint: s.grammarPoint || ''
          });
          cloze.blanks.forEach(b => allBlanks.push(b));
        }
        globalSentIdx++;
      });
    });

    if (examSentences.length === 0) {
      this.toast('선택된 범위에 서술형 대비 문장이 없습니다.', 'warning');
      return;
    }

    this.state.textMemorizeExam = {
      testId,
      studentId: Number(studentId),
      testTitle: test.title || '본문암기 테스트',
      bookName: test.passageBook || 'YBM(박준언) 공통영어 2',
      cutoffScore,
      cutoffType,
      maxWrong,
      textMemorizeMode: isFullSentence ? 'FULL_SENTENCE' : 'CLOZE',
      passages: matchedPassages,
      sentences: examSentences,
      allBlanks: allBlanks,
      userAnswers: {}
    };

    document.getElementById('tmExamTitle').innerText = isFullSentence ? '본문암기 테스트 (문장 전체 영작)' : '본문암기 테스트 (빈칸 채우기)';
    document.getElementById('tmExamSubtitle').innerText = isFullSentence
      ? `${this.state.textMemorizeExam.bookName} · 총 ${matchedPassages.length}개 문단 · ${examSentences.length}개 문장 영작`
      : `${this.state.textMemorizeExam.bookName} · 총 ${matchedPassages.length}개 문단 · ${allBlanks.length}개 빈칸`;
    document.getElementById('tmExamProgressBadge').innerText = isFullSentence
      ? `0 / ${examSentences.length}`
      : `0 / ${allBlanks.length}`;

    this.renderTextMemorizeExamBody();
    this.showModal('textMemorizeExamModal');

    // 첫 번째 인풋/텍스트에어리어에 자동 포커스
    setTimeout(() => {
      if (isFullSentence) {
        const firstTextarea = document.querySelector('#tmExamBody textarea.tm-sentence-input');
        if (firstTextarea) firstTextarea.focus();
      } else {
        const firstInput = document.querySelector('#tmExamBody input.tm-blank-input');
        if (firstInput) firstInput.focus();
      }
    }, 200);
  },

  renderTextMemorizeExamBody() {
    const exam = this.state.textMemorizeExam;
    if (!exam) return;

    const container = document.getElementById('tmExamBody');
    if (!container) return;

    const isFullSentence = exam.textMemorizeMode === 'FULL_SENTENCE';

    // 문단별 렌더링
    let currentPartTitle = '';
    let html = '';

    exam.sentences.forEach((s, sIdx) => {
      if (s.partTitle !== currentPartTitle) {
        currentPartTitle = s.partTitle;
        html += `
          <div class="pt-4 first:pt-0">
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-100 text-indigo-900 text-xs font-black mb-3">
              <i class="fa-solid fa-book-open text-indigo-600"></i> ${this.escapeHtml(s.lessonTitle)} - ${this.escapeHtml(s.partTitle)}
            </div>
          </div>
        `;
      }

      if (isFullSentence) {
        const val = exam.userAnswers['sent_' + s.sentIndex] || '';
        html += `
          <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-indigo-300 transition space-y-2.5">
            <!-- 한글 해석 (메인 가이드) -->
            <div class="flex items-start gap-2">
              <span class="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
                ${sIdx + 1}
              </span>
              <p class="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                ${this.escapeHtml(s.ko)}
              </p>
            </div>

            <!-- 영어 문장 전체 입력 Textarea -->
            <div class="relative pl-8">
              <textarea
                id="tm_sent_${s.sentIndex}"
                data-sent-index="${s.sentIndex}"
                rows="2"
                placeholder="한글 해석을 보고 올바른 영어 문장 전체를 입력하세요 (한영 자동 변환 지원)"
                oninput="App.onTmSentenceInput(this, ${s.sentIndex})"
                onkeydown="App.onTmSentenceKeydown(event, this)"
                class="tm-sentence-input w-full p-3 text-xs sm:text-sm font-semibold rounded-xl border-2 border-indigo-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-hidden bg-white text-slate-900 resize-none transition shadow-2xs leading-relaxed"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
              >${this.escapeHtml(val)}</textarea>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-indigo-200 transition space-y-2">
            <!-- 영어 본문 + 빈칸 인풋들 -->
            <div class="text-sm sm:text-base leading-relaxed text-slate-900 font-medium flex flex-wrap items-center gap-x-1.5 gap-y-2">
              ${s.tokens.map(token => {
                if (!token.isBlank) {
                  return `<span>${this.escapeHtml(token.text)}</span>`;
                }
                const b = token.blankObj;
                const val = exam.userAnswers[b.id] || '';
                const placeholder = `${'_'.repeat(Math.max(3, b.length))}`;
                const widthCh = Math.max(5, b.length + 2);

                return `
                  ${b.prefix ? `<span>${this.escapeHtml(b.prefix)}</span>` : ''}
                  <input
                    type="text"
                    id="${b.id}"
                    data-blank-id="${b.id}"
                    value="${this.escapeHtml(val)}"
                    placeholder="${placeholder}"
                    style="width: ${widthCh}ch;"
                    oninput="App.onTmBlankInput(this, '${b.id}')"
                    onkeydown="App.onTmBlankKeydown(event, this)"
                    class="tm-blank-input inline-block text-center font-bold px-2 py-1 text-xs sm:text-sm bg-white border-2 border-indigo-300 rounded-lg text-indigo-950 focus:bg-indigo-50 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-hidden transition shadow-2xs"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                  />
                  ${b.suffix ? `<span>${this.escapeHtml(b.suffix)}</span>` : ''}
                `;
              }).join(' ')}
            </div>

            <!-- 한글 해석 -->
            <p class="text-xs text-slate-500 font-normal pt-1 border-t border-slate-200/60 leading-normal">
              ${this.escapeHtml(s.ko)}
            </p>
          </div>
        `;
      }
    });

    container.innerHTML = html;
  },

  onTmBlankInput(inputElem, blankId) {
    // 한글 입력 시 영문으로 자동 변환 (한영 오타 실시간 교정 및 앞 글자 보존)
    if (this.state.textMemorizeExam) {
      this.state.textMemorizeExam.userAnswers[blankId] = inputElem.value;
      this.updateTmExamProgress();
    }
  },

  onTmBlankKeydown(event, inputElem) {
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (event.key === 'Enter') event.preventDefault();
      const allInputs = Array.from(document.querySelectorAll('#tmExamBody input.tm-blank-input'));
      const currentIndex = allInputs.indexOf(inputElem);
      if (currentIndex >= 0 && currentIndex < allInputs.length - 1) {
        allInputs[currentIndex + 1].focus();
        allInputs[currentIndex + 1].select();
      }
    }
  },

  onTmSentenceInput(inputElem, sentIndex) {
    if (this.state.textMemorizeExam) {
      this.state.textMemorizeExam.userAnswers['sent_' + sentIndex] = inputElem.value;
      this.updateTmExamProgress();
    }
  },

  onTmSentenceKeydown(event, inputElem) {
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      event.preventDefault();
      const allInputs = Array.from(document.querySelectorAll('#tmExamBody textarea.tm-sentence-input'));
      const currentIndex = allInputs.indexOf(inputElem);
      if (currentIndex >= 0 && currentIndex < allInputs.length - 1) {
        allInputs[currentIndex + 1].focus();
        allInputs[currentIndex + 1].select();
      }
    }
  },

  updateTmExamProgress() {
    const exam = this.state.textMemorizeExam;
    if (!exam) return;
    const isFullSentence = exam.textMemorizeMode === 'FULL_SENTENCE';
    const totalCount = isFullSentence ? exam.sentences.length : exam.allBlanks.length;
    const filledCount = Object.values(exam.userAnswers).filter(v => v && v.trim().length > 0).length;
    const badge = document.getElementById('tmExamProgressBadge');
    if (badge) badge.innerText = `${filledCount} / ${totalCount}`;
  },

  closeTextMemorizeExam() {
    this.hideModal('textMemorizeExamModal');
    this.state.textMemorizeExam = null;
  },

  // 문장 비교용 정규화 헬퍼 (구두점/공백/대소문자 정리)
  normalizeSentence(str) {
    if (!str) return '';
    return str
      .trim()
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '')
      .replace(/\s+/g, ' ');
  },

  // ── 제출 및 실시간 채점 ──────────────────────────────────────
  async submitTextMemorizeExam() {
    const exam = this.state.textMemorizeExam;
    if (!exam) return;

    const isFullSentence = exam.textMemorizeMode === 'FULL_SENTENCE';
    let correctCount = 0;
    const wrongList = [];
    const totalCount = isFullSentence ? exam.sentences.length : exam.allBlanks.length;

    if (isFullSentence) {
      exam.sentences.forEach(s => {
        let userAns = (exam.userAnswers['sent_' + s.sentIndex] || '').trim();
        if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(userAns)) {
          const converted = this.convertKorToEng(userAns);
          if (this.normalizeSentence(converted) === this.normalizeSentence(s.en)) {
            userAns = converted;
          }
        }
        const normUser = this.normalizeSentence(userAns);
        const normCorrect = this.normalizeSentence(s.en);
        const isCorrect = normUser === normCorrect && normUser.length > 0;

        if (isCorrect) {
          correctCount++;
        } else {
          wrongList.push({
            sentIndex: s.sentIndex,
            ko: s.ko,
            correctEn: s.en,
            userAns: userAns || '(미입력)'
          });
        }
      });
    } else {
      exam.allBlanks.forEach(b => {
        let userAns = (exam.userAnswers[b.id] || '').trim().toLowerCase();
        if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(userAns)) {
          const converted = this.convertKorToEng(userAns).toLowerCase();
          if (converted === b.cleanWord) {
            userAns = converted;
          }
        }
        const isCorrect = userAns === b.cleanWord;

        if (isCorrect) {
          correctCount++;
        } else {
          wrongList.push({
            blank: b,
            userAns: exam.userAnswers[b.id] || '(미입력)',
            correctWord: b.word
          });
        }
      });
    }

    const wrongCount = totalCount - correctCount;
    const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const passed = exam.cutoffType === 'WRONG_COUNT'
      ? (wrongCount <= exam.maxWrong)
      : (score >= exam.cutoffScore);

    // 제출 완료 표시
    exam.isCompleted = true;

    const resultData = {
      score,
      correct: correctCount,
      total: totalCount,
      wrongCount,
      passed,
      wrongList,
      mode: exam.textMemorizeMode,
      cutoffType: exam.cutoffType,
      cutoffScore: exam.cutoffScore,
      maxWrong: exam.maxWrong,
      userAnswers: exam.userAnswers || {},
      examSentences: exam.sentences || [],
      completedAt: new Date().toISOString()
    };

    try {
      await AppData.saveTextMemorizeResult(exam.studentId, exam.testId, resultData);

      // tests 컬렉션의 test 상태와 점수도 함께 업데이트
      const test = AppData.getTests().find(t => t.id === exam.testId);
      if (test) {
        test.status = passed ? 'PASS' : 'FAIL';
        test.score = `${score}점`;
        test.allowRetest = false; // 재응시는 관리자 허용 필요
        test.textMemorizeResult = resultData;
        await AppData.saveOrUpdateTest(test);
      }

      this.toast(`본문암기 테스트 제출 완료! ${score}점 (${passed ? 'PASS 통과' : '불합격'})`, passed ? 'success' : 'info');
    } catch (e) {
      console.error(e);
    }

    this.closeTextMemorizeExam();
    this.renderTextMemorizeResult(resultData, exam.testId, exam.studentId);

    // 화면 새로고침
    if (this.state.isAdminLoggedIn) {
      this.renderAdminDashboard();
    } else {
      this.renderStudentDashboard();
    }
  },

  renderTextMemorizeResult(result, testId, studentId) {
    this.state.lastTmResult = { result, testId, studentId };

    const iconElem = document.getElementById('tmResultIcon');
    const titleElem = document.getElementById('tmResultTitle');
    const subElem = document.getElementById('tmResultSubtitle');
    const scoreElem = document.getElementById('tmResultScore');
    const correctElem = document.getElementById('tmResultCorrect');
    const cutoffBadgeElem = document.getElementById('tmResultCutoffBadge');
    const wrongContainer = document.getElementById('tmResultWrongList');
    const footerElem = document.getElementById('tmResultFooter');

    const isFullSentence = result.mode === 'FULL_SENTENCE';
    const isWrongCountType = result.cutoffType === 'WRONG_COUNT';
    const wrongCount = result.wrongCount ?? (result.total - result.correct);

    if (result.passed) {
      iconElem.className = 'w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-3xl mx-auto mb-2 shadow-lg';
      iconElem.innerHTML = '<i class="fa-solid fa-crown"></i>';
      titleElem.innerText = '통과 (PASS)';
      subElem.innerText = '축하합니다! 본문암기 테스트를 통과했습니다.';
      scoreElem.className = 'text-5xl font-black text-emerald-600';
    } else {
      iconElem.className = 'w-16 h-16 rounded-2xl bg-rose-500 text-white flex items-center justify-center text-3xl mx-auto mb-2 shadow-lg';
      iconElem.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
      titleElem.innerText = '불합격 (FAIL)';
      subElem.innerText = '빽빽이 검사 후 다시 시도해주세요.';
      scoreElem.className = 'text-5xl font-black text-rose-600';
    }

    scoreElem.innerText = `${result.score}점`;
    correctElem.innerText = isFullSentence
      ? `${result.correct} / ${result.total}개 문장 정답 (오답 ${wrongCount}개)`
      : `${result.correct} / ${result.total}개 빈칸 정답 (오답 ${wrongCount}개)`;

    // 커트라인 따로 밑에 표시
    if (cutoffBadgeElem) {
      if (isWrongCountType) {
        cutoffBadgeElem.innerHTML = `
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-indigo-200 text-indigo-950 font-bold text-xs shadow-2xs">
            <i class="fa-solid fa-sliders text-indigo-600"></i> 커트라인: 최대 오답 <strong>${result.maxWrong ?? 3}개 이하</strong> 허용
          </span>
        `;
      } else {
        cutoffBadgeElem.innerHTML = `
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-indigo-200 text-indigo-950 font-bold text-xs shadow-2xs">
            <i class="fa-solid fa-sliders text-indigo-600"></i> 커트라인: <strong>${result.cutoffScore ?? 80}점 이상</strong>
          </span>
        `;
      }
    }

    // 오답 리스트 렌더링
    if (result.wrongList && result.wrongList.length > 0) {
      wrongContainer.innerHTML = `
        <h5 class="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-exclamation text-rose-500"></i> 오답 복습 (${result.wrongList.length}개)
        </h5>
        <div class="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          ${isFullSentence ? result.wrongList.map((w, idx) => `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div class="flex items-center gap-1.5">
                <span class="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-[10px]">${idx + 1}번 문장</span>
                <p class="font-bold text-slate-800">${this.escapeHtml(w.ko)}</p>
              </div>
              <div class="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] leading-relaxed">
                <span class="font-bold text-rose-600 mr-1">[내 작성]:</span>${this.escapeHtml(w.userAns)}
              </div>
              <div class="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-bold leading-relaxed">
                <span class="font-black text-emerald-700 mr-1">[정답 원문]:</span>${this.escapeHtml(w.correctEn)}
              </div>
            </div>
          `).join('') : result.wrongList.map(w => `
            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2">
              <div>
                <span class="text-rose-600 font-bold line-through mr-2">${this.escapeHtml(w.userAns)}</span>
                <span class="text-emerald-700 font-black">➜ ${this.escapeHtml(w.correctWord)}</span>
              </div>
              <span class="text-[10px] text-slate-400">${w.blank ? w.blank.length : ''}글자</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      wrongContainer.innerHTML = `
        <div class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center">
          <i class="fa-solid fa-circle-check mr-1"></i>모든 문제를 완벽하게 맞혔습니다! (오답 0개)
        </div>
      `;
    }

    if (footerElem) {
      footerElem.innerHTML = `
        <div class="space-y-2 w-full">
          <button type="button" onclick="App.closeTextMemorizeResult(); App.viewTextMemorizeExamPaper('${testId}')" class="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer">
            <i class="fa-solid fa-file-lines text-indigo-300"></i>
            <span>나의 풀이 답안 & 정답·해설 시험지 보기</span>
          </button>
          <div class="flex items-center gap-2 w-full">
            <button type="button" onclick="App.closeTextMemorizeResult(); App.openTextMemorizeStudyModal('${testId}')" class="flex-1 py-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-book-open"></i>
              <span>본문 다시 외우기</span>
            </button>
            <button type="button" onclick="App.closeTextMemorizeResult()" class="px-5 py-3 rounded-2xl ${result.passed ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'} text-white font-bold text-xs sm:text-sm transition shadow-sm cursor-pointer">
              닫기
            </button>
          </div>
        </div>
      `;
    }

    this.showModal('textMemorizeResultModal');
  },

  closeTextMemorizeResult() {
    this.hideModal('textMemorizeResultModal');
  },

  // 관리자: 본문암기 재시험 허용 토글
  async toggleTextMemorizeAllowRetest(testId) {
    const test = AppData.getTests().find(t => t.id === testId);
    if (!test) return;
    const newVal = !test.allowRetest;
    test.allowRetest = newVal;
    try {
      await AppData.saveOrUpdateTest(test);
      this.toast(newVal ? '학생의 본문암기 재시험 응시가 허용되었습니다.' : '본문암기 재시험 허용이 취소되었습니다.', newVal ? 'success' : 'info');

      const scheduleModal = document.getElementById('textMemorizeScheduleModal');
      if (scheduleModal && !scheduleModal.classList.contains('hidden')) {
        this.openTextMemorizeScheduleModal(testId);
      }
      if (this.state.isAdminLoggedIn) {
        this.renderAdminTestsTab();
      }
      if (this.state.selectedStudentId) {
        this.renderStudentDashboard(this.state.selectedStudentId);
      }
    } catch (err) {
      console.error(err);
      this.toast('재시험 설정 변경에 실패했습니다.', 'error');
    }
  },

  // 시험 중간 포기 → 0점(불합격) 강제 저장
  async forfeitTextMemorizeTest() {
    const exam = this.state.textMemorizeExam;
    if (!exam || exam.isCompleted) return;

    exam.isCompleted = true; // 재진입 방지

    const resultData = {
      score: 0,
      correct: 0,
      total: exam.sentences ? exam.sentences.length : (exam.allBlanks ? exam.allBlanks.length : 0),
      passed: false,
      wrongList: [],
      cutoffScore: exam.cutoffScore,
      forfeit: true,
      completedAt: new Date().toISOString()
    };

    try {
      await AppData.saveTextMemorizeResult(exam.studentId, exam.testId, resultData);

      const test = AppData.getTests().find(t => t.id === exam.testId);
      if (test) {
        test.status = 'FAIL';
        test.score = '0점';
        test.allowRetest = false;
        await AppData.saveOrUpdateTest(test);
      }

      this.toast('시험을 포기하여 0점(불합격) 처리되었습니다.', 'error');
    } catch (e) {
      console.error(e);
    }

    this.hideModal('textMemorizeExamModal');
    this.state.textMemorizeExam = null;

    if (this.state.isAdminLoggedIn) {
      this.renderAdminDashboard();
    } else if (this.state.isStudentLoggedIn) {
      this.selectStudent(this.state.selectedStudentId);
    } else {
      this.showLanding();
    }
  },

  // ========================================================
  // 본문암기 시험지 뷰어 & 인쇄 시스템 (Exam Paper View)
  // ========================================================
  showTextMemorizePaperView() {
    this.clearVocabQuestionTimer();
    this.closeAllModals();
    document.body.style.overflow = '';
    document.body.classList.remove('overflow-hidden');
    this.state.view = 'textMemorizePaper';
    document.getElementById('landingView')?.classList.add('hidden');
    document.getElementById('studentDashboardView')?.classList.add('hidden');
    document.getElementById('adminDashboardView')?.classList.add('hidden');
    document.getElementById('vocabTestView')?.classList.add('hidden');
    document.getElementById('practiceTestView')?.classList.add('hidden');
    const paperView = document.getElementById('textMemorizePaperView');
    if (paperView) {
      paperView.classList.remove('hidden');
    }
    this.updateHeaderActions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  exitTextMemorizePaperView() {
    document.getElementById('textMemorizePaperView')?.classList.add('hidden');
    if (this.state.isAdminLoggedIn) {
      this.showAdminDashboard();
    } else if (this.state.isStudentLoggedIn) {
      const sId = this.state.selectedStudentId || (AppData.getStudents && AppData.getStudents()[0]?.id) || 1;
      this.selectStudent(sId);
    } else {
      this.showLanding();
    }
  },

  // ── 시험 결과지용 빈칸 토큰 복원/추출 헬퍼 ──
  buildClozeTokensForResult(sentenceEn, sentIndex, existingResult) {
    const cloze = this.generateClozeBlanks(sentenceEn, sentIndex);
    if (!existingResult || (!existingResult.userAnswers && !existingResult.wrongList)) {
      return cloze;
    }

    const wrongBlanks = (existingResult.wrongList || [])
      .map(w => w.blank)
      .filter(b => b && (b.sentIndex === sentIndex || String(b.id).startsWith(`blank_${sentIndex}_`)));

    if (wrongBlanks.length > 0) {
      const wrongCleanWords = new Set(wrongBlanks.map(b => b.cleanWord || (b.word && b.word.toLowerCase())));
      const tokens = sentenceEn.split(/\s+/);
      let blankSeq = 0;
      const newBlanks = [];
      const newTokens = tokens.map(token => {
        const match = token.match(/^([^a-zA-Z0-9]*)([a-zA-Z0-9'-]+)([^a-zA-Z0-9]*)$/);
        if (!match) return { isBlank: false, text: token };
        const prefix = match[1];
        const word = match[2];
        const suffix = match[3];
        const clean = word.toLowerCase();

        const isWrong = wrongCleanWords.has(clean);
        const isGen = cloze.blanks.some(b => b.cleanWord === clean);

        if (isWrong || isGen) {
          const blankId = `blank_${sentIndex}_${blankSeq++}`;
          const blankObj = {
            id: blankId,
            sentIndex,
            prefix,
            word,
            cleanWord: clean,
            suffix,
            length: word.length
          };
          newBlanks.push(blankObj);
          return { isBlank: true, blankObj };
        }
        return { isBlank: false, text: token };
      });
      return { tokens: newTokens, blanks: newBlanks };
    }

    return cloze;
  },

  viewTextMemorizeExamPaper(testId) {
    const test = AppData.getTests().find(t => String(t.id) === String(testId) || t.id === testId);
    if (!test) {
      this.toast('시험 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    // 만약 문제풀이(PRACTICE) 시험인 경우 문제풀이 시험지 뷰로 자연스럽게 연결
    if (test.type === 'PRACTICE' && (!Array.isArray(test.passageIds) || test.passageIds.length === 0)) {
      this.viewPracticeTestResultDetail(test.id);
      return;
    }

    // 열려있는 모든 모달 및 배경 즉시 닫기
    this.closeAllModals();
    this.closeTextMemorizeScheduleModal();
    this.closeTestDetailModal();
    this.closeTextMemorizeResult();

    const student = AppData.getStudentById(test.studentId);
    const studentName = student ? student.name : '학생';

    // 학생의 응시 결과 확인
    const results = (typeof AppData.getTextMemorizeResults === 'function') ? AppData.getTextMemorizeResults() : [];
    const existingResult = results.find(r => (String(r.testId) === String(test.id) || r.testId === test.id) && Number(r.studentId) === Number(test.studentId)) || test.textMemorizeResult || null;

    // 출제 본문 지문 및 문장 추출
    const allPassages = this.getAllTextMemorizePassages();
    let matchedPassages = [];
    const passageIds = test.passageIds || [];
    if (Array.isArray(passageIds) && passageIds.length > 0) {
      matchedPassages = allPassages.filter(p => passageIds.includes(p.id));
    } else if (test.passageId) {
      matchedPassages = allPassages.filter(p => p.id === test.passageId);
    } else if (test.passageBook && (test.passageBook.includes('모의고사') || test.passageBook.includes('인천학평'))) {
      matchedPassages = allPassages.filter(p => p.book && (p.book.includes('인천학평') || p.book.includes('29~40')));
    } else if (test.title && (test.title.includes('2과') || (test.scope && test.scope.includes('2과')))) {
      matchedPassages = allPassages.filter(p => p.id === 'ybm2_l2_all' || p.lesson === 2);
    } else {
      matchedPassages = allPassages.filter(p => p.id === 'ybm2_l1_all' || p.lesson === 1);
    }
    if (matchedPassages.length === 0 && allPassages.length > 0) {
      matchedPassages = allPassages;
    }

    const isDescriptiveOnly = Boolean(test.textMemorizeDescriptiveOnly);
    const isFullSentence = (existingResult && existingResult.mode)
      ? (existingResult.mode === 'FULL_SENTENCE')
      : (test.textMemorizeMode === 'FULL_SENTENCE');

    let examSentences = [];
    if (existingResult && Array.isArray(existingResult.examSentences) && existingResult.examSentences.length > 0) {
      examSentences = existingResult.examSentences;
    } else {
      let globalSentIdx = 0;
      matchedPassages.forEach(passage => {
        (passage.sentences || []).forEach(s => {
          if (isDescriptiveOnly && !s.isDescriptiveTarget) return;
          const sentObj = {
            sentIndex: globalSentIdx++,
            passageId: passage.id,
            lessonTitle: passage.lessonTitle,
            partTitle: passage.partTitle,
            en: s.en,
            ko: s.ko,
            isDescriptiveTarget: Boolean(s.isDescriptiveTarget),
            grammarPoint: s.grammarPoint || ''
          };
          if (!isFullSentence) {
            const cloze = this.buildClozeTokensForResult(s.en, sentObj.sentIndex, existingResult);
            sentObj.tokens = cloze.tokens;
            sentObj.blanks = cloze.blanks;
          }
          examSentences.push(sentObj);
        });
      });

      // 안전 폴백: 만약 서술형 엄선 모드였으나 매칭 문장이 없는 경우 전체 문장으로 표시
      if (examSentences.length === 0) {
        globalSentIdx = 0;
        matchedPassages.forEach(passage => {
          (passage.sentences || []).forEach(s => {
            const sentObj = {
              sentIndex: globalSentIdx++,
              passageId: passage.id,
              lessonTitle: passage.lessonTitle,
              partTitle: passage.partTitle,
              en: s.en,
              ko: s.ko,
              isDescriptiveTarget: Boolean(s.isDescriptiveTarget),
              grammarPoint: s.grammarPoint || ''
            };
            if (!isFullSentence) {
              const cloze = this.buildClozeTokensForResult(s.en, sentObj.sentIndex, existingResult);
              sentObj.tokens = cloze.tokens;
              sentObj.blanks = cloze.blanks;
            }
            examSentences.push(sentObj);
          });
        });
      }
    }

    if (examSentences.length === 0) {
      this.toast('출제된 문장 데이터가 없습니다.', 'warning');
      return;
    }

    // 상단 네비 바 타이틀 정보
    const topInfoEl = document.getElementById('textMemorizePaperTopInfo');
    if (topInfoEl) {
      topInfoEl.innerHTML = `
        <div class="flex items-center justify-center gap-2 flex-wrap">
          <span class="font-bold text-slate-800">${this.escapeHtml(test.title || '본문암기 테스트')}</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full ${isFullSentence ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'} font-bold">
            ${isFullSentence ? '문장 전체 영작' : '빈칸 채우기'}
          </span>
          ${isDescriptiveOnly ? '<span class="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-300">★ 서술형 대비</span>' : ''}
          <span class="text-xs text-slate-500 font-medium">${this.escapeHtml(studentName)} 학생 ${existingResult ? `· <strong class="${existingResult.passed ? 'text-emerald-600' : 'text-rose-600'}">${existingResult.score}점 (${existingResult.passed ? 'PASS 통과' : '불합격'})</strong>` : '· (미응시 시험지)'}</span>
        </div>
      `;
    }

    // 시험지 뷰 전환
    this.showTextMemorizePaperView();

    // 시험지 본문 렌더링
    const contentEl = document.getElementById('textMemorizePaperContent');
    if (!contentEl) return;

    const cutoffLabel = test.textMemorizeCutoffType === 'WRONG_COUNT'
      ? `오답 ${test.textMemorizeMaxWrong ?? 3}개 이하 허용`
      : `${test.textMemorizeCutoff || test.cutoffScore || 80}점 이상`;

    let html = `
      <!-- 시험지 표지 헤더 카드 -->
      <div class="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-6">
          <div class="space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-black tracking-wider uppercase">
                PACE English Exam Paper
              </span>
              <span class="px-2.5 py-1 rounded-md text-xs font-bold ${isFullSentence ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}">
                ${isFullSentence ? '서술형 영작 평가' : '빈칸 암기 평가'}
              </span>
              ${isDescriptiveOnly ? `
                <span class="px-2.5 py-1 rounded-md bg-amber-500 text-white text-xs font-black shadow-xs">
                  <i class="fa-solid fa-star mr-1"></i>서술형 대비 핵심 문장 엄선 (${examSentences.length}문항)
                </span>
              ` : `
                <span class="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                  전체 본문 문장 (${examSentences.length}문항)
                </span>
              `}
            </div>
            <h2 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-exam">
              ${this.escapeHtml(test.title || '본문암기 시험지')}
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 font-medium">
              출제 교재 / 범위: <strong class="text-slate-800">${this.escapeHtml(test.passageBook || 'YBM(박준언) 공통영어 2')}</strong> · ${matchedPassages.length}개 지문 (${matchedPassages.map(p => p.partTitle || p.lessonTitle).join(', ')})
            </p>
          </div>

          <!-- 시험 응시자 및 결과 배지 정보 -->
          <div class="sm:text-right flex-shrink-0 bg-slate-50 p-4 rounded-2xl border border-slate-200/60 min-w-[220px]">
            <div class="text-xs text-slate-500 mb-1">수험자 / 응시 학생</div>
            <div class="text-lg font-black text-slate-900 mb-2">${this.escapeHtml(studentName)} 학생</div>
            <div class="text-xs text-slate-600 flex items-center justify-between sm:justify-end gap-2">
              <span>시험일:</span>
              <strong class="text-slate-800">${this.escapeHtml(test.date || '지정일')}</strong>
            </div>
            <div class="text-xs text-slate-600 flex items-center justify-between sm:justify-end gap-2 mt-1">
              <span>합격 기준:</span>
              <strong class="text-indigo-700">${cutoffLabel}</strong>
            </div>
            ${existingResult ? `
              <div class="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between sm:justify-end gap-2">
                <span class="text-xs font-bold text-slate-700">채점 결과:</span>
                <span class="px-2.5 py-1 rounded-xl text-xs font-black ${existingResult.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                  ${existingResult.score}점 (${existingResult.passed ? 'PASS 통과' : '불합격'})
                </span>
              </div>
            ` : `
              <div class="mt-3 pt-3 border-t border-slate-200 text-center">
                <span class="inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-200 text-slate-600">
                  <i class="fa-solid fa-clock mr-1"></i>미응시 (출제 시험지)
                </span>
              </div>
            `}
          </div>
        </div>

        <!-- 시험 안내 가이드 (인쇄 시에도 표준 출제 지침으로 표출) -->
        <div class="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-950 flex items-start gap-3">
          <i class="fa-solid fa-circle-info text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
          <div class="space-y-1">
            <strong class="font-black text-amber-900 block">[응시 및 채점 결과 확인 안내]</strong>
            <p class="leading-relaxed text-amber-900/90">
              ${isFullSentence
                ? '1. 실제 시험과 동일한 영작 작성 양식에 제출한 답안이 채워져 있습니다.<br>2. <strong>틀린 문항</strong>은 상단에 <strong class="text-emerald-800">★ 올바른 정답 원문</strong>이 초록색 박스로 첨삭 표출됩니다.'
                : '1. 실제 시험과 동일한 <strong>문장 속 빈칸 양식</strong>에 제출한 답안이 채워져 있습니다.<br>2. <strong>틀린 빈칸</strong>은 상단에 <strong class="text-emerald-800">★ 정답 단어</strong>가 초록색 배지로 첨삭 표출되며, 제출 답안은 취소선으로 표시됩니다.'}
            </p>
          </div>
        </div>
      </div>

      <!-- 문항 본체 영역 -->
      <div class="space-y-5">
    `;

    let currentPart = '';
    examSentences.forEach((s, sIdx) => {
      if (s.partTitle !== currentPart) {
        currentPart = s.partTitle;
        html += `
          <div class="pt-3 first:pt-0">
            <div class="flex items-center gap-2 p-3.5 bg-slate-900 text-white rounded-2xl shadow-xs">
              <i class="fa-solid fa-book-bookmark text-amber-400"></i>
              <span class="font-black text-xs sm:text-sm tracking-wide">${this.escapeHtml(s.lessonTitle)} - ${this.escapeHtml(s.partTitle)}</span>
            </div>
          </div>
        `;
      }

      if (!isFullSentence) {
        // ── 빈칸 채우기 (CLOZE) 모드: 실제 시험 양식 그대로 표시 ──
        let sentWrongCount = 0;
        const totalBlanksInSent = (s.blanks || []).length;
        const isGraded = Boolean(existingResult);

        const tokensHtml = (s.tokens || []).map(token => {
          if (!token.isBlank) {
            return `<span class="self-end pb-1 text-slate-900 font-medium">${this.escapeHtml(token.text)}</span>`;
          }

          const b = token.blankObj;
          let userAns = '';
          let isCorrect = true;

          if (existingResult) {
            if (existingResult.userAnswers && existingResult.userAnswers[b.id] !== undefined) {
              userAns = existingResult.userAnswers[b.id];
            }

            const wrongItem = (existingResult.wrongList || []).find(w => {
              if (w.blank) {
                if (w.blank.id === b.id) return true;
                if (w.blank.sentIndex === s.sentIndex && w.blank.cleanWord === b.cleanWord) return true;
              }
              if (w.correctWord && w.correctWord.toLowerCase() === b.cleanWord) return true;
              return false;
            });

            if (wrongItem) {
              isCorrect = false;
              sentWrongCount++;
              if (!userAns && wrongItem.userAns && wrongItem.userAns !== '(미입력)') {
                userAns = wrongItem.userAns;
              }
            } else {
              isCorrect = true;
              if (!userAns) userAns = b.word;
            }
          }

          if (!existingResult) {
            // 미응시 시험지 (인쇄/출제 상태: 빈칸 입력 양식)
            return `
              ${b.prefix ? `<span class="self-end pb-1 text-slate-900 font-medium">${this.escapeHtml(b.prefix)}</span>` : ''}
              <span class="inline-block text-center font-bold px-3 py-1 text-xs sm:text-sm bg-white border-2 border-dashed border-indigo-300 rounded-lg text-indigo-400 self-end shadow-2xs">
                ${'_'.repeat(Math.max(4, b.length))} <span class="text-[10px] text-slate-400 font-normal">(${b.length}자)</span>
              </span>
              ${b.suffix ? `<span class="self-end pb-1 text-slate-900 font-medium">${this.escapeHtml(b.suffix)}</span>` : ''}
            `;
          }

          if (isCorrect) {
            // 정답: 내가 입력한 답대로 채워져있고 (초록 테두리 + 체크 배지)
            return `
              ${b.prefix ? `<span class="self-end pb-1 text-slate-900 font-medium">${this.escapeHtml(b.prefix)}</span>` : ''}
              <span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 border-2 border-emerald-400 text-emerald-950 font-bold text-xs sm:text-sm shadow-2xs self-end">
                <span>${this.escapeHtml(userAns || b.word)}</span>
                <i class="fa-solid fa-check text-emerald-600 text-xs ml-1.5" title="정답"></i>
              </span>
              ${b.suffix ? `<span class="self-end pb-1 text-slate-900 font-medium">${this.escapeHtml(b.suffix)}</span>` : ''}
            `;
          } else {
            // 틀린 것: 내가 입력한 답대로 채워져있고(취소선), 위에 정답 추가로 써줌!
            return `
              ${b.prefix ? `<span class="self-end pb-1 text-slate-900 font-medium">${this.escapeHtml(b.prefix)}</span>` : ''}
              <span class="inline-flex flex-col items-center mx-1 align-bottom self-end">
                <span class="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md shadow-2xs mb-1 whitespace-nowrap">
                  <i class="fa-solid fa-star text-amber-500 text-[10px]"></i>정답: <strong class="underline decoration-emerald-500 font-black">${this.escapeHtml(b.word)}</strong>
                </span>
                <span class="inline-block text-center font-bold px-2.5 py-1 text-xs sm:text-sm bg-rose-50 border-2 border-rose-400 rounded-lg text-rose-700 line-through shadow-2xs">
                  ${this.escapeHtml(userAns && userAns.trim() ? userAns : '(미입력)')}
                </span>
              </span>
              ${b.suffix ? `<span class="self-end pb-1 text-slate-900 font-medium">${this.escapeHtml(b.suffix)}</span>` : ''}
            `;
          }
        }).join(' ');

        const sentAllCorrect = isGraded && sentWrongCount === 0;

        html += `
          <div class="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-3.5 break-inside-avoid">
            <!-- 문항 헤더 -->
            <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs sm:text-sm flex items-center justify-center shadow-xs">
                  ${sIdx + 1}
                </span>
                <span class="font-black text-xs sm:text-sm text-slate-800">문항 ${sIdx + 1}</span>
                ${s.isDescriptiveTarget ? `
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                    <i class="fa-solid fa-star text-amber-500 mr-1"></i>서술형 대비 핵심
                  </span>
                ` : ''}
              </div>

              ${isGraded ? `
                <span class="px-3 py-1 rounded-full text-xs font-black ${sentAllCorrect ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'}">
                  ${sentAllCorrect ? '✓ 전체 정답' : `✗ 오답 ${sentWrongCount}개`}
                </span>
              ` : `
                <span class="text-xs text-slate-400 font-medium">빈칸 ${totalBlanksInSent}개</span>
              `}
            </div>

            <!-- 진짜 시험보는 그 양식: 영어 본문 문장 속에 빈칸이 인라인으로 채워진 형태 -->
            <div class="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
              <div class="text-sm sm:text-base leading-loose text-slate-900 font-medium flex flex-wrap items-end gap-x-2 gap-y-3">
                ${tokensHtml}
              </div>
            </div>

            <!-- 한글 해석 -->
            <div class="pt-1 text-xs sm:text-sm text-slate-600 font-medium leading-relaxed flex items-start gap-1.5">
              <span class="text-slate-400 font-bold flex-shrink-0">[해석]</span>
              <span>${this.escapeHtml(s.ko)}</span>
            </div>

            <!-- 서술형 문법 포인트 (있는 경우) -->
            ${s.grammarPoint ? `
              <div class="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-indigo-950 flex items-start gap-2">
                <i class="fa-solid fa-lightbulb text-amber-500 mt-0.5 flex-shrink-0"></i>
                <div>
                  <span class="font-black text-indigo-900 mr-1.5">[서술형 출제 문법 & 영작 포인트]</span>
                  <span class="text-slate-700 font-medium">${this.escapeHtml(s.grammarPoint)}</span>
                </div>
              </div>
            ` : ''}
          </div>
        `;
      } else {
        // ── 문장 전체 영작 (FULL_SENTENCE) 모드: 실제 시험 양식 그대로 표시 ──
        let isGraded = false;
        let isStudentCorrect = false;
        let studentAns = '';

        if (existingResult) {
          isGraded = true;
          studentAns = (existingResult.userAnswers && existingResult.userAnswers['sent_' + s.sentIndex]) || '';
          const wrongItem = (existingResult.wrongList || []).find(w => w.sentIndex === s.sentIndex || (w.correctEn && App.normalizeSentence(w.correctEn) === App.normalizeSentence(s.en)));
          if (wrongItem) {
            isStudentCorrect = false;
            if (!studentAns && wrongItem.userAns && wrongItem.userAns !== '(미입력)') {
              studentAns = wrongItem.userAns;
            }
          } else {
            isStudentCorrect = true;
          }
        }

        html += `
          <div class="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-3.5 break-inside-avoid">
            <!-- 문항 헤더 -->
            <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs sm:text-sm flex items-center justify-center shadow-xs">
                  ${sIdx + 1}
                </span>
                <span class="font-black text-xs sm:text-sm text-slate-800">문항 ${sIdx + 1}</span>
                ${s.isDescriptiveTarget ? `
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                    <i class="fa-solid fa-star text-amber-500 mr-1"></i>서술형 대비 핵심
                  </span>
                ` : ''}
              </div>

              ${isGraded ? `
                <span class="px-3 py-1 rounded-full text-xs font-black ${isStudentCorrect ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'}">
                  ${isStudentCorrect ? '✓ 정답 (PASS)' : '✗ 오답 (WRONG)'}
                </span>
              ` : `
                <span class="text-xs text-slate-400 font-medium">[서술형 영작]</span>
              `}
            </div>

            <!-- 한글 해석 (영작 제시문 조건) -->
            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <span class="text-xs font-bold text-slate-500 flex-shrink-0 mt-0.5">[해석 조건]</span>
              <p class="text-sm sm:text-base font-bold text-slate-900 font-exam leading-relaxed">
                ${this.escapeHtml(s.ko)}
              </p>
            </div>

            <!-- 영작 답안 작성 양식 (진짜 시험보는 그 양식!) -->
            ${isGraded ? `
              ${isStudentCorrect ? `
                <!-- 정답인 경우: 내가 작성한 답안이 에메랄드 박스에 채워져 있음 -->
                <div class="p-3.5 rounded-xl border-2 border-emerald-400 bg-emerald-50/60 space-y-1.5 shadow-2xs">
                  <div class="flex items-center justify-between text-xs font-bold text-emerald-800">
                    <span class="flex items-center gap-1.5">
                      <i class="fa-solid fa-pen text-emerald-600"></i>내가 작성한 영작 답안
                    </span>
                    <span class="text-emerald-700 font-black"><i class="fa-solid fa-check mr-1"></i>정답 일치</span>
                  </div>
                  <div class="font-mono text-xs sm:text-sm font-bold text-emerald-950 whitespace-pre-wrap leading-relaxed">
                    ${this.escapeHtml(studentAns)}
                  </div>
                </div>
              ` : `
                <!-- 오답인 경우: 내가 입력한 답대로 채워져있고 (취소선), 위에 정답 추가로 써줌! -->
                <div class="space-y-2.5">
                  <!-- 위에 정답 추가로 써주기 -->
                  <div class="p-3.5 rounded-xl border-2 border-emerald-400 bg-emerald-50 space-y-1.5 shadow-2xs">
                    <div class="flex items-center justify-between text-xs font-bold text-emerald-900">
                      <span class="flex items-center gap-1.5 font-black">
                        <i class="fa-solid fa-star text-amber-500"></i>★ 올바른 정답 원문 (교과서/모의고사)
                      </span>
                      <span class="text-xs font-black text-emerald-700">모범 정답</span>
                    </div>
                    <div class="font-mono text-xs sm:text-sm font-black text-emerald-950 whitespace-pre-wrap leading-relaxed">
                      ${this.escapeHtml(s.en)}
                    </div>
                  </div>

                  <!-- 내가 작성한 오답 (취소선) -->
                  <div class="p-3.5 rounded-xl border-2 border-rose-300 bg-rose-50/50 space-y-1">
                    <div class="flex items-center justify-between text-xs font-bold text-rose-700">
                      <span class="flex items-center gap-1">
                        <i class="fa-solid fa-xmark text-rose-500"></i>내가 제출한 답안
                      </span>
                      <span class="text-[11px] font-bold text-rose-600">오답</span>
                    </div>
                    <div class="font-mono text-xs sm:text-sm font-bold text-rose-900 line-through whitespace-pre-wrap leading-relaxed">
                      ${studentAns && studentAns.trim() ? this.escapeHtml(studentAns) : '<span class="no-underline text-slate-400 italic">미작성 (빈칸 제출)</span>'}
                    </div>
                  </div>
                </div>
              `}
            ` : `
              <!-- 미응시 상태 / 인쇄 시 수기 작성란 (실제 시험지 작성 양식) -->
              <div class="p-4 rounded-xl bg-white border border-dashed border-slate-300 space-y-3">
                <div class="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                  <span>[ 영작 답안 작성란 ]</span>
                  <span class="text-[10px] text-slate-400 print:hidden">시험지 인쇄 후 직접 수기로 작성하거나, 화면에서 테스트를 진행하세요.</span>
                </div>
                <div class="h-9 border-b border-slate-300"></div>
                <div class="h-9 border-b border-slate-300"></div>
              </div>

              <!-- 선생님 및 학습자 확인용 모범 정답 아코디언 -->
              <div class="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <details class="group cursor-pointer">
                  <summary class="text-xs font-bold text-indigo-800 flex items-center justify-between select-none">
                    <span class="flex items-center gap-1.5">
                      <i class="fa-solid fa-key text-amber-500"></i>
                      <span>정답 및 모범 영작 원문 확인 (클릭)</span>
                    </span>
                    <i class="fa-solid fa-chevron-down text-indigo-400 text-xs transition group-open:rotate-180"></i>
                  </summary>
                  <div class="mt-2.5 pt-2.5 border-t border-indigo-200/60 font-mono text-xs sm:text-sm font-bold text-indigo-950 leading-relaxed bg-white p-3 rounded-lg border border-indigo-100">
                    ${this.escapeHtml(s.en)}
                  </div>
                </details>
              </div>
            `}

            <!-- 서술형 문법/구문 포인트 -->
            ${s.grammarPoint ? `
              <div class="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-indigo-950 flex items-start gap-2">
                <i class="fa-solid fa-lightbulb text-amber-500 mt-0.5 flex-shrink-0"></i>
                <div>
                  <span class="font-black text-indigo-900 mr-1.5">[서술형 출제 문법 & 영작 포인트]</span>
                  <span class="text-slate-700 font-medium">${this.escapeHtml(s.grammarPoint)}</span>
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }
    });

    html += `
      </div>

      <!-- 하단 인쇄 & 나가기 바 -->
      <div class="p-6 bg-white rounded-3xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <button onclick="App.exitTextMemorizePaperView()" class="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer">
          <i class="fa-solid fa-arrow-left"></i>
          <span>학습공간으로 돌아가기</span>
        </button>

        <div class="flex items-center gap-2 w-full sm:w-auto">
          <button onclick="window.print()" class="flex-1 sm:flex-initial px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer">
            <i class="fa-solid fa-print"></i>
            <span>시험지 인쇄하기 (A4)</span>
          </button>
        </div>
      </div>
    `;

    contentEl.innerHTML = html;
  },

  // ========================================================
  // 본문 암기학습 (미리 외우기) 엔진
  // 1) 플래시카드 암기 (모르는 문장 0개까지 반복 루프)
  // 2) 본문 통독 & 가리기 (전체보기 / 영어 가리기 / 해석 가리기 / 빈칸 가리기)
  // 3) 어순 배열 퍼즐 (단어 칩 순서 맞추기)
  // 4) 영작 자가 연습 (한글 보고 직접 타이핑 & 실시간 힌트/정답 확인)
  // ========================================================

  speakSentence(text) {
    if (!text || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/["“”'‘’]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'en-US';
      utterance.rate = 0.88;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Sentence TTS Error:', e);
    }
  },

  openTextMemorizeStudyModal(testId = null, focusPassageId = null) {
    if (!testId) {
      this.toast('캘린더에서 본문암기 테스트 일정을 클릭하여 학습을 시작해주세요.', 'info');
      return;
    }

    const allPassages = this.getAllTextMemorizePassages();
    if (allPassages.length === 0) {
      this.toast('본문 데이터가 없습니다.', 'error');
      return;
    }

    let targetPassages = [];
    let test = null;
    let bookName = 'YBM(박준언) 공통영어 2';
    let title = '교과서 본문 암기학습';

    if (testId) {
      test = AppData.getTests().find(t => t.id === testId);
      if (test) {
        bookName = test.passageBook || bookName;
        title = test.title ? `${test.title} · 암기학습` : title;
        let passageIds = test.passageIds || [];
        if (Array.isArray(passageIds) && passageIds.length > 0) {
          targetPassages = allPassages.filter(p => passageIds.includes(p.id));
        }
      }
    }

    if (targetPassages.length === 0) {
      targetPassages = allPassages;
    }

    // 서술형 대비 문장만 출제 여부
    const isDescriptiveOnly = test ? Boolean(test.textMemorizeDescriptiveOnly) : false;

    // 모든 문장 데이터 플랫화 (서술형 대비 모드이면 해당 문장만)
    const allSentences = [];
    let sGlobalIdx = 0;
    targetPassages.forEach(p => {
      if (Array.isArray(p.sentences)) {
        p.sentences.forEach((s, sIdx) => {
          if (isDescriptiveOnly && !s.isDescriptiveTarget) return;
          allSentences.push({
            id: `tm_sent_${p.id}_${sIdx}`,
            globalIndex: sGlobalIdx++,
            passageId: p.id,
            lesson: p.lesson,
            lessonTitle: p.lessonTitle,
            partTitle: p.partTitle,
            en: s.en,
            ko: s.ko,
            isDescriptiveTarget: Boolean(s.isDescriptiveTarget),
            grammarPoint: s.grammarPoint || '',
            wordCount: s.en.trim().split(/\s+/).filter(Boolean).length
          });
        });
      }
    });

    if (allSentences.length === 0) {
      this.toast('학습할 본문 문장이 없습니다.', 'error');
      return;
    }

    // 기존 열려있던 시험 모달 기억 및 숨김 처리
    const schedModal = document.getElementById('textMemorizeScheduleModal');
    if (schedModal && !schedModal.classList.contains('hidden')) {
      this._textMemorizeStudyOriginTestId = testId;
      this.hideModal('textMemorizeScheduleModal');
    } else {
      this._textMemorizeStudyOriginTestId = testId || null;
    }

    const initialPassageId = focusPassageId && targetPassages.some(p => p.id === focusPassageId)
      ? focusPassageId
      : 'ALL';

    const filteredSentences = initialPassageId === 'ALL'
      ? [...allSentences]
      : allSentences.filter(s => s.passageId === initialPassageId);

    this.state.textMemorizeStudy = {
      originTestId: this._textMemorizeStudyOriginTestId,
      testId,
      test,
      bookName,
      title,
      isDescriptiveOnly,
      targetPassages,
      allSentences,
      filteredSentences,
      selectedPassageId: initialPassageId,
      searchQuery: '',
      viewMode: 'card', // 'card' | 'mask' | 'scramble' | 'practice'

      // Mode 1: Flashcard
      flashcardDeck: [...filteredSentences],
      cardIndex: 0,
      round: 1,
      unknownSentences: [],
      knownSentences: [],
      isCardFlipped: false,
      isRoundFinished: false,
      isMasteryFinished: false,
      cardDirection: 'ko_to_en', // 'ko_to_en' | 'en_to_ko'
      showCardHint: false,

      // Mode 2: Masking View
      maskMode: 'hide_en', // 'show_all' | 'hide_en' | 'hide_ko' | 'cloze'
      revealedEnSet: new Set(),
      revealedKoSet: new Set(),
      revealedClozeSet: new Set(),

      // Mode 3: Scramble Puzzle
      scrambleIndex: 0,
      scrambleAvailableWords: [],
      scramblePlacedWords: [],
      scrambleTokens: [],
      scrambleIsCorrect: false,
      scrambleMasteredSet: new Set(),

      // Mode 4: Practice Typing
      practiceIndex: 0,
      practiceUserAnswer: '',
      practiceShowHint: false,
      practiceChecked: false,
      practiceResult: null,
      practiceMasteredSet: new Set()
    };

    // Header UI
    const titleEl = document.getElementById('tmStudyTitle');
    const badgeEl = document.getElementById('tmStudyBadge');
    const countBadgeEl = document.getElementById('tmStudyCountBadge');
    const searchInput = document.getElementById('tmStudySearchInput');
    const passageSelect = document.getElementById('tmStudyPassageSelect');

    if (titleEl) titleEl.innerText = title;
    if (badgeEl) {
      badgeEl.innerText = bookName;
      // 서술형 대비 문장만 암기학습 배지
      const existingDescBadge = document.getElementById('tmStudyDescOnlyBadge');
      if (existingDescBadge) existingDescBadge.remove();
      if (isDescriptiveOnly && badgeEl.parentNode) {
        const descBadge = document.createElement('span');
        descBadge.id = 'tmStudyDescOnlyBadge';
        descBadge.className = 'px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300';
        descBadge.innerHTML = '<i class="fa-solid fa-star text-amber-500 mr-1"></i>서술형 대비 문장만';
        badgeEl.parentNode.insertBefore(descBadge, badgeEl.nextSibling);
      }
    }
    if (countBadgeEl) countBadgeEl.innerText = `총 ${filteredSentences.length}문장`;
    if (searchInput) searchInput.value = '';

    // 문단 선택 Select 박스 채우기 (서술형 대비 모드면 각 passage 서술형 문장 수 반영)
    if (passageSelect) {
      passageSelect.innerHTML = `
        <option value="ALL">전체 문단 (총 ${allSentences.length}문장)</option>
        ${targetPassages.map(p => {
          const sentCount = isDescriptiveOnly
            ? (p.sentences || []).filter(s => s.isDescriptiveTarget).length
            : (p.sentences ? p.sentences.length : 0);
          if (isDescriptiveOnly && sentCount === 0) return ''; // 서술형 문장 없는 문단 제외
          return `
            <option value="${p.id}" ${p.id === initialPassageId ? 'selected' : ''}>
              ${this.escapeHtml(p.partTitle)} (${sentCount}문장${isDescriptiveOnly ? ' ★서술형' : ''})
            </option>
          `;
        }).join('')}
      `;
    }

    // 모드별 초기화
    this.initTmStudyScramble(0);
    this.initTmStudyPractice(0);

    this.updateTmStudyModeButtons();
    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
    this.renderTmStudyFooter();

    this.showModal('textMemorizeStudyModal');
  },

  closeTextMemorizeStudyModal() {
    this.hideModal('textMemorizeStudyModal');
    const originTestId = this._textMemorizeStudyOriginTestId;
    this._textMemorizeStudyOriginTestId = null;

    if (originTestId) {
      setTimeout(() => {
        this.openTextMemorizeScheduleModal(originTestId);
      }, 200);
    }
  },

  onTmStudyPassageChange(passageId) {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.selectedPassageId = passageId;
    this.applyTmStudyFilter();
  },

  filterTmStudySentences(query) {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.searchQuery = (query || '').trim().toLowerCase();
    this.applyTmStudyFilter();
  },

  applyTmStudyFilter() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;

    let list = ts.selectedPassageId === 'ALL'
      ? [...ts.allSentences]
      : ts.allSentences.filter(s => s.passageId === ts.selectedPassageId);

    if (ts.searchQuery) {
      list = list.filter(s =>
        s.en.toLowerCase().includes(ts.searchQuery) ||
        s.ko.toLowerCase().includes(ts.searchQuery)
      );
    }

    ts.filteredSentences = list;

    // 카운트 배지 갱신
    const countBadgeEl = document.getElementById('tmStudyCountBadge');
    if (countBadgeEl) countBadgeEl.innerText = `총 ${list.length}문장`;

    // 플래시카드 덱 갱신
    ts.flashcardDeck = [...list];
    ts.cardIndex = 0;
    ts.round = 1;
    ts.unknownSentences = [];
    ts.knownSentences = [];
    ts.isRoundFinished = false;
    ts.isMasteryFinished = false;
    ts.isCardFlipped = false;

    // 어순배열 / 영작 초기화
    ts.scrambleIndex = 0;
    this.initTmStudyScramble(0);
    ts.practiceIndex = 0;
    this.initTmStudyPractice(0);

    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  setTmStudyViewMode(mode) {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.viewMode = mode;

    if (mode === 'card') {
      if (!ts.flashcardDeck || ts.flashcardDeck.length === 0) {
        this.tmStudyRestartMastery();
      }
    } else if (mode === 'scramble') {
      this.initTmStudyScramble(ts.scrambleIndex || 0);
    } else if (mode === 'practice') {
      this.initTmStudyPractice(ts.practiceIndex || 0);
    }

    this.updateTmStudyModeButtons();
    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  updateTmStudyModeButtons() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;

    const modes = ['card', 'mask', 'scramble', 'practice'];
    const activeCls = 'px-2.5 py-1 rounded-lg transition bg-white text-indigo-700 shadow-xs flex items-center gap-1 cursor-pointer';
    const inactiveCls = 'px-2.5 py-1 rounded-lg transition text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer';

    modes.forEach(m => {
      const btn = document.getElementById(`tmStudyMode${m.charAt(0).toUpperCase() + m.slice(1)}Btn`);
      if (btn) {
        btn.className = (ts.viewMode === m) ? activeCls : inactiveCls;
      }
    });

    const searchWrap = document.getElementById('tmStudySearchInput')?.parentElement;
    if (searchWrap) {
      if (ts.viewMode === 'mask') searchWrap.classList.remove('hidden');
      else searchWrap.classList.add('hidden');
    }
  },

  renderTmStudySubToolbar() {
    const ts = this.state.textMemorizeStudy;
    const sub = document.getElementById('tmStudySubToolbar');
    if (!sub || !ts) return;

    if (ts.viewMode === 'card') {
      const isKoToEn = ts.cardDirection === 'ko_to_en';
      sub.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap text-xs">
          <button type="button" onclick="App.toggleTmStudyCardDirection()" class="px-3 py-1 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer">
            <i class="fa-solid fa-arrows-rotate text-indigo-600"></i>
            <span>${isKoToEn ? '한글 보고 ➔ 영어 맞히기' : '영어 보고 ➔ 한글 해석 맞히기'}</span>
          </button>
          <button type="button" onclick="App.toggleTmStudyCardHint()" class="px-3 py-1 rounded-xl ${ts.showCardHint ? 'bg-amber-100 border border-amber-300 text-amber-800' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'} font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs">
            <i class="fa-solid fa-lightbulb text-amber-500"></i>
            <span>${ts.showCardHint ? '힌트 켜짐' : '단어 힌트'}</span>
          </button>
        </div>
        <div class="text-[11px] font-medium text-slate-400 hidden sm:flex items-center gap-2">
          <span><kbd class="px-1 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px]">Space</kbd> 뒤집기</span>
          <span><kbd class="px-1 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px]">1</kbd> 모르는 문장</span>
          <span><kbd class="px-1 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px]">2</kbd> 외운 문장</span>
        </div>
      `;
    } else if (ts.viewMode === 'mask') {
      const maskModes = [
        { id: 'show_all', label: '전체 보기', icon: 'fa-eye' },
        { id: 'hide_en', label: '영어 가리기 (해석 연상)', icon: 'fa-eye-slash' },
        { id: 'hide_ko', label: '해석 가리기 (직독직해)', icon: 'fa-language' },
        { id: 'cloze', label: '핵심 빈칸 가리기', icon: 'fa-highlighter' }
      ];
      sub.innerHTML = `
        <div class="flex items-center gap-1.5 flex-wrap">
          ${maskModes.map(m => `
            <button
              type="button"
              onclick="App.setTmStudyMaskMode('${m.id}')"
              class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${ts.maskMode === m.id ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}"
            >
              <i class="fa-solid ${m.icon} text-[10px]"></i>
              <span>${m.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="flex items-center gap-1.5">
          <button type="button" onclick="App.revealAllTmStudyMasked()" class="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer">
            <i class="fa-solid fa-wand-magic-sparkles text-[10px] mr-1"></i>모두 펼치기 / 가리기
          </button>
        </div>
      `;
    } else if (ts.viewMode === 'scramble') {
      const curIdx = ts.scrambleIndex || 0;
      const total = ts.filteredSentences.length;
      sub.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap text-xs">
          <span class="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 font-extrabold text-xs">
            문장 ${curIdx + 1} / ${total}
          </span>
          <span class="text-xs font-bold text-slate-600">
            마스터한 문장: <strong class="text-emerald-600">${ts.scrambleMasteredSet.size}개</strong>
          </span>
        </div>
        <div class="flex items-center gap-1.5">
          <button type="button" onclick="App.tmStudyScrambleReset()" class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition flex items-center gap-1 cursor-pointer">
            <i class="fa-solid fa-rotate-left text-[10px]"></i>
            <span>초기화</span>
          </button>
          <button type="button" onclick="App.tmStudyScrambleHint()" class="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-xs font-bold transition flex items-center gap-1 cursor-pointer">
            <i class="fa-solid fa-lightbulb text-[10px] text-amber-500"></i>
            <span>다음 1단어 힌트</span>
          </button>
        </div>
      `;
    } else if (ts.viewMode === 'practice') {
      const curIdx = ts.practiceIndex || 0;
      const total = ts.filteredSentences.length;
      sub.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap text-xs">
          <span class="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 font-extrabold text-xs">
            문장 ${curIdx + 1} / ${total}
          </span>
          <span class="text-xs font-bold text-slate-600">
            영작 마스터: <strong class="text-emerald-600">${ts.practiceMasteredSet.size}개</strong>
          </span>
        </div>
        <div class="flex items-center gap-1.5">
          <button type="button" onclick="App.tmStudyPracticeToggleHint()" class="px-2.5 py-1 rounded-lg ${ts.practiceShowHint ? 'bg-amber-100 border border-amber-300 text-amber-800' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'} text-xs font-bold transition flex items-center gap-1 cursor-pointer">
            <i class="fa-solid fa-lightbulb text-[10px] text-amber-500"></i>
            <span>${ts.practiceShowHint ? '첫글자 힌트 켜짐' : '첫글자 힌트'}</span>
          </button>
          <button type="button" onclick="App.tmStudyPracticeReset()" class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition cursor-pointer">
            <span>다시 쓰기</span>
          </button>
        </div>
      `;
    }
  },

  renderTmStudyContent() {
    const ts = this.state.textMemorizeStudy;
    const container = document.getElementById('tmStudyModalBody');
    if (!container || !ts) return;

    if (ts.filteredSentences.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-slate-400 space-y-2">
          <i class="fa-solid fa-book-open text-4xl text-slate-300"></i>
          <p class="text-sm font-semibold">선택한 범위에 해당하는 문장이 없습니다.</p>
        </div>
      `;
      return;
    }

    // ── 뷰 모드 1: 플래시카드 암기학습 (무한 회차 루프) ──
    if (ts.viewMode === 'card') {
      if (!ts.flashcardDeck || ts.flashcardDeck.length === 0) {
        this.tmStudyRestartMastery();
      }

      // 완벽 마스터 달성 (모르는 문장 0개)
      if (ts.isMasteryFinished) {
        container.innerHTML = `
          <div class="max-w-xl mx-auto py-8 space-y-6 text-center animate-fade-in">
            <div class="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-tr from-emerald-400 to-teal-500 text-white flex items-center justify-center text-5xl shadow-lg shadow-emerald-200">
              🎉
            </div>
            <div class="space-y-2">
              <span class="px-3.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                본문 완벽 암기 마스터 달성!
              </span>
              <h2 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">모든 문장을 완벽하게 암기했습니다!</h2>
              <p class="text-xs sm:text-sm font-semibold text-slate-600">
                총 <strong>${ts.filteredSentences.length}개</strong> 문장 · 모르는 문장 <strong>0개</strong> 완료 (${ts.round}회차 반복 학습)
              </p>
            </div>
            <div class="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-center space-y-1.5">
              <p class="text-xs font-bold text-emerald-900">
                <i class="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i>
                모르는 문장이 없어질 때까지 완벽하게 숙달했습니다.
              </p>
              <p class="text-[11px] text-emerald-700">이제 본문암기 시험을 치르거나, 가리기 모드와 어순 배열로 최종 점검해보세요!</p>
            </div>
            <div class="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <button type="button" onclick="App.tmStudyRestartMastery()" class="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition flex items-center gap-2 shadow-xs cursor-pointer">
                <i class="fa-solid fa-rotate-right"></i>
                <span>처음부터 다시 학습하기</span>
              </button>
              <button type="button" onclick="App.setTmStudyViewMode('mask')" class="px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer">
                <i class="fa-solid fa-eye-slash"></i>
                <span>본문 가리기 모드로 점검</span>
              </button>
              ${ts.originTestId ? `
                <button type="button" onclick="App.closeTextMemorizeStudyModal(); App.startTextMemorizeExam('${ts.originTestId}', ${ts.test?.studentId || App.state.selectedStudentId})" class="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black transition flex items-center gap-2 shadow-emerald-200 shadow-md cursor-pointer">
                  <i class="fa-solid fa-paper-plane"></i>
                  <span>본문암기 시험 응시하기</span>
                </button>
              ` : ''}
            </div>
          </div>
        `;
        return;
      }

      // 회차 종료 화면 (모르는 문장이 남아 다음 회차 진행)
      if (ts.isRoundFinished) {
        container.innerHTML = `
          <div class="max-w-xl mx-auto py-8 space-y-6 text-center animate-fade-in">
            <div class="w-20 h-20 mx-auto rounded-3xl bg-amber-100 text-amber-600 flex items-center justify-center text-4xl shadow-sm">
              <i class="fa-solid fa-repeat"></i>
            </div>
            <div class="space-y-2">
              <span class="px-3.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
                ${ts.round}회차 학습 완료
              </span>
              <h2 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                모르는 문장 ${ts.unknownSentences.length}개가 남았습니다
              </h2>
              <p class="text-xs sm:text-sm text-slate-600">
                외운 문장 <strong class="text-emerald-600">${ts.knownSentences.length}개</strong>는 통과! 모르는 문장이 0개가 될 때까지 반복 학습합니다.
              </p>
            </div>

            <!-- 모르는 문장 미리보기 리스트 -->
            <div class="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-left space-y-2.5">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-black text-rose-900 flex items-center gap-1.5">
                  <i class="fa-solid fa-circle-question text-rose-500"></i>
                  ${ts.round + 1}회차에 다시 반복할 문장 (${ts.unknownSentences.length}개)
                </h4>
                <span class="text-[11px] font-mono text-rose-600">스피커 클릭 시 발음</span>
              </div>
              <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
                ${ts.unknownSentences.map((s, idx) => `
                  <div class="p-2.5 rounded-xl bg-white border border-rose-200/80 hover:border-rose-300 transition flex items-start justify-between gap-2 shadow-2xs">
                    <div class="min-w-0 space-y-1">
                      <p class="font-bold text-xs sm:text-sm text-slate-900 leading-snug">${this.escapeHtml(s.en)}</p>
                      <p class="text-[11px] text-rose-700 font-medium leading-snug">${this.escapeHtml(s.ko)}</p>
                    </div>
                    <button type="button" onclick="App.speakSentence('${this.escapeHtml(s.en)}')" class="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 transition">
                      <i class="fa-solid fa-volume-high text-xs"></i>
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <button type="button" onclick="App.tmStudyStartNextRound()" class="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-md cursor-pointer">
                <i class="fa-solid fa-play"></i>
                <span>${ts.round + 1}회차 시작하기 (모르는 문장 ${ts.unknownSentences.length}개 반복)</span>
                <kbd class="hidden sm:inline px-1.5 py-0.5 rounded bg-black/20 text-white/90 text-[10px] font-mono">Enter</kbd>
              </button>
              <button type="button" onclick="App.setTmStudyViewMode('mask')" class="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer">
                <i class="fa-solid fa-eye-slash"></i>
                <span>본문 가리기 모드로 점검</span>
              </button>
            </div>
          </div>
        `;
        return;
      }

      // 학습 진행 중 카드
      const currentSentence = ts.flashcardDeck[ts.cardIndex] || ts.flashcardDeck[0];
      const isKoToEn = ts.cardDirection === 'ko_to_en';

      // 힌트 계산: 첫 단어 2개
      const words = currentSentence.en.trim().split(/\s+/);
      const hintText = words.slice(0, Math.min(2, words.length)).join(' ') + ' ...';

      container.innerHTML = `
        <div class="max-w-xl mx-auto py-2 space-y-4">
          <!-- 상단 진행도 및 카운터 -->
          <div class="p-3 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div class="flex items-center justify-between gap-2 flex-wrap text-xs">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs shadow-2xs">
                  ${ts.round}회차
                </span>
                <span class="font-bold text-slate-700">
                  문장 <strong>${ts.cardIndex + 1}</strong> / ${ts.flashcardDeck.length}
                </span>
                <span class="text-[11px] font-semibold text-slate-400">(${this.escapeHtml(currentSentence.partTitle)})</span>
              </div>
              <div class="flex items-center gap-3 font-bold">
                <span class="text-rose-600 flex items-center gap-1">
                  <i class="fa-solid fa-circle-xmark text-xs"></i>
                  <span>모르는 문장</span>
                  <strong class="px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-700 text-xs">${ts.unknownSentences.length}</strong>
                </span>
                <span class="text-emerald-600 flex items-center gap-1">
                  <i class="fa-solid fa-circle-check text-xs"></i>
                  <span>외운 문장</span>
                  <strong class="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700 text-xs">${ts.knownSentences.length}</strong>
                </span>
              </div>
            </div>

            <!-- 프로그레스 바 -->
            <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div class="bg-indigo-600 h-2 rounded-full transition-all duration-300" style="width: ${((ts.cardIndex + 1) / ts.flashcardDeck.length) * 100}%"></div>
            </div>
          </div>

          <!-- 대형 플래시카드 본체 -->
          <div onclick="App.tmStudyFlipCard()" class="min-h-[220px] sm:min-h-[260px] p-5 sm:p-7 rounded-3xl border-2 ${ts.isCardFlipped ? 'border-indigo-400 bg-gradient-to-b from-indigo-50/50 to-white' : 'border-slate-200 bg-white'} shadow-lg hover:shadow-xl transition-all cursor-pointer flex flex-col items-center justify-between text-center space-y-3 group select-none">
            <div class="flex items-center justify-between w-full">
              <span class="text-xs font-black text-indigo-500 font-mono bg-indigo-50 px-3 py-1 rounded-full">#${String(ts.cardIndex + 1).padStart(2, '0')}</span>
              <span class="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">${currentSentence.wordCount}단어</span>
            </div>

            <!-- 메인 텍스트 영역 (앞면/뒷면) -->
            <div class="space-y-3 my-auto w-full">
              ${isKoToEn ? `
                <!-- 한글 보고 영어 연상 모드 -->
                ${ts.isCardFlipped ? `
                  <div class="space-y-2 animate-fade-in">
                    <h3 class="text-lg sm:text-2xl font-black text-slate-900 leading-relaxed tracking-tight text-left sm:text-center">${this.escapeHtml(currentSentence.en)}</h3>
                    <p class="text-xs sm:text-sm font-semibold text-slate-500 pt-2 border-t border-slate-100 text-left sm:text-center">${this.escapeHtml(currentSentence.ko)}</p>
                  </div>
                ` : `
                  <div class="space-y-2">
                    <h3 class="text-base sm:text-xl font-black text-indigo-950 leading-relaxed text-left sm:text-center">${this.escapeHtml(currentSentence.ko)}</h3>
                    ${ts.showCardHint ? `
                      <div class="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono font-bold inline-block">
                        💡 힌트: ${this.escapeHtml(hintText)}
                      </div>
                    ` : ''}
                  </div>
                `}
              ` : `
                <!-- 영어 보고 한글 연상 모드 -->
                ${ts.isCardFlipped ? `
                  <div class="space-y-2 animate-fade-in">
                    <h3 class="text-base sm:text-xl font-black text-indigo-950 leading-relaxed text-left sm:text-center">${this.escapeHtml(currentSentence.ko)}</h3>
                    <p class="text-xs sm:text-sm font-bold text-slate-600 pt-2 border-t border-slate-100 text-left sm:text-center">${this.escapeHtml(currentSentence.en)}</p>
                  </div>
                ` : `
                  <div class="space-y-2">
                    <h3 class="text-lg sm:text-2xl font-black text-slate-900 leading-relaxed tracking-tight text-left sm:text-center">${this.escapeHtml(currentSentence.en)}</h3>
                  </div>
                `}
              `}
            </div>

            <!-- 하단 안내 & 발음 버튼 -->
            <div class="w-full pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button type="button" onclick="App.speakSentence('${this.escapeHtml(currentSentence.en)}'); event.stopPropagation();" class="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
                <i class="fa-solid fa-volume-high text-indigo-600"></i>
                <span>발음 듣기</span>
              </button>
              <div class="text-[11px] font-bold text-slate-400 group-hover:text-indigo-600 transition flex items-center gap-1">
                <i class="fa-solid fa-hand-pointer text-xs animate-bounce"></i>
                <span>${ts.isCardFlipped ? '카드를 클릭하면 가려집니다' : '카드를 클릭하거나 Space를 누르면 뒤집힙니다'}</span>
              </div>
            </div>
          </div>

          <!-- 아는문장 / 뒤집기 / 모르는문장 액션 버튼 -->
          <div class="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onclick="App.tmStudyMarkSentence(false)"
              class="py-3.5 px-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border-2 border-rose-300 text-rose-700 font-black text-xs sm:text-sm transition flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 shadow-xs cursor-pointer group"
            >
              <i class="fa-solid fa-circle-xmark text-rose-500 text-base group-hover:scale-110 transition-transform"></i>
              <span>모르는 문장</span>
              <kbd class="hidden sm:inline-block px-1.5 py-0.5 rounded bg-rose-200/80 text-rose-800 text-[10px] font-mono">← / 1</kbd>
            </button>

            <button
              type="button"
              onclick="App.tmStudyFlipCard()"
              class="py-3.5 px-3 rounded-2xl ${ts.isCardFlipped ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 shadow-md'} font-black text-xs sm:text-sm transition flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 cursor-pointer"
            >
              <i class="fa-solid fa-rotate text-sm"></i>
              <span>${ts.isCardFlipped ? '문장 가리기' : '원문 보기'}</span>
              <kbd class="hidden sm:inline-block px-1.5 py-0.5 rounded ${ts.isCardFlipped ? 'bg-slate-300 text-slate-800' : 'bg-indigo-700 text-white/90'} text-[10px] font-mono">Space</kbd>
            </button>

            <button
              type="button"
              onclick="App.tmStudyMarkSentence(true)"
              class="py-3.5 px-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-300 text-emerald-700 font-black text-xs sm:text-sm transition flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 shadow-xs cursor-pointer group"
            >
              <i class="fa-solid fa-circle-check text-emerald-500 text-base group-hover:scale-110 transition-transform"></i>
              <span>외운 문장</span>
              <kbd class="hidden sm:inline-block px-1.5 py-0.5 rounded bg-emerald-200/80 text-emerald-800 text-[10px] font-mono">→ / 2</kbd>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // ── 뷰 모드 2: 본문 통독 & 가리기 (Masking) ──
    if (ts.viewMode === 'mask') {
      let currentPart = '';
      let html = '<div class="space-y-4 max-w-3xl mx-auto">';

      ts.filteredSentences.forEach((s, idx) => {
        if (s.partTitle !== currentPart) {
          currentPart = s.partTitle;
          html += `
            <div class="pt-3 first:pt-0">
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-100 text-indigo-900 text-xs font-black">
                <i class="fa-solid fa-book-open text-indigo-600"></i> ${this.escapeHtml(s.lessonTitle)} - ${this.escapeHtml(s.partTitle)}
              </div>
            </div>
          `;
        }

        const isEnRevealed = ts.maskMode === 'show_all' || ts.revealedEnSet.has(s.id);
        const isKoRevealed = ts.maskMode === 'show_all' || ts.maskMode === 'hide_en' || ts.maskMode === 'cloze' || ts.revealedKoSet.has(s.id);

        let enContentHtml = '';
        if (ts.maskMode === 'hide_en' && !isEnRevealed) {
          enContentHtml = `
            <button type="button" onclick="App.toggleTmStudySentenceEnReveal('${s.id}')" class="w-full text-left p-3 rounded-xl bg-indigo-50/70 border border-dashed border-indigo-300 hover:bg-indigo-100 text-indigo-700 text-xs sm:text-sm font-bold transition flex items-center justify-between gap-2 cursor-pointer select-none">
              <span><i class="fa-solid fa-eye-slash mr-1.5 text-indigo-500"></i>클릭하여 영어 문장 확인하기</span>
              <span class="text-[11px] text-indigo-400 font-mono">${s.wordCount}단어</span>
            </button>
          `;
        } else if (ts.maskMode === 'cloze') {
          const cloze = this.generateClozeBlanks(s.en, s.globalIndex);
          enContentHtml = `
            <div class="text-sm sm:text-base leading-relaxed text-slate-900 font-medium flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
              ${cloze.tokens.map(token => {
                if (!token.isBlank) {
                  return `<span>${this.escapeHtml(token.text)}</span>`;
                }
                const b = token.blankObj;
                const isRevealed = ts.revealedClozeSet.has(b.id);
                if (isRevealed) {
                  return `
                    <span onclick="App.toggleTmStudyClozeBlankReveal('${b.id}')" class="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-black underline cursor-pointer shadow-2xs" title="클릭하여 다시 가리기">
                      ${this.escapeHtml(b.word)}
                    </span>
                  `;
                } else {
                  return `
                    <button type="button" onclick="App.toggleTmStudyClozeBlankReveal('${b.id}')" class="px-2 py-0.5 rounded-lg bg-slate-200 hover:bg-amber-100 border border-slate-300 hover:border-amber-300 text-slate-700 hover:text-amber-900 text-xs font-mono font-bold transition cursor-pointer" title="클릭하여 빈칸 단어 확인">
                      [ ${b.firstChar}${'_'.repeat(Math.max(2, b.length - 1))} ]
                    </button>
                  `;
                }
              }).join('')}
            </div>
          `;
        } else {
          enContentHtml = `
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm sm:text-base font-bold text-slate-900 leading-relaxed">${this.escapeHtml(s.en)}</p>
              ${ts.maskMode === 'hide_en' ? `
                <button type="button" onclick="App.toggleTmStudySentenceEnReveal('${s.id}')" class="text-xs text-slate-400 hover:text-indigo-600 flex-shrink-0" title="다시 가리기">
                  <i class="fa-solid fa-eye-slash"></i>
                </button>
              ` : ''}
            </div>
          `;
        }

        let koContentHtml = '';
        if (ts.maskMode === 'hide_ko' && !isKoRevealed) {
          koContentHtml = `
            <button type="button" onclick="App.toggleTmStudySentenceKoReveal('${s.id}')" class="w-full text-left p-2.5 rounded-xl bg-slate-100 border border-dashed border-slate-300 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer select-none">
              <i class="fa-solid fa-eye-slash mr-1.5 text-slate-400"></i>클릭하여 우리말 해석 확인하기
            </button>
          `;
        } else {
          koContentHtml = `
            <div class="flex items-start justify-between gap-2">
              <p class="text-xs sm:text-sm font-semibold text-slate-600 leading-snug">${this.escapeHtml(s.ko)}</p>
              ${ts.maskMode === 'hide_ko' ? `
                <button type="button" onclick="App.toggleTmStudySentenceKoReveal('${s.id}')" class="text-xs text-slate-400 hover:text-indigo-600 flex-shrink-0" title="다시 가리기">
                  <i class="fa-solid fa-eye-slash"></i>
                </button>
              ` : ''}
            </div>
          `;
        }

        html += `
          <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-indigo-300 transition space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 shadow-2xs">
                ${idx + 1}
              </span>
              <div class="flex items-center gap-1.5">
                <button type="button" onclick="App.speakSentence('${this.escapeHtml(s.en)}')" class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs" title="발음 듣기">
                  <i class="fa-solid fa-volume-high text-indigo-600"></i>
                  <span>듣기</span>
                </button>
                <button type="button" onclick="App.jumpToTmStudySentence(${idx}, 'scramble')" class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold transition cursor-pointer" title="이 문장 어순 배열 연습">
                  <i class="fa-solid fa-puzzle-piece text-[10px] mr-1"></i>어순배열
                </button>
                <button type="button" onclick="App.jumpToTmStudySentence(${idx}, 'practice')" class="px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-xs font-bold transition cursor-pointer" title="이 문장 영작 연습">
                  <i class="fa-solid fa-pen-clip text-[10px] mr-1"></i>영작
                </button>
              </div>
            </div>

            <!-- 영어 문장 -->
            ${enContentHtml}

            <!-- 우리말 해석 -->
            <div class="pt-1.5 border-t border-slate-200/60">
              ${koContentHtml}
            </div>
          </div>
        `;
      });

      html += '</div>';
      container.innerHTML = html;
      return;
    }

    // ── 뷰 모드 3: 어순 배열 훈련 (Scramble Puzzle) ──
    if (ts.viewMode === 'scramble') {
      const curIdx = ts.scrambleIndex || 0;
      const s = ts.filteredSentences[curIdx] || ts.filteredSentences[0];
      const isMastered = ts.scrambleMasteredSet.has(s.id);

      container.innerHTML = `
        <div class="max-w-2xl mx-auto py-2 space-y-4">
          <!-- 상단 문장 가이드 (우리말) -->
          <div class="p-4 sm:p-5 rounded-3xl bg-indigo-50/70 border border-indigo-200 space-y-2">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <span class="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white font-black text-xs shadow-2xs">
                #${curIdx + 1} 문장 (${this.escapeHtml(s.partTitle)})
              </span>
              <div class="flex items-center gap-2">
                ${isMastered ? `
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <i class="fa-solid fa-circle-check"></i> 마스터 완료
                  </span>
                ` : ''}
                <button type="button" onclick="App.speakSentence('${this.escapeHtml(s.en)}')" class="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition flex items-center gap-1 shadow-2xs cursor-pointer">
                  <i class="fa-solid fa-volume-high"></i> 발음 듣기
                </button>
              </div>
            </div>
            <h3 class="text-base sm:text-lg font-black text-slate-900 leading-snug">
              ${this.escapeHtml(s.ko)}
            </h3>
            <p class="text-xs text-slate-500 font-medium">아래 단어들을 올바른 순서대로 클릭하여 영어 문장을 완성하세요.</p>
          </div>

          <!-- 배치된 단어 영역 (Drop Zone) -->
          <div class="p-4 sm:p-5 rounded-3xl border-2 ${ts.scrambleIsCorrect ? 'border-emerald-400 bg-emerald-50/40' : (ts.scramblePlacedWords.length === ts.scrambleTokens.length ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 bg-white')} min-h-[110px] space-y-3 transition">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold ${ts.scrambleIsCorrect ? 'text-emerald-800' : 'text-slate-400'}">
                ${ts.scrambleIsCorrect ? '🎉 문장 완성 성공!' : `배치된 단어 (${ts.scramblePlacedWords.length} / ${ts.scrambleTokens.length})`}
              </span>
              <span class="text-[11px] text-slate-400">클릭 시 단어 취소</span>
            </div>

            <div class="flex flex-wrap gap-2 min-h-[46px] items-center">
              ${ts.scramblePlacedWords.length > 0 ? ts.scramblePlacedWords.map((w, pIdx) => `
                <button
                  type="button"
                  onclick="App.tmStudyScrambleRemoveWord(${pIdx})"
                  class="px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-1 shadow-2xs cursor-pointer ${ts.scrambleIsCorrect ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-rose-500'}"
                  title="클릭하여 단어 취소"
                >
                  <span>${this.escapeHtml(w.text)}</span>
                  <i class="fa-solid fa-xmark text-[10px] opacity-75"></i>
                </button>
              `).join('') : `
                <p class="text-xs text-slate-400 italic">아래 단어 칩을 클릭하면 이곳에 순서대로 배치됩니다.</p>
              `}
            </div>

            ${ts.scrambleIsCorrect ? `
              <div class="pt-2 border-t border-emerald-200 flex items-center justify-between gap-2 flex-wrap">
                <p class="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <i class="fa-solid fa-circle-check text-emerald-600"></i>
                  완벽합니다! 어순을 정확하게 맞혔습니다.
                </p>
                <button type="button" onclick="App.tmStudyScrambleNext()" class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer">
                  <span>다음 문장 ➔</span>
                </button>
              </div>
            ` : (ts.scramblePlacedWords.length === ts.scrambleTokens.length ? `
              <div class="pt-2 border-t border-rose-200 flex items-center justify-between gap-2">
                <p class="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                  <i class="fa-solid fa-circle-xmark text-rose-500"></i>
                  어순을 다시 확인해보세요. 틀린 단어를 클릭하면 뺄 수 있습니다.
                </p>
                <button type="button" onclick="App.tmStudyScrambleReset()" class="px-3 py-1 rounded-lg bg-rose-100 text-rose-800 font-bold text-xs hover:bg-rose-200 transition">
                  전체 취소
                </button>
              </div>
            ` : '')}
          </div>

          <!-- 선택 가능한 단어 뱅크 (Available Words Bank) -->
          <div class="p-4 sm:p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-700">단어 선택 풀 (${ts.scrambleAvailableWords.length}개 남음)</span>
              <span class="text-[11px] text-slate-400">클릭하여 순서대로 배치</span>
            </div>
            <div class="flex flex-wrap gap-2">
              ${ts.scrambleAvailableWords.map(w => `
                <button
                  type="button"
                  onclick="App.tmStudyScramblePlaceWord(${w.id})"
                  class="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 font-bold text-xs sm:text-sm text-slate-800 transition shadow-2xs cursor-pointer"
                >
                  ${this.escapeHtml(w.text)}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- 이전 / 다음 네비게이션 -->
          <div class="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onclick="App.tmStudyScramblePrev()"
              ${curIdx === 0 ? 'disabled' : ''}
              class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
            >
              <i class="fa-solid fa-arrow-left"></i> 이전 문장
            </button>
            <span class="text-xs font-bold text-slate-500">${curIdx + 1} / ${ts.filteredSentences.length}</span>
            <button
              type="button"
              onclick="App.tmStudyScrambleNext()"
              ${curIdx >= ts.filteredSentences.length - 1 ? 'disabled' : ''}
              class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 shadow-xs"
            >
              다음 문장 <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // ── 뷰 모드 4: 영작 자가 연습 (Typing Practice) ──
    if (ts.viewMode === 'practice') {
      const curIdx = ts.practiceIndex || 0;
      const s = ts.filteredSentences[curIdx] || ts.filteredSentences[0];
      const isMastered = ts.practiceMasteredSet.has(s.id);

      // 첫 글자 힌트 생성
      const hintPattern = s.en.replace(/([a-zA-Z0-9])([a-zA-Z0-9'-]*)/g, (m, first, rest) => first + '_'.repeat(rest.length));

      container.innerHTML = `
        <div class="max-w-2xl mx-auto py-2 space-y-4">
          <!-- 한글 가이드 카드 -->
          <div class="p-4 sm:p-5 rounded-3xl bg-indigo-50/70 border border-indigo-200 space-y-2">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <span class="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white font-black text-xs shadow-2xs">
                #${curIdx + 1} 문장 (${this.escapeHtml(s.partTitle)})
              </span>
              <div class="flex items-center gap-2">
                ${isMastered ? `
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <i class="fa-solid fa-circle-check"></i> 영작 마스터 완료
                  </span>
                ` : ''}
                <button type="button" onclick="App.speakSentence('${this.escapeHtml(s.en)}')" class="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition flex items-center gap-1 shadow-2xs cursor-pointer">
                  <i class="fa-solid fa-volume-high"></i> 발음 듣기
                </button>
              </div>
            </div>
            <h3 class="text-base sm:text-lg font-black text-slate-900 leading-snug">
              ${this.escapeHtml(s.ko)}
            </h3>
            ${ts.practiceShowHint ? `
              <div class="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                <span class="text-[11px] font-black text-amber-700 flex items-center gap-1">
                  <i class="fa-solid fa-lightbulb text-amber-500"></i> 첫 글자 힌트
                </span>
                <p class="font-mono text-xs sm:text-sm font-bold tracking-wider leading-relaxed">${this.escapeHtml(hintPattern)}</p>
              </div>
            ` : ''}
          </div>

          <!-- 학생 입력 Textarea -->
          <div class="space-y-2">
            <textarea
              id="tmStudyPracticeTextarea"
              rows="3"
              oninput="App.onTmStudyPracticeInput(this)"
              onkeydown="if((event.key === 'Enter' && !event.shiftKey)){ event.preventDefault(); App.tmStudyPracticeCheck(); }"
              placeholder="한글 해석을 보고 영어 문장 전체를 입력하세요 (한영 자동 오타 교정 지원)"
              class="w-full p-4 text-xs sm:text-sm font-semibold rounded-2xl border-2 border-indigo-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none bg-white text-slate-900 resize-none transition shadow-2xs leading-relaxed"
            >${this.escapeHtml(ts.practiceUserAnswer || '')}</textarea>

            <div class="flex items-center justify-between gap-2 text-xs">
              <span class="text-slate-400 font-medium">Shift+Enter로 줄바꿈 · Enter로 즉시 정답 확인</span>
              <div class="flex items-center gap-2">
                <button type="button" onclick="App.tmStudyPracticeToggleHint()" class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 font-bold transition flex items-center gap-1 cursor-pointer">
                  <i class="fa-solid fa-lightbulb text-amber-500"></i>
                  <span>${ts.practiceShowHint ? '힌트 숨기기' : '첫글자 힌트'}</span>
                </button>
                <button type="button" onclick="App.tmStudyPracticeCheck()" class="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-xs cursor-pointer">
                  정답 확인
                </button>
              </div>
            </div>
          </div>

          <!-- 정답 확인 피드백 영역 -->
          ${ts.practiceChecked ? `
            <div class="p-4 sm:p-5 rounded-3xl border-2 ${ts.practiceResult?.isExact ? 'border-emerald-300 bg-emerald-50/70' : 'border-amber-300 bg-amber-50/60'} space-y-3 animate-fade-in">
              <div class="flex items-center justify-between">
                <span class="text-xs font-black ${ts.practiceResult?.isExact ? 'text-emerald-900' : 'text-amber-900'} flex items-center gap-1.5">
                  <i class="fa-solid ${ts.practiceResult?.isExact ? 'fa-circle-check text-emerald-600' : 'fa-circle-exclamation text-amber-600'}"></i>
                  ${ts.practiceResult?.isExact ? '완벽한 정답입니다! (100% 일치)' : '원문과 비교해보세요'}
                </span>
                <button type="button" onclick="App.speakSentence('${this.escapeHtml(s.en)}')" class="text-xs font-bold text-indigo-700 hover:underline flex items-center gap-1">
                  <i class="fa-solid fa-volume-high"></i> 원문 듣기
                </button>
              </div>

              <div class="space-y-2 text-xs sm:text-sm">
                <div class="p-3 rounded-xl bg-white border border-slate-200">
                  <span class="text-[11px] font-bold text-slate-400 block mb-0.5">[내 작성]</span>
                  <p class="font-bold text-slate-800">${this.escapeHtml(ts.practiceUserAnswer || '(입력값 없음)')}</p>
                </div>
                <div class="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 font-bold">
                  <span class="text-[11px] font-black text-emerald-700 block mb-0.5">[정답 원문]</span>
                  <p class="leading-relaxed">${this.escapeHtml(s.en)}</p>
                </div>
              </div>

              ${ts.practiceResult?.isExact ? `
                <div class="flex justify-end pt-1">
                  <button type="button" onclick="App.tmStudyPracticeNext()" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer">
                    <span>다음 문장 ➔</span>
                  </button>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- 이전 / 다음 네비게이션 -->
          <div class="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onclick="App.tmStudyPracticePrev()"
              ${curIdx === 0 ? 'disabled' : ''}
              class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
            >
              <i class="fa-solid fa-arrow-left"></i> 이전 문장
            </button>
            <span class="text-xs font-bold text-slate-500">${curIdx + 1} / ${ts.filteredSentences.length}</span>
            <button
              type="button"
              onclick="App.tmStudyPracticeNext()"
              ${curIdx >= ts.filteredSentences.length - 1 ? 'disabled' : ''}
              class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 shadow-xs"
            >
              다음 문장 <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      `;
      return;
    }
  },

  renderTmStudyFooter() {
    const ts = this.state.textMemorizeStudy;
    const footer = document.getElementById('tmStudyModalFooter');
    if (!footer || !ts) return;

    let leftInfo = '';
    if (ts.viewMode === 'card') {
      leftInfo = `
        <div class="flex items-center gap-2 text-xs flex-wrap min-w-0">
          <span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs shadow-2xs">${ts.round}회차</span>
          <span class="text-slate-600 font-bold hidden sm:inline">문장 ${ts.cardIndex + 1} / ${ts.flashcardDeck.length}</span>
          <span class="text-rose-600 font-black text-xs flex items-center gap-1">
            <i class="fa-solid fa-circle-xmark"></i>
            <span>모르는 문장</span>
            <strong class="px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-700">${ts.unknownSentences.length}</strong>
          </span>
          <span class="text-emerald-600 font-black text-xs flex items-center gap-1">
            <i class="fa-solid fa-circle-check"></i>
            <span>외운 문장</span>
            <strong class="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700">${ts.knownSentences.length}</strong>
          </span>
        </div>
      `;
    } else if (ts.viewMode === 'mask') {
      leftInfo = `
        <div class="text-xs text-slate-500 font-bold flex items-center gap-1.5">
          <i class="fa-solid fa-eye-slash text-indigo-500"></i>
          <span>본문 가리기 모드 (총 ${ts.filteredSentences.length}문장)</span>
        </div>
      `;
    } else if (ts.viewMode === 'scramble') {
      leftInfo = `
        <div class="text-xs text-slate-500 font-bold flex items-center gap-1.5">
          <i class="fa-solid fa-puzzle-piece text-indigo-500"></i>
          <span>어순 배열 (${ts.scrambleIndex + 1} / ${ts.filteredSentences.length} · 마스터 ${ts.scrambleMasteredSet.size}개)</span>
        </div>
      `;
    } else if (ts.viewMode === 'practice') {
      leftInfo = `
        <div class="text-xs text-slate-500 font-bold flex items-center gap-1.5">
          <i class="fa-solid fa-pen-clip text-indigo-500"></i>
          <span>영작 연습 (${ts.practiceIndex + 1} / ${ts.filteredSentences.length} · 마스터 ${ts.practiceMasteredSet.size}개)</span>
        </div>
      `;
    }

    footer.innerHTML = `
      ${leftInfo}
      <div class="flex items-center gap-2 flex-shrink-0">
        ${ts.originTestId ? `
          <button type="button" onclick="App.closeTextMemorizeStudyModal()" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center gap-1.5">
            <i class="fa-solid fa-calendar-days text-[11px]"></i>
            <span>시험 일정 창</span>
          </button>
          <button type="button" onclick="App.closeTextMemorizeStudyModal(); App.startTextMemorizeExam('${ts.originTestId}', ${ts.test?.studentId || App.state.selectedStudentId})" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer">
            <i class="fa-solid fa-paper-plane text-[11px]"></i>
            <span>시험 응시하기</span>
          </button>
        ` : `
          <button type="button" onclick="App.closeTextMemorizeStudyModal()" class="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer shadow-xs">
            닫기
          </button>
        `}
      </div>
    `;
  },

  // ── 플래시카드 하위 액션 ──
  tmStudyFlipCard() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.isCardFlipped = !ts.isCardFlipped;
    this.renderTmStudyContent();
  },

  tmStudyMarkSentence(isKnown) {
    const ts = this.state.textMemorizeStudy;
    if (!ts || !ts.flashcardDeck || ts.flashcardDeck.length === 0) return;
    if (ts.isRoundFinished || ts.isMasteryFinished) return;

    const currentSentence = ts.flashcardDeck[ts.cardIndex];
    if (!currentSentence) return;

    if (isKnown) {
      ts.knownSentences.push(currentSentence);
    } else {
      ts.unknownSentences.push(currentSentence);
    }

    ts.isCardFlipped = false;

    if (ts.cardIndex + 1 < ts.flashcardDeck.length) {
      ts.cardIndex += 1;
    } else {
      if (ts.unknownSentences.length === 0) {
        ts.isMasteryFinished = true;
      } else {
        ts.isRoundFinished = true;
      }
    }

    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  tmStudyStartNextRound() {
    const ts = this.state.textMemorizeStudy;
    if (!ts || !ts.unknownSentences || ts.unknownSentences.length === 0) return;

    ts.flashcardDeck = [...ts.unknownSentences];
    ts.unknownSentences = [];
    ts.knownSentences = [];
    ts.cardIndex = 0;
    ts.round += 1;
    ts.isRoundFinished = false;
    ts.isMasteryFinished = false;
    ts.isCardFlipped = false;

    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  tmStudyRestartMastery() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;

    ts.flashcardDeck = [...ts.filteredSentences];
    ts.unknownSentences = [];
    ts.knownSentences = [];
    ts.cardIndex = 0;
    ts.round = 1;
    ts.isRoundFinished = false;
    ts.isMasteryFinished = false;
    ts.isCardFlipped = false;

    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  toggleTmStudyCardDirection() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.cardDirection = ts.cardDirection === 'ko_to_en' ? 'en_to_ko' : 'ko_to_en';
    ts.isCardFlipped = false;
    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
  },

  toggleTmStudyCardHint() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.showCardHint = !ts.showCardHint;
    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
  },

  // ── 본문 통독 & 가리기 하위 액션 ──
  setTmStudyMaskMode(mode) {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.maskMode = mode;
    ts.revealedEnSet.clear();
    ts.revealedKoSet.clear();
    ts.revealedClozeSet.clear();
    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
  },

  toggleTmStudySentenceEnReveal(sentenceId) {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    if (ts.revealedEnSet.has(sentenceId)) {
      ts.revealedEnSet.delete(sentenceId);
    } else {
      ts.revealedEnSet.add(sentenceId);
    }
    this.renderTmStudyContent();
  },

  toggleTmStudySentenceKoReveal(sentenceId) {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    if (ts.revealedKoSet.has(sentenceId)) {
      ts.revealedKoSet.delete(sentenceId);
    } else {
      ts.revealedKoSet.add(sentenceId);
    }
    this.renderTmStudyContent();
  },

  toggleTmStudyClozeBlankReveal(blankId) {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    if (ts.revealedClozeSet.has(blankId)) {
      ts.revealedClozeSet.delete(blankId);
    } else {
      ts.revealedClozeSet.add(blankId);
    }
    this.renderTmStudyContent();
  },

  revealAllTmStudyMasked() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;

    if (ts.maskMode === 'hide_en') {
      if (ts.revealedEnSet.size >= ts.filteredSentences.length) {
        ts.revealedEnSet.clear();
      } else {
        ts.filteredSentences.forEach(s => ts.revealedEnSet.add(s.id));
      }
    } else if (ts.maskMode === 'hide_ko') {
      if (ts.revealedKoSet.size >= ts.filteredSentences.length) {
        ts.revealedKoSet.clear();
      } else {
        ts.filteredSentences.forEach(s => ts.revealedKoSet.add(s.id));
      }
    } else if (ts.maskMode === 'cloze') {
      if (ts.revealedClozeSet.size > 0) {
        ts.revealedClozeSet.clear();
      } else {
        ts.filteredSentences.forEach(s => {
          const cloze = this.generateClozeBlanks(s.en, s.globalIndex);
          cloze.blanks.forEach(b => ts.revealedClozeSet.add(b.id));
        });
      }
    }
    this.renderTmStudyContent();
  },

  jumpToTmStudySentence(sentIndex, viewMode) {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.viewMode = viewMode;
    if (viewMode === 'scramble') {
      this.initTmStudyScramble(sentIndex);
    } else if (viewMode === 'practice') {
      this.initTmStudyPractice(sentIndex);
    }
    this.updateTmStudyModeButtons();
    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  // ── 어순 배열 하위 액션 ──
  initTmStudyScramble(sentIndex) {
    const ts = this.state.textMemorizeStudy;
    if (!ts || !ts.filteredSentences || ts.filteredSentences.length === 0) return;

    const sIdx = Math.max(0, Math.min(sentIndex, ts.filteredSentences.length - 1));
    ts.scrambleIndex = sIdx;
    const s = ts.filteredSentences[sIdx];

    // 단어 토큰 분리
    const tokens = s.en.trim().split(/\s+/).filter(Boolean);
    const available = tokens.map((word, idx) => ({ id: idx, text: word }));

    // Fisher-Yates 셔플
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = available[i];
      available[i] = available[j];
      available[j] = temp;
    }

    ts.scrambleTokens = tokens;
    ts.scrambleAvailableWords = available;
    ts.scramblePlacedWords = [];
    ts.scrambleIsCorrect = false;
  },

  tmStudyScramblePlaceWord(wordId) {
    const ts = this.state.textMemorizeStudy;
    if (!ts || ts.scrambleIsCorrect) return;

    const aIdx = ts.scrambleAvailableWords.findIndex(w => w.id === wordId);
    if (aIdx === -1) return;

    const [placedWord] = ts.scrambleAvailableWords.splice(aIdx, 1);
    ts.scramblePlacedWords.push(placedWord);

    // 모든 단어가 배치되었는지 확인
    if (ts.scramblePlacedWords.length === ts.scrambleTokens.length) {
      const placedStr = ts.scramblePlacedWords.map(w => w.text.trim().toLowerCase()).join(' ');
      const targetStr = ts.scrambleTokens.map(w => w.trim().toLowerCase()).join(' ');

      if (placedStr === targetStr) {
        ts.scrambleIsCorrect = true;
        const curSentence = ts.filteredSentences[ts.scrambleIndex];
        if (curSentence) {
          ts.scrambleMasteredSet.add(curSentence.id);
          this.speakSentence(curSentence.en);
        }
      }
    }

    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  tmStudyScrambleRemoveWord(placedIndex) {
    const ts = this.state.textMemorizeStudy;
    if (!ts || ts.scrambleIsCorrect) return;

    if (placedIndex >= 0 && placedIndex < ts.scramblePlacedWords.length) {
      const [removed] = ts.scramblePlacedWords.splice(placedIndex, 1);
      ts.scrambleAvailableWords.push(removed);
    }

    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  tmStudyScrambleReset() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    this.initTmStudyScramble(ts.scrambleIndex);
    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  tmStudyScrambleHint() {
    const ts = this.state.textMemorizeStudy;
    if (!ts || ts.scrambleIsCorrect) return;
    if (ts.scramblePlacedWords.length >= ts.scrambleTokens.length) return;

    // 다음에 배치되어야 할 정답 단어 텍스트
    const nextTargetWord = ts.scrambleTokens[ts.scramblePlacedWords.length];
    const matchIdx = ts.scrambleAvailableWords.findIndex(
      w => w.text.toLowerCase() === nextTargetWord.toLowerCase()
    );

    if (matchIdx !== -1) {
      const [placedWord] = ts.scrambleAvailableWords.splice(matchIdx, 1);
      ts.scramblePlacedWords.push(placedWord);

      if (ts.scramblePlacedWords.length === ts.scrambleTokens.length) {
        const placedStr = ts.scramblePlacedWords.map(w => w.text.trim().toLowerCase()).join(' ');
        const targetStr = ts.scrambleTokens.map(w => w.trim().toLowerCase()).join(' ');
        if (placedStr === targetStr) {
          ts.scrambleIsCorrect = true;
          const curSentence = ts.filteredSentences[ts.scrambleIndex];
          if (curSentence) {
            ts.scrambleMasteredSet.add(curSentence.id);
            this.speakSentence(curSentence.en);
          }
        }
      }
      this.renderTmStudySubToolbar();
      this.renderTmStudyContent();
      this.renderTmStudyFooter();
    }
  },

  tmStudyScrambleNext() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    if (ts.scrambleIndex + 1 < ts.filteredSentences.length) {
      this.initTmStudyScramble(ts.scrambleIndex + 1);
      this.renderTmStudySubToolbar();
      this.renderTmStudyContent();
      this.renderTmStudyFooter();
    }
  },

  tmStudyScramblePrev() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    if (ts.scrambleIndex > 0) {
      this.initTmStudyScramble(ts.scrambleIndex - 1);
      this.renderTmStudySubToolbar();
      this.renderTmStudyContent();
      this.renderTmStudyFooter();
    }
  },

  // ── 영작 자가 연습 하위 액션 ──
  initTmStudyPractice(sentIndex) {
    const ts = this.state.textMemorizeStudy;
    if (!ts || !ts.filteredSentences || ts.filteredSentences.length === 0) return;

    const sIdx = Math.max(0, Math.min(sentIndex, ts.filteredSentences.length - 1));
    ts.practiceIndex = sIdx;
    ts.practiceUserAnswer = '';
    ts.practiceShowHint = false;
    ts.practiceChecked = false;
    ts.practiceResult = null;
  },

  onTmStudyPracticeInput(textarea) {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;

    let val = textarea.value;
    // 한글 입력 감지 시 실시간 영문 2벌식 변환 (한영 오타 교정)
    if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(val)) {
      val = this.convertKorToEng(val);
      textarea.value = val;
    }

    ts.practiceUserAnswer = val;
    ts.practiceChecked = false;
  },

  tmStudyPracticeToggleHint() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.practiceShowHint = !ts.practiceShowHint;
    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
  },

  tmStudyPracticeCheck() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;

    const s = ts.filteredSentences[ts.practiceIndex];
    if (!s) return;

    const userAns = (ts.practiceUserAnswer || '').trim();
    const cleanUser = userAns.toLowerCase().replace(/["“”'‘’]/g, '');
    const cleanTarget = s.en.trim().toLowerCase().replace(/["“”'‘’]/g, '');

    const isExact = cleanUser === cleanTarget;
    ts.practiceChecked = true;
    ts.practiceResult = { isExact, userAns, target: s.en };

    if (isExact) {
      ts.practiceMasteredSet.add(s.id);
      this.speakSentence(s.en);
    }

    this.renderTmStudySubToolbar();
    this.renderTmStudyContent();
    this.renderTmStudyFooter();
  },

  tmStudyPracticeReset() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    ts.practiceUserAnswer = '';
    ts.practiceChecked = false;
    ts.practiceResult = null;
    this.renderTmStudyContent();

    setTimeout(() => {
      const textarea = document.getElementById('tmStudyPracticeTextarea');
      if (textarea) textarea.focus();
    }, 50);
  },

  tmStudyPracticeNext() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    if (ts.practiceIndex + 1 < ts.filteredSentences.length) {
      this.initTmStudyPractice(ts.practiceIndex + 1);
      this.renderTmStudySubToolbar();
      this.renderTmStudyContent();
      this.renderTmStudyFooter();
    }
  },

  tmStudyPracticePrev() {
    const ts = this.state.textMemorizeStudy;
    if (!ts) return;
    if (ts.practiceIndex > 0) {
      this.initTmStudyPractice(ts.practiceIndex - 1);
      this.renderTmStudySubToolbar();
      this.renderTmStudyContent();
      this.renderTmStudyFooter();
    }
  },


};
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  App.finishInitialLoading();
  window.PaceAuth?.boot();
});
