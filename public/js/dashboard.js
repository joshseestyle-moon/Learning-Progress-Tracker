import { get, post, patch, escHtml, fmtDate, today, ymd, daysLeft } from './api.js';
import { t } from './i18n.js';
import { levelCard } from './gamify-ui.js';

let _el = null;

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

export async function render(el) {
  _el = el;
  const todayStr    = today();
  const tomorrowStr = tomorrow();

  let timetable, exams, scheduled, chapters, dailyTasks, stats, assignments, goals, gamify, catchup, recap;
  try {
    [timetable, exams, scheduled, chapters, dailyTasks, stats, assignments, goals, gamify, catchup, recap] = await Promise.all([
      get('/timetable'),
      get('/exams?upcoming=5'),
      get('/chapters/scheduled'),
      get('/chapters'),
      get('/daily-tasks?date=' + todayStr),
      get('/studylog/dashboard-stats'),
      get('/assignments?upcoming=7'),
      get('/goals'),
      get('/gamify/status'),
      get('/catchup/status'),
      get('/report/weekly-recap'),
    ]);
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">${t('alert.loadFail', { msg: e.message })}</p></div>`;
    return;
  }

  const progressMap = {};
  for (const c of chapters) {
    if (!progressMap[c.subject_id]) progressMap[c.subject_id] = { total: 0, prevDone: 0, revDone: 0 };
    const p = progressMap[c.subject_id];
    p.total++;
    if (c.preview_done) p.prevDone++;
    if ((c.reviews || []).some(r => r.is_done)) p.revDone++;
  }

  const todayIdx    = (new Date().getDay() + 6) % 7;
  const tomorrowIdx = (todayIdx + 1) % 7;

  const todaySlots    = timetable.filter(s => s.day_of_week === todayIdx).sort((a, b) => a.period - b.period);
  const tomorrowSlots = timetable.filter(s => s.day_of_week === tomorrowIdx).sort((a, b) => a.period - b.period);

  const todayProgress    = scheduled.filter(p => p.scheduled_date === todayStr);
  const tomorrowProgress = scheduled.filter(p => p.scheduled_date === tomorrowStr);
  const overdueProgress  = scheduled
    .filter(p => p.scheduled_date < todayStr && !p.is_done)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  el.innerHTML = `
    <div class="dashboard-grid">

      <!-- Today's timetable -->
      <div class="card">
        <div class="card-title">${t('card.todaySchedule')}</div>
        ${timetableCard(todaySlots, t('empty.todaySchedule'))}
      </div>

      <!-- Tomorrow's timetable -->
      <div class="card">
        <div class="card-title">${t('card.tomorrowSchedule')}</div>
        ${timetableCard(tomorrowSlots, t('empty.tomorrowSchedule'))}
      </div>

      <!-- Today's homework tasks -->
      <div class="card" id="daily-tasks-card" style="grid-column: 1 / -1;">
        <div class="card-title">${t('card.todayHomework')}</div>
        ${dailyTasksCard(dailyTasks)}
      </div>

      <!-- Today's study time vs goals + streak -->
      <div class="card">
        <div class="card-title">${t('card.todayStudyTime')}</div>
        ${studyStatsCard(stats)}
      </div>

      <!-- Level / XP / combo -->
      <div class="card">
        <div class="card-title">${t('card.level')}</div>
        ${levelCard(gamify)}
      </div>

      <!-- Weekly recap (hidden entirely when last week had no activity) -->
      ${recap.hasActivity ? `<div class="card">
        <div class="card-title">${t('recap.title')}</div>
        ${recapCard(recap)}
      </div>` : ''}

      <!-- Active goals -->
      <div class="card">
        <div class="card-title">${t('card.goals')}</div>
        ${goalsCard(goals)}
      </div>

      <!-- Assignment deadlines -->
      <div class="card">
        <div class="card-title">${t('card.assignmentDue')}</div>
        ${assignmentDueCard(assignments)}
      </div>

      <!-- Today's study progress -->
      <div class="card">
        <div class="card-title">${t('card.todayStudy')}</div>
        ${studyCard(todayProgress, t('empty.todayStudy'))}
      </div>

      <!-- Tomorrow's study progress -->
      <div class="card">
        <div class="card-title">${t('card.tomorrowStudy')}</div>
        ${studyCard(tomorrowProgress, t('empty.tomorrowStudy'))}
      </div>

      <!-- Overdue study progress + catch-up engine -->
      <div class="card">
        <div class="card-title">${t('card.overdue')}</div>
        ${overdueCard(overdueProgress, catchup)}
      </div>

      <!-- Exam countdown -->
      <div class="card">
        <div class="card-title">${t('card.examCountdown')}</div>
        ${exams.length ? exams.map(e => {
          const d = e.days_left;
          const urgency = d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';
          const typeLabel = {
            quiz: t('enum.examType.quiz'), segment: t('enum.examType.segment'),
            midterm: t('enum.examType.midterm'), final: t('enum.examType.final'), mock: t('enum.examType.mock'),
          }[e.exam_type] || e.exam_type;
          const prog = progressMap[e.subject_id];
          const progressBar = prog && prog.total > 0 ? (() => {
            const prevPct = Math.round(prog.prevDone / prog.total * 100);
            const revPct  = Math.round(prog.revDone  / prog.total * 100);
            return `
            <div style="margin-top:.45rem;display:flex;flex-direction:column;gap:4px;">
              <div style="display:flex;align-items:center;gap:.5rem;">
                <span style="font-size:.68rem;color:var(--accent);min-width:2.2rem;">${t('dash.preview')}</span>
                <div style="flex:1;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden;">
                  <div style="height:100%;width:${prevPct}%;background:var(--accent);border-radius:999px;"></div>
                </div>
                <span style="font-size:.68rem;color:var(--text3);min-width:2.8rem;text-align:right;">${prog.prevDone}/${prog.total}</span>
              </div>
              <div style="display:flex;align-items:center;gap:.5rem;">
                <span style="font-size:.68rem;color:var(--success);min-width:2.2rem;">${t('dash.review')}</span>
                <div style="flex:1;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden;">
                  <div style="height:100%;width:${revPct}%;background:var(--success);border-radius:999px;"></div>
                </div>
                <span style="font-size:.68rem;color:var(--text3);min-width:2.8rem;text-align:right;">${prog.revDone}/${prog.total}</span>
              </div>
            </div>`;
          })() : '';
          // Exam-prep pacing: chapters left to preview vs days remaining
          let paceHtml = '';
          if (prog && prog.total > 0) {
            const remaining = prog.total - prog.prevDone;
            if (remaining <= 0) {
              paceHtml = `<div style="font-size:.72rem;margin-top:.35rem;color:var(--success);">${t('dash.pacePreviewDone')}</div>`;
            } else {
              const perDay = Math.ceil(remaining / Math.max(d, 1));
              const paceColor = perDay >= 3 || d <= 0 ? 'var(--danger)' : perDay === 2 ? '#e67e22' : 'var(--text2)';
              paceHtml = `<div style="font-size:.72rem;margin-top:.35rem;color:${paceColor};">${t('dash.pace', { n: remaining, m: perDay })}</div>`;
            }
          }
          return `
          <div style="margin-bottom:.75rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <span class="badge" style="background:${e.subject_color};margin-right:.4rem">${escHtml(e.subject_name)}</span>
                <span class="chip">${typeLabel}</span>
              </div>
              <span class="countdown-pill ${urgency}">${d <= 0 ? t('dash.today') : t('dash.daysLeft', { n: d })}</span>
            </div>
            <div style="font-size:.85rem;margin-top:.25rem;color:var(--text2);">${escHtml(e.title)} · ${fmtDate(e.exam_date)}</div>
            ${progressBar}
            ${paceHtml}
          </div>`;
        }).join('') : `<div class="text-muted text-sm">${t('empty.exams')}</div>`}
      </div>

    </div>
    <div id="dash-time-modal" class="modal-overlay hidden"></div>`;
}

