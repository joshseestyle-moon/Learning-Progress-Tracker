module.exports = [
  // ── 習慣類 ──
  { id: 'first_log',        category: '習慣',  icon: '🌱', name: '學習萌芽',   desc: '第一次記錄讀書時間',           rarity: 'common'   },
  { id: 'streak_3',         category: '習慣',  icon: '🔥', name: '三日不怠',   desc: '連續3天記錄讀書',              rarity: 'common'   },
  { id: 'streak_7',         category: '習慣',  icon: '🌟', name: '一週達人',   desc: '連續7天記錄讀書',              rarity: 'uncommon' },
  { id: 'streak_14',        category: '習慣',  icon: '💪', name: '兩週衝刺',   desc: '連續14天記錄讀書',             rarity: 'rare'     },
  { id: 'streak_30',        category: '習慣',  icon: '👑', name: '月讀之星',   desc: '連續30天記錄讀書',             rarity: 'epic'     },
  // ── 努力類 ──
  { id: 'hours_10',         category: '努力',  icon: '📚', name: '初學有成',   desc: '累積讀書達10小時',             rarity: 'common'   },
  { id: 'hours_50',         category: '努力',  icon: '🎯', name: '努力不懈',   desc: '累積讀書達50小時',             rarity: 'uncommon' },
  { id: 'hours_100',        category: '努力',  icon: '🎓', name: '百時學者',   desc: '累積讀書達100小時',            rarity: 'rare'     },
  // ── 完成類 ──
  { id: 'first_assignment', category: '完成',  icon: '✅', name: '責任達人',   desc: '完成第一份作業',               rarity: 'common'   },
  { id: 'assignments_20',   category: '完成',  icon: '🏅', name: '作業英雄',   desc: '累積完成20份作業',             rarity: 'uncommon' },
  { id: 'first_chapter',    category: '完成',  icon: '📖', name: '初探知識',   desc: '完成第一個章節的預習或複習',   rarity: 'common'   },
  { id: 'chapters_10',      category: '完成',  icon: '🗺️', name: '知識探索者', desc: '累積完成10個章節進度',         rarity: 'uncommon' },
  { id: 'subject_complete', category: '完成',  icon: '🏆', name: '科目征服者', desc: '完成某科所有章節的預習',       rarity: 'rare'     },
  // ── 作業類 ──
  { id: 'hw_day_1',      category: '完成',  icon: '📋', name: '盡責開始',   desc: '第一次完成當天所有作業',         rarity: 'common'   },
  { id: 'hw_streak_3',   category: '完成',  icon: '📌', name: '作業達人',   desc: '連續3天完成所有作業',            rarity: 'uncommon' },
  { id: 'hw_streak_7',   category: '完成',  icon: '🥇', name: '作業之星',   desc: '連續7天完成所有作業',            rarity: 'rare'     },
  { id: 'hw_days_10',    category: '完成',  icon: '🎖️', name: '毅力勇者',   desc: '累積10天完成所有作業',           rarity: 'uncommon' },
  // ── 補救挑戰類 ──
  { id: 'quest_first',      category: '完成',  icon: '⚔️', name: '重返戰場',   desc: '完成第一個補救挑戰',           rarity: 'uncommon' },
  { id: 'quest_5',          category: '完成',  icon: '🛡️', name: '補救常勝軍', desc: '累積完成5個補救挑戰',          rarity: 'rare'     },
  { id: 'comeback',         category: '完成',  icon: '🌈', name: '逆轉勝',     desc: '清除10項逾期進度',             rarity: 'rare'     },
  // ── 等級/連續達標類 ──
  { id: 'level_5',          category: '努力',  icon: '⭐', name: '嶄露頭角',   desc: '等級達到 5 級',                rarity: 'uncommon' },
  { id: 'level_10',         category: '努力',  icon: '🌠', name: '扶搖直上',   desc: '等級達到 10 級',               rarity: 'rare'     },
  { id: 'combo_7',          category: '習慣',  icon: '⚡', name: '火力全開',   desc: '連續7天達成每日讀書目標',      rarity: 'rare'     },
  // ── 成績類 ──
  { id: 'first_grade',      category: '成績',  icon: '📝', name: '首次出征',   desc: '第一次記錄成績',               rarity: 'common'   },
  { id: 'perfect_score',    category: '成績',  icon: '💯', name: '完美主義',   desc: '某次考試達滿分',               rarity: 'epic'     },
  { id: 'grade_improve',    category: '成績',  icon: '📈', name: '進步之星',   desc: '同科成績比上一次進步',         rarity: 'uncommon' },
];
