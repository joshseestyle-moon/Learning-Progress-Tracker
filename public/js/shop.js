export async function render(el) {
  const placeholderItems = [
    { icon: '🍕', name: '選一頓晚餐', desc: '由你決定今晚吃什麼' },
    { icon: '🎮', name: '額外遊戲時間', desc: '兌換 30 分鐘遊戲時間' },
    { icon: '🎬', name: '電影之夜', desc: '週末選一部想看的電影' },
  ];

  el.innerHTML = `
    <div style="max-width:860px;margin:0 auto;padding-bottom:2rem">

      <div style="background:#f39c1222;border:1px solid #f39c1244;border-radius:var(--radius);
                  padding:.75rem 1.1rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:.6rem;
                  color:#c87f0a;font-size:.9rem;font-weight:500">
        🚧 功能開發中，敬請期待
      </div>

      <div style="display:grid;grid-template-columns:1fr 2fr;gap:1.25rem;margin-bottom:1.25rem">

        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);
                    padding:1.25rem;display:flex;flex-direction:column;gap:.5rem">
          <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em">我的點數</div>
          <div style="font-size:2.4rem;font-weight:700;color:var(--text3);line-height:1">— <span style="font-size:1.1rem">點</span></div>
          <div style="font-size:.78rem;color:var(--text3);margin-top:.25rem">點數系統設計中</div>
        </div>

        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem">
          <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.9rem">可兌換獎勵</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem">
            ${placeholderItems.map(item => `
              <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);
                          padding:.9rem .75rem;display:flex;flex-direction:column;align-items:center;gap:.4rem;
                          text-align:center;opacity:.5;cursor:default">
                <div style="font-size:1.8rem">${item.icon}</div>
                <div style="font-size:.88rem;font-weight:600;color:var(--text2)">${item.name}</div>
                <div style="font-size:.75rem;color:var(--text3)">${item.desc}</div>
                <div style="font-size:.75rem;color:var(--text3);margin-top:.2rem">🔒 即將推出</div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem">
        <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.75rem">兌換紀錄</div>
        <div style="text-align:center;padding:1.5rem 0;color:var(--text3);font-size:.88rem">
          尚無兌換紀錄
        </div>
      </div>

    </div>
  `;
}