function timetableCard(slots, emptyMsg) {
  if (!slots.length) return `<div class="text-muted text-sm">${emptyMsg}</div>`;
  return slots.map(s => `
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem;">
      <span style="font-size:.78rem;color:var(--text2);min-width:50px;">${t('tt.period', { n: s.period })}</span>
      <span class="badge" style="background:${s.subject_color}">${escHtml(s.subject_name)}</span>
    </div>`).join('');
}

function goalBar(current, goal, color) {
  if (!goal) return '';
  const pct = Math.min(100, Math.round(current / goal * 100));
  return `<div style="height:6px;border-radius:999px;background:var(--bg3);overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:999px;transition:width .3s;"></div>
    </div>`;
}

function studyStatsCard(stats) {
  const dayReached  = stats.daily_goal  && stats.today_minutes >= stats.daily_goal;
  const weekReached = stats.weekly_goal && stats.week_minutes  >= stats.weekly_goal;
  const line = (label, cur, goal, color, reached) => `
    <div style="margin-bottom:.6rem;">
      <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:.25rem;">
        <span style="color:var(--text2);">${label}</span>
        <span style="font-weight:700;">${cur}${goal ? ' / ' + goal : ''} ${t('dash.minUnit')}${reached ? ' ' + t('dash.goalReached') : ''}</span>
      </div>
      ${goalBar(cur, goal, color)}
    </div>`;
  const noGoal = (!stats.daily_goal && !stats.weekly_goal)
    ? `<div class="text-xs text-muted" style="margin-top:.3rem;">${t('dash.noGoalSet')}</div>` : '';
  const streak = stats.current_streak > 0
    ? `<div style="font-size:.9rem;font-weight:700;color:#f97316;margin-top:.5rem;">${t('dash.streakDays', { n: stats.current_streak })}</div>`
    : `<div class="text-xs text-muted" style="margin-top:.5rem;">${t('dash.noStreak')}</div>`;
  return line(t('dash.studiedToday'), stats.today_minutes || 0, stats.daily_goal, dayReached ? 'var(--success)' : 'var(--accent)', dayReached)
    + line(t('dash.thisWeek'), stats.week_minutes || 0, stats.weekly_goal, weekReached ? 'var(--success)' : '#f59e0b', weekReached)
    + noGoal + streak;
}

