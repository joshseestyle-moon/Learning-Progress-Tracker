import { render as renderDashboard } from './dashboard.js';
import { render as renderTimetable } from './timetable.js';
import { render as renderCalendar }  from './calendar.js';
import { render as renderExams }     from './exams.js';
import { render as renderHomework }  from './homework.js';
import { render as renderChapters }  from './chapters.js';
import { render as renderStudylog }  from './studylog.js';
import { render as renderGrades }    from './grades.js';
import { render as renderSubjects }  from './subjects.js';
import { render as renderPrint }     from './print.js';
import { render as renderBadges }    from './badges.js';
import { render as renderShop }      from './shop.js';
import { t } from './i18n.js';

const routes = {
  dashboard: { titleKey: 'nav.dashboard', fn: renderDashboard },
  timetable: { titleKey: 'nav.timetable', fn: renderTimetable },
  calendar:  { titleKey: 'nav.calendar',  fn: renderCalendar  },
  exams:     { titleKey: 'nav.exams',     fn: renderExams     },
  homework:  { titleKey: 'nav.homework',  fn: renderHomework  },
  chapters:  { titleKey: 'nav.chapters',  fn: renderChapters  },
  studylog:  { titleKey: 'nav.studylog',  fn: renderStudylog  },
  grades:    { titleKey: 'nav.grades',    fn: renderGrades    },
  badges:    { titleKey: 'nav.badges',    fn: renderBadges    },
  shop:      { titleKey: 'nav.shop',      fn: renderShop      },
  subjects:  { titleKey: 'nav.subjects',  fn: renderSubjects  },
  print:     { titleKey: 'nav.print',     fn: renderPrint     },
};

let _currentHash = 'dashboard';

export function navigate(hash) {
  location.hash = hash;
}

export function initRouter() {
  function route() {
    const hash = location.hash.slice(1) || 'dashboard';
    _currentHash = hash;
    const view = document.getElementById('view');
    const titleEl = document.getElementById('page-title');

    const r = routes[hash];
    if (!r) { location.hash = 'dashboard'; return; }

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === hash);
    });

    titleEl.textContent = t(r.titleKey);
    view.innerHTML = `<div class="empty-state"><div class="icon">⏳</div>${t('app.loading')}</div>`;
    r.fn(view).catch(err => {
      view.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${err.message}</div>`;
    });
  }

  window.addEventListener('hashchange', route);

  window.addEventListener('langchange', () => {
    const view = document.getElementById('view');
    const titleEl = document.getElementById('page-title');
    const r = routes[_currentHash];
    if (!r || !view) return;
    if (titleEl) titleEl.textContent = t(r.titleKey);
    r.fn(view).catch(() => {});
  });

  route();
}
