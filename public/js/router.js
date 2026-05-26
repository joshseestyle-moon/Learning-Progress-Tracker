import { render as renderDashboard } from './dashboard.js';
import { render as renderTimetable } from './timetable.js';
import { render as renderCalendar }  from './calendar.js';
import { render as renderExams }     from './exams.js';
import { render as renderChapters }  from './chapters.js';
import { render as renderStudylog }  from './studylog.js';
import { render as renderGrades }    from './grades.js';
import { render as renderSubjects }  from './subjects.js';
import { render as renderPrint }     from './print.js';
import { render as renderBadges }    from './badges.js';
import { render as renderShop }      from './shop.js';

const routes = {
  dashboard: { title: '今日概覽',   fn: renderDashboard },
  timetable: { title: '每週課表',   fn: renderTimetable },
  calendar:  { title: '行事曆',     fn: renderCalendar  },
  exams:     { title: '考試倒數',   fn: renderExams     },
  chapters:  { title: '讀書進度',   fn: renderChapters  },
  studylog:  { title: '讀書時間',   fn: renderStudylog  },
  grades:    { title: '成績紀錄',   fn: renderGrades    },
  badges:    { title: '我的徽章',   fn: renderBadges    },
  shop:      { title: '獎勵商店',   fn: renderShop      },
  subjects:  { title: '課程資訊',   fn: renderSubjects  },
  print:     { title: '列印週計畫', fn: renderPrint     },
};

export function navigate(hash) {
  location.hash = hash;
}

export function initRouter() {
  function route() {
    const hash = location.hash.slice(1) || 'dashboard';
    const view = document.getElementById('view');
    const titleEl = document.getElementById('page-title');

    const r = routes[hash];
    if (!r) { location.hash = 'dashboard'; return; }

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === hash);
    });

    titleEl.textContent = r.title;
    view.innerHTML = '<div class="empty-state"><div class="icon">⏳</div>載入中…</div>';
    r.fn(view).catch(err => {
      view.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${err.message}</div>`;
    });
  }

  window.addEventListener('hashchange', route);
  route();
}