function recapCard(recap) {
  const s = recap.stats, p = recap.prevStats;
  const hlValue = { goals: s.goals, chapters: s.chapters, minutes: s.minutes };
  const headline = t('recap.headline.' + recap.highlight, { n: hlValue[recap.highlight] });
  const items = [
    ['minutes', 'recap.m.minutes'], ['active_days', 'recap.m.activeDays'],
    ['chapters', 'recap.m.chapters'], ['tasks', 'recap.m.tasks'], ['xp', 'recap.m.xp'],
  ];
  const cells = items.map(([k, key]) => {
    const delta = s[k] - (p[k] || 0);
    // Encouragement-first: only surface a gain, never a shortfall.
    const vs = delta > 0
      ? `<div style="font-size:.66rem;color:var(--success);margin-top:1px;">${t('recap.vs', { n: delta })}</div>` : '';
    return `<div style="text-align:center;flex:1;min-width:0;">
      <div style="font-size:1.05rem;font-weight:800;">${s[k]}</div>
      <div style="font-size:.66rem;color:var(--text2);">${t(key)}</div>
      ${vs}
    </div>`;
  }).join('');
  return `
    <div style="font-size:.92rem;font-weight:700;color:var(--accent);margin-bottom:.6rem;">🎉 ${headline}</div>
    <div style="display:flex;gap:.3rem;">${cells}</div>`;
}

function goalsCard(goals) {
  if (!goals.length) {
    return `<div class="text-muted text-sm">${t('dash.noGoals')}
      <a style="color:var(--accent);cursor:pointer;" onclick="navigate('goals')">${t('dash.goToSetGoals')}</a></div>`;
  }
  const active = goals
    .filter(g => !g.achieved)
    .sort((a, b) => (a.window_to || '9999').localeCompare(b.window_to || '9999'))
    .slice(0, 3);
  if (!active.length) {
    return `<div style="font-size:.85rem;color:var(--success);">${t('dash.allGoalsDone')}</div>`;
  }
  return active.map(g => {
    const target = g.target || 0;
    const raw = g.progress == null ? null : g.progress;
    const pct = target > 0 && raw != null ? Math.min(100, Math.round(raw / target * 100)) : 0;
    const isText = g.goal_type === 'text';
    const label = isText ? t('goal.horizon.' + g.horizon)
      : g.goal_type === 'grade'
        ? (raw == null ? t('goal.noScoreYet') : `${raw} / ${target} ${t('goal.scoreUnit')}`)
        : `${raw} / ${target}`;
    return `
    <div style="margin-bottom:.6rem;">
      <div style="display:flex;justify-content:space-between;gap:.5rem;font-size:.8rem;margin-bottom:.25rem;">
        <span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${g.goal_type === 'chapter' ? '📖' : g.goal_type === 'grade' ? '🏆' : '✏️'} ${escHtml(g.title)}</span>
        <span style="flex-shrink:0;color:var(--text2);">${label}</span>
      </div>
      ${isText ? '' : goalBar(raw || 0, target, 'var(--accent)')}
    </div>`;
  }).join('') + `<div style="text-align:right;"><a style="font-size:.75rem;color:var(--accent);cursor:pointer;" onclick="navigate('goals')">${t('dash.viewAllGoals')}</a></div>`;
}

function assignmentDueCard(items) {
  if (!items.length) return `<div class="text-muted text-sm">${t('dash.noAssignmentDue')}</div>`;
  return items.map(a => {
    const d = daysLeft(a.due_date);
    const urgency = d <= 1 ? 'urgent' : d <= 3 ? 'soon' : 'ok';
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.6rem;">
      <div style="min-width:0;">
        <span class="badge" style="background:${a.subject_color};margin-right:.4rem">${escHtml(a.subject_name)}</span>
        <span style="font-size:.85rem;font-weight:600;">${escHtml(a.title)}</span>
      </div>
      <span class="countdown-pill ${urgency}" style="flex-shrink:0;">${d <= 0 ? t('dash.today') : t('dash.daysLeft', { n: d })}</span>
    </div>`;
  }).join('');
}

function catchupQuestBlock(q) {
  const left = Math.max(0, daysLeft(q.deadline_date));
  const pct = q.target_count > 0 ? Math.min(100, Math.round(q.done_count / q.target_count * 100)) : 0;
  return `
    <div style="border:1.5px solid #f59e0b;border-radius:var(--radius-sm);padding:.5rem .6rem;margin-bottom:.7rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.8rem;">
        <span style="font-weight:700;color:#f59e0b;">⚔️ ${t('catchup.questActive')}</span>
        <span class="countdown-pill ${left <= 1 ? 'urgent' : 'soon'}">${t('catchup.daysLeft', { n: left })}</span>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem;margin-top:.35rem;">
        <div style="flex:1;height:7px;border-radius:4px;background:var(--bg3,rgba(128,128,128,.2));overflow:hidden;">
          <div style="width:${pct}%;height:100%;border-radius:4px;background:#f59e0b;"></div>
        </div>
        <span style="font-size:.75rem;font-weight:700;">${t('catchup.questProgress', { done: q.done_count, target: q.target_count })}</span>
      </div>
    </div>`;
}

function overdueCard(items, cu) {
  const quest = cu && cu.active_quest;
  const cleared = cu ? cu.cleared_last7 : 0;
  const clearedLine = cleared > 0
    ? `<div style="font-size:.78rem;color:var(--success);margin-bottom:.5rem;">✨ ${t('catchup.clearedRecent', { n: cleared })}</div>` : '';

  if (!items.length) {
    return (quest ? catchupQuestBlock(quest) : '') + clearedLine
      + `<div style="font-size:.85rem;color:var(--success);">${t('empty.overdue')}</div>`;
  }

  const cheer = t('catchup.cheer.' + (new Date().getDate() % 5 + 1));
  const total = cleared + items.length;
  const pct = total > 0 ? Math.round(cleared / total * 100) : 0;
  const header = `
    ${quest ? catchupQuestBlock(quest) : ''}
    <div style="font-size:.8rem;color:var(--text2);margin-bottom:.45rem;">💛 ${cheer}</div>
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
      <div style="flex:1;height:7px;border-radius:4px;background:var(--bg3,rgba(128,128,128,.2));overflow:hidden;">
        <div style="width:${pct}%;height:100%;border-radius:4px;background:var(--success);"></div>
      </div>
      <span style="font-size:.72rem;color:var(--text2);">${cleared} / ${total}</span>
    </div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.8rem;">
      <button class="btn btn-ghost btn-sm" onclick="dashCatchupPlan()">${t('catchup.planBtn')}</button>
      ${quest ? '' : `<button class="btn btn-ghost btn-sm" onclick="dashCatchupQuest()">${t('catchup.questBtn')}</button>`}
    </div>`;

  return header + items.map(p => {
    const isPreview = p.type === 'preview';
    const typeLabel = isPreview ? t('dash.preview') : t('dash.review');
    const daysLate  = Math.floor((new Date(today() + 'T00:00:00') - new Date(p.scheduled_date + 'T00:00:00')) / 86400000);
    const lateColor = daysLate >= 7 ? 'var(--danger)' : '#e67e22';
    return `
    <div data-prog-id="${p.id}" data-subject-id="${p.subject_id}" data-chapter-id="${p.chapter_id}" data-is-done="0"
         style="display:flex;align-items:flex-start;gap:.6rem;margin-bottom:.7rem;
                border-radius:var(--radius-sm);padding:.3rem .4rem .3rem .2rem;">
      <button onclick="dashToggleProgress('${p.id}', true)" title="${t('btn.done')}"
        style="margin-top:.2rem;width:18px;height:18px;flex-shrink:0;border-radius:50%;
               border:2px solid ${lateColor};background:transparent;display:flex;align-items:center;
               justify-content:center;font-size:.65rem;color:${lateColor};cursor:pointer;padding:0;">!</button>
      <div style="min-width:0;flex:1;">
        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
          <span class="badge" style="background:${p.subject_color}">${escHtml(p.subject_name)}</span>
          <span style="font-size:.85rem;font-weight:600;">${escHtml(p.chapter_title)}</span>
          <span style="font-size:.7rem;padding:.1rem .4rem;border-radius:999px;border:1.5px solid ${lateColor};color:${lateColor};">${typeLabel}</span>
        </div>
        <div style="font-size:.72rem;color:${lateColor};margin-top:.2rem;">${t('dash.dueDate', { date: fmtDate(p.scheduled_date), days: daysLate })}</div>
      </div>
    </div>`;
  }).join('');
}

function studyCard(items, emptyMsg) {
  if (!items.length) return `<div class="text-muted text-sm">${emptyMsg}</div>`;
  return items.map(p => {
    const isPreview = p.type === 'preview';
    const typeLabel = isPreview ? t('dash.preview') : t('dash.review');
    const color     = isPreview ? 'var(--accent)' : 'var(--success)';
    return `
    <div data-prog-id="${p.id}" data-subject-id="${p.subject_id}" data-chapter-id="${p.chapter_id}" data-is-done="${p.is_done ? '1' : '0'}"
         style="display:flex;align-items:flex-start;gap:.6rem;margin-bottom:.7rem;${p.is_done ? 'opacity:.55;' : ''}">
      <button onclick="dashToggleProgress('${p.id}', false)" title="${p.is_done ? t('btn.undone') : t('btn.done')}"
        style="margin-top:.2rem;width:18px;height:18px;flex-shrink:0;border-radius:50%;
               border:2px solid ${color};background:${p.is_done ? color : 'transparent'};
               display:flex;align-items:center;justify-content:center;font-size:.6rem;color:#fff;
               cursor:pointer;padding:0;">
        ${p.is_done ? '✓' : ''}
      </button>
      <div style="min-width:0;">
        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
          <span class="badge" style="background:${p.subject_color}">${escHtml(p.subject_name)}</span>
          <span style="font-size:.85rem;font-weight:600;${p.is_done ? 'text-decoration:line-through;color:var(--text3);' : ''}">${escHtml(p.chapter_title)}</span>
          <span style="font-size:.7rem;padding:.1rem .4rem;border-radius:999px;border:1.5px solid ${color};color:${color};">${typeLabel}</span>
        </div>
        ${p.notes ? `<div style="font-size:.75rem;color:var(--text2);margin-top:.2rem;">📝 ${escHtml(p.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function dailyTasksCard(tasks) {
  if (!tasks.length) return `<div class="text-muted text-sm">${t('empty.todayHomework')}</div>`;
  return tasks.map(task => {
    const parts = task.parts || [];
    const multiPart = parts.length > 1;
    const doneParts = parts.filter(p => p.is_done).length;
    const allDone = task.is_done || (parts.length > 0 && doneParts === parts.length);
    const subjectBadge = task.subject_name
      ? `<span class="badge" style="background:${task.subject_color};margin-right:.3rem;">${escHtml(task.subject_name)}</span>`
      : '';
    const titleHtml = `${subjectBadge}${task.title ? escHtml(task.title) : ''}`;
    const titleStyle = allDone ? 'text-decoration:line-through;color:var(--text3);' : '';

    if (!multiPart) {
      const p = parts[0];
      return `
        <div id="dt-row-${task.id}" style="display:flex;align-items:center;gap:.6rem;margin-bottom:.55rem;">
          <button onclick="dashTogglePart(${p ? p.id : 0}, ${task.id})"
            style="flex-shrink:0;width:18px;height:18px;border-radius:50%;
                   border:2px solid var(--accent);background:${allDone ? 'var(--accent)' : 'transparent'};
                   display:flex;align-items:center;justify-content:center;font-size:.6rem;color:#fff;
                   cursor:pointer;padding:0;">${allDone ? '✓' : ''}</button>
          <span style="flex:1;font-size:.9rem;${titleStyle}">${titleHtml}</span>
        </div>`;
    }

    const progressColor = allDone ? 'var(--success)' : doneParts > 0 ? 'var(--accent)' : 'var(--text3)';
    const partsHtml = parts.map(p => `
      <div id="dt-part-${p.id}" style="display:flex;align-items:center;gap:.5rem;padding:.15rem 0 .15rem 1.6rem;">
        <button onclick="dashTogglePart(${p.id}, ${task.id})"
          style="flex-shrink:0;width:15px;height:15px;border-radius:50%;
                 border:2px solid var(--accent);background:${p.is_done ? 'var(--accent)' : 'transparent'};
                 display:flex;align-items:center;justify-content:center;font-size:.5rem;color:#fff;
                 cursor:pointer;padding:0;">${p.is_done ? '✓' : ''}</button>
        <span style="font-size:.82rem;${p.is_done ? 'text-decoration:line-through;color:var(--text3);' : ''}">${t('hw.partLabel', { n: p.part_num })}</span>
      </div>`).join('');

    return `
      <div id="dt-row-${task.id}" style="margin-bottom:.65rem;">
        <div style="display:flex;align-items:center;gap:.6rem;">
          <span style="flex-shrink:0;font-size:.75rem;font-weight:700;min-width:28px;text-align:center;color:${progressColor};">${doneParts}/${parts.length}</span>
          <span style="flex:1;font-size:.9rem;${titleStyle}">${titleHtml}</span>
        </div>
        ${partsHtml}
      </div>`;
  }).join('');
}

// ── Global handler (called from inline onclick in studyCard / overdueCard) ──

function openDashTimeModal(onSave, onSkip) {
  if (!_el) return onSkip();
  const modal = _el.querySelector('#dash-time-modal');
  if (!modal) return onSkip();
  modal.innerHTML = `
    <div class="modal-box" style="max-width:320px;">
      <div class="modal-title">${t('timeModal.title')}</div>
      <div class="form-group">
        <label class="form-label">${t('timeModal.label')}</label>
        <input id="dtm-minutes" type="number" class="form-input" min="1" max="600" placeholder="${t('timeModal.placeholder')}">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="dtm-skip">${t('timeModal.skip')}</button>
        <button class="btn btn-primary" id="dtm-save">${t('timeModal.save')}</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');
  modal.querySelector('#dtm-skip').onclick = () => { modal.classList.add('hidden'); onSkip(); };
  modal.querySelector('#dtm-save').onclick = async () => {
    const minutes = parseInt(modal.querySelector('#dtm-minutes').value) || 0;
    if (minutes < 1) {
      modal.querySelector('#dtm-minutes').focus();
      return;
    }
    modal.classList.add('hidden');
    await onSave(minutes);
  };
  modal.onclick = e => { if (e.target === modal) { modal.classList.add('hidden'); onSkip(); } };
  setTimeout(() => modal.querySelector('#dtm-minutes').focus(), 50);
}

window.dashTogglePart = async function(partId, taskId) {
  const partEl = document.getElementById('dt-part-' + partId);
  const taskRow = document.getElementById('dt-row-' + taskId);
  if (!taskRow) return;

  const btn = (partEl || taskRow).querySelector('button');
  const isDone = btn.style.background !== 'transparent' && btn.style.background !== '';
  const newDone = !isDone;

  try {
    await patch('/daily-tasks/parts/' + partId, { is_done: newDone });

    if (partEl) {
      // multi-part: update the part button
      const b = partEl.querySelector('button');
      const s = partEl.querySelector('span');
      b.style.background = newDone ? 'var(--accent)' : 'transparent';
      b.textContent = newDone ? '✓' : '';
      s.style.textDecoration = newDone ? 'line-through' : '';
      s.style.color = newDone ? 'var(--text3)' : '';

      // update progress counter
      const allBtns = taskRow.querySelectorAll('[id^="dt-part-"] button');
      const done = [...allBtns].filter(b => b.style.background !== 'transparent' && b.style.background !== '').length;
      const total = allBtns.length;
      const counter = taskRow.querySelector('div > span:first-child');
      if (counter) {
        counter.textContent = `${done}/${total}`;
        counter.style.color = done === total ? 'var(--success)' : done > 0 ? 'var(--accent)' : 'var(--text3)';
      }
      const titleSpan = taskRow.querySelector('div > span:nth-child(2)');
      if (titleSpan) {
        titleSpan.style.textDecoration = done === total ? 'line-through' : '';
        titleSpan.style.color = done === total ? 'var(--text3)' : '';
      }
    } else {
      // single-part: update checkbox
      const b = taskRow.querySelector('button');
      const s = taskRow.querySelector('span');
      b.style.background = newDone ? 'var(--accent)' : 'transparent';
      b.textContent = newDone ? '✓' : '';
      s.style.textDecoration = newDone ? 'line-through' : '';
      s.style.color = newDone ? 'var(--text3)' : '';
    }
  } catch (e) {
    alert(t('alert.saveFailed', { msg: e.message }));
  }
};

window.dashToggleProgress = async function(progressId, removeOnDone) {
  const row = document.querySelector(`[data-prog-id="${progressId}"]`);
  if (!row) return;
  const btn = row.querySelector('button');
  const markingDone = removeOnDone || row.dataset.isDone === '0';

  btn.disabled = true;
  btn.style.opacity = '.4';

  try {
    await patch('/chapters/progress/' + progressId, { toggle_done: true });

    function afterToggle() {
      if (removeOnDone) {
        row.style.transition = 'opacity .25s';
        row.style.opacity = '0';
        setTimeout(() => {
          const parent = row.parentElement;
          row.remove();
          if (parent && !parent.querySelector('[data-prog-id]')) {
            parent.innerHTML = `<div style="font-size:.85rem;color:var(--success);">${t('empty.overdue')}</div>`;
          }
        }, 260);
      } else {
        if (_el) render(_el);
      }
    }

    if (markingDone) {
      openDashTimeModal(
        async (minutes) => {
          if (minutes > 0) {
            try {
              await post('/studylog', {
                subject_id:  +row.dataset.subjectId,
                log_date:    today(),
                minutes,
                chapter_id:  +row.dataset.chapterId,
              });
            } catch (_) {}
          }
          afterToggle();
        },
        afterToggle
      );
    } else {
      afterToggle();
    }
  } catch (e) {
    btn.disabled = false;
    btn.style.opacity = '';
    alert(t('alert.saveFailed', { msg: e.message }));
  }
};

// ── Catch-up engine buttons (補救卡) ──

window.dashCatchupPlan = async function() {
  try {
    const r = await post('/catchup/plan', {});
    if (r.moved > 0) {
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: { icon: '📅', title: t('catchup.planDone'), color: 'var(--accent)' },
      }));
    }
    if (_el) render(_el);
  } catch (e) {
    alert(t('alert.saveFailed', { msg: e.message }));
  }
};

window.dashCatchupQuest = async function() {
  try {
    const q = await post('/catchup/quest', {});
    window.dispatchEvent(new CustomEvent('app-toast', {
      detail: { icon: '⚔️', title: t('catchup.questStarted', { target: q.target_count }), color: '#f59e0b' },
    }));
    if (_el) render(_el);
  } catch (e) {
    alert(t('alert.saveFailed', { msg: e.message }));
  }
};
