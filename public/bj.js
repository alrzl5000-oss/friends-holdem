// ================= 블랙잭 미니게임 (딜러전 · 1대1) =================
// app.js 의 socket, me, $, esc, short, won, toast, cardHTML, faceCls, fxBanner, confetti, fxOn 사용
(function () {
  const CHIPS = [1e6, 5e6, 1e7, 5e7, 1e8];
  let tab = 'solo', bet = 1e7, soloState = null, duelState = null, duelList = [], timerIv = null;
  const el = () => $('bjBody');
  const open = () => !$('bjOverlay').classList.contains('hidden');
  const backCls = () => (me && me.skin && me.skin.back ? 'bk-' + me.skin.back : '');
  const cards = (list, mine) => list.map(c => cardHTML(c, c ? (mine ? faceCls(me.skin) : '') : backCls())).join('');
  const RES = {
    bj: ['블랙잭!', 'win'], win: ['승리!', 'win'], push: ['무승부', 'made'], lose: ['패배', 'lose'], bust: ['버스트', 'lose'],
  };

  function betPicker() {
    return `<div class="bj-bet"><span>베팅</span><b>${short(bet)}</b></div>
      <div class="bj-chips">${CHIPS.map(c => `<button class="bj-chip ${c === bet ? 'on' : ''}" data-bet="${c}" ${me.assets < c ? 'disabled' : ''}>${short(c)}</button>`).join('')}</div>`;
  }
  function bindBet(rerender) {
    el().querySelectorAll('[data-bet]').forEach(b => b.onclick = () => { bet = +b.dataset.bet; rerender(); });
  }
  function head() {
    $('bjCash').textContent = me ? short(me.assets) : '-';
    $('bjTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.bt === tab));
  }

  // ---------- 딜러전 ----------
  function renderSolo() {
    const s = soloState || {};
    const st = s.stats || me.bj || {};
    const playing = s.status === 'player';
    const done = s.status === 'done';
    let h = `<div class="bj-stats">전적 <b>${st.win || 0}승 ${st.lose || 0}패 ${st.push || 0}무</b> · 블랙잭 ${st.bj || 0}회 · 손익 <b class="${(st.net || 0) >= 0 ? 'plus' : 'minus'}">${(st.net || 0) >= 0 ? '+' : ''}${short(st.net || 0)}</b></div>`;
    h += `<div class="bj-felt">
      <div class="bj-side"><span>딜러 ${s.dealer ? `<em>${s.dt}${done ? '' : '+?'}</em>` : ''}</span><div class="bj-cards">${s.dealer ? cards(s.dealer) : '<i class="bj-ph"></i><i class="bj-ph"></i>'}</div></div>
      <div class="bj-mid">${done ? `<div class="bj-res ${RES[s.result][1]}">${RES[s.result][0]} ${s.payout ? `<small>+${short(s.payout)}</small>` : ''}</div>` : playing ? `<div class="bj-betnow">베팅 ${short(s.bet * (s.doubled ? 2 : 1))}${s.doubled ? ' (더블)' : ''}</div>` : '<div class="bj-rule">블랙잭 3:2 · 딜러는 17 이상에서 멈춤</div>'}</div>
      <div class="bj-side me"><span>나 ${s.player ? `<em>${s.pt}</em>` : ''}</span><div class="bj-cards">${s.player ? cards(s.player, true) : '<i class="bj-ph"></i><i class="bj-ph"></i>'}</div></div>
    </div>`;
    if (playing) {
      h += `<div class="bj-acts"><button class="btn big" data-op="hit">히트 <small>한 장 더</small></button><button class="btn gold big" data-op="stand">스탠드 <small>멈추기</small></button>${s.canDouble ? `<button class="btn green big" data-op="double">더블 <small>2배·1장만</small></button>` : ''}</div>`;
    } else {
      h += betPicker() + `<button class="btn gold big" data-op="deal" ${me.assets < bet ? 'disabled' : ''}>${done ? '한 판 더' : '딜'} · ${short(bet)}</button>`;
    }
    el().innerHTML = h;
    bindBet(renderSolo);
    el().querySelectorAll('[data-op]').forEach(b => b.onclick = () => act(b.dataset.op));
  }
  function act(op) {
    socket.emit('bj', { op, bet }, r => {
      if (r.error) toast(r.error);
      const prev = soloState;
      soloState = r.state;
      renderSolo(); head();
      if (soloState.status === 'done' && (!prev || prev.status !== 'done' || op === 'deal')) {
        const [t, cls] = RES[soloState.result];
        if (fxOn()) { fxBanner(t, soloState.payout ? '+' + short(soloState.payout) : '', cls); if (soloState.result === 'bj') confetti(50); }
      }
    });
  }

  // ---------- 1대1 ----------
  function renderDuel() {
    clearInterval(timerIv);
    const d = duelState;
    let h = '';
    const chatOn = d && (d.status === 'play' || d.status === 'done');
    $('bjChat').classList.toggle('hidden', !chatOn);
    if (chatOn) renderChat(d);
    if (!d || d.status === 'gone') {
      h += `<p class="hint" style="text-align:left">같은 금액을 걸고 친구와 한 판 승부 · 21에 더 가까운 사람이 판돈 전부 (블랙잭 > 21, 둘 다 버스트면 무승부)</p>`;
      h += betPicker() + `<button class="btn gold big" data-dop="create" ${me.assets < bet ? 'disabled' : ''}>⚔️ 결투 열기 · ${short(bet)}</button>`;
      h += `<div class="bj-list-h">열린 결투</div>`;
      h += duelList.length ? duelList.map(x => `<div class="bj-duel"><div><b>${esc(x.host)}</b><span>판돈 ${short(x.bet)}</span></div><button class="btn small green" data-join="${x.code}" ${me.assets < x.bet ? 'disabled' : ''}>도전</button></div>`).join('')
        : `<div class="empty-note">열린 결투가 없어요</div>`;
    } else if (d.status === 'open') {
      h += `<div class="bj-wait"><div class="bj-spin">🃏</div><b>상대를 기다리는 중…</b><span>판돈 ${short(d.bet)} · 코드 <b>${d.code}</b></span><span class="hint">친구가 블랙잭 → 1대1 에서 "도전"을 누르면 시작돼요</span></div>
        <button class="btn big" data-dop="cancel">취소하고 돌려받기</button>`;
    } else {
      const done = d.status === 'done';
      h += `<div class="bj-score"><b>${esc(d.me.name)}</b> <em>${d.score.me}</em> : <em>${d.score.opp}</em> <b>${esc(d.opp.name)}</b><span>${d.round}판째 · 판돈 ${short(d.bet)}</span></div>`;
      h += `<div class="bj-felt">
        <div class="bj-side"><span>${esc(d.opp.name)} ${done ? `<em>${d.opp.t}</em>` : d.opp.stood ? '<em class="st">멈춤</em>' : '<em class="st">고민 중…</em>'}</span><div class="bj-cards">${cards(d.opp.cards)}</div></div>
        <div class="bj-mid">${done ? `<div class="bj-res ${RES[d.result][1]}">${RES[d.result][0]} ${d.result === 'win' ? `<small>+${short(d.bet * 2)}</small>` : ''}</div>` : `<div class="bj-betnow">판돈 ${short(d.bet)} × 2 · <span data-left></span></div>`}</div>
        <div class="bj-side me"><span>나 <em>${d.me.t}</em>${d.me.stood && !done ? ' <em class="st">멈춤</em>' : ''}</span><div class="bj-cards">${cards(d.me.cards, true)}</div></div>
      </div>`;
      if (!done && !d.me.stood) h += `<div class="bj-acts"><button class="btn big" data-dop="hit">히트</button><button class="btn gold big" data-dop="stand">스탠드</button></div>`;
      else if (!done) h += `<p class="hint">상대가 끝나길 기다리는 중…</p>`;
      else {
        if (d.ready.opp && !d.ready.me) h += `<p class="bj-ready">🔥 ${esc(d.opp.name)} 님이 한 판 더 원해요!</p>`;
        h += `<div class="bj-acts">${d.ready.me ? `<button class="btn big" disabled>상대 기다리는 중…</button>` : `<button class="btn gold big" data-dop="again">한 판 더 <small>판돈 ${short(d.bet)}</small></button>`}<button class="btn big" data-dop="leave">나가기</button></div>`;
      }
    }
    el().innerHTML = h;
    bindBet(renderDuel);
    el().querySelectorAll('[data-dop]').forEach(b => b.onclick = () => {
      const op = b.dataset.dop;
      socket.emit('duel', { op, arg: op === 'create' ? bet : undefined }, r => {
        if (r.error) return toast(r.error);
        if (op === 'create') duelState = r.state;
        if (op === 'cancel') { duelState = null; toast('결투를 취소하고 돌려받았어요', true); }
        if (op === 'leave') { duelState = null; loadDuels(); return; }
        renderDuel(); head();
      });
    });
    el().querySelectorAll('[data-join]').forEach(b => b.onclick = () => socket.emit('duel', { op: 'join', arg: b.dataset.join }, r => r.error && toast(r.error)));
    const left = el().querySelector('[data-left]');
    if (left && d && d.deadline) {
      const tick = () => { left.textContent = Math.max(0, Math.ceil((d.deadline - Date.now()) / 1000)) + '초'; };
      tick(); timerIv = setInterval(tick, 500);
    }
  }
  // 1대1 채팅
  function renderChat(d) {
    const log = $('bjChatLog');
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
    log.innerHTML = (d.chat || []).map(m => m.sys ? `<div class="sys">${esc(m.text)}</div>` : `<div class="${m.name === d.me.name ? 'me' : ''}"><b>${esc(m.name)}</b>${esc(m.text)}</div>`).join('') || '<div class="sys">채팅으로 도발해 보세요 😎</div>';
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  $('bjChatForm').onsubmit = e => {
    e.preventDefault();
    const i = $('bjChatInput'), text = i.value.trim();
    if (!text) return;
    socket.emit('duel', { op: 'chat', arg: text }, r => { if (r.error) toast(r.error); });
    i.value = '';
  };
  function loadDuels() {
    socket.emit('duel', { op: 'list' }, r => { if (r.ok) { duelList = r.list; duelState = r.mine || duelState; } if (tab === 'duel') renderDuel(); });
  }
  socket.on('duels', list => { duelList = list || []; if (open() && tab === 'duel' && (!duelState || duelState.status === 'open')) renderDuel(); });
  socket.on('duelState', st => {
    const prev = duelState;
    if (st.status === 'gone') { duelState = null; if (st.msg) toast(st.msg); $('bjChat').classList.add('hidden'); if (open() && tab === 'duel') loadDuels(); return; }
    duelState = st;
    if (st.status === 'play' && (!prev || prev.status !== 'play')) { toast(st.round > 1 ? `⚔️ ${st.round}판째 시작!` : '⚔️ 결투 시작!', true); if (!open()) openBJ('duel'); }
    if (st.status === 'done' && (!prev || prev.status !== 'done') && fxOn()) { const [t, c] = RES[st.result]; fxBanner(t, st.result === 'win' ? '+' + short(st.bet * 2) : '', c); }
    if (open() && tab === 'duel') renderDuel();
  });
  socket.on('me', () => { if (open()) head(); });

  function openBJ(t) {
    if (t) tab = t;
    $('bjOverlay').classList.remove('hidden');
    head();
    if (tab === 'solo') socket.emit('bj', { op: 'state' }, r => { soloState = r.state; renderSolo(); });
    else loadDuels();
  }
  window.openBJ = openBJ;
  $('bjBtn').onclick = () => openBJ();
  // 기본 룰
  $('bjRules').onclick = () => {
    const p = modal(`<h3>📖 블랙잭 기본 룰</h3>
      <div class="bj-rules">
        <b>목표</b>
        <p>카드 합을 <em>21</em>에 가깝게 만들되, 21을 넘으면(<em>버스트</em>) 바로 져요.</p>
        <b>카드 점수</b>
        <p>2~10은 숫자 그대로 · J·Q·K는 <em>10</em> · A는 <em>11</em> 또는 <em>1</em> (유리한 쪽으로 자동 계산)</p>
        <b>블랙잭</b>
        <p>처음 두 장이 <em>A + 10점 카드</em>면 블랙잭 — 그냥 21보다 강해요.</p>
        <b>행동</b>
        <p><em>히트</em> 한 장 더 받기 · <em>스탠드</em> 멈추기 · <em>더블</em> (처음 두 장일 때만) 베팅을 2배로 하고 딱 한 장만 더 받고 끝</p>
        <hr>
        <b>🤵 딜러전</b>
        <p>· 딜러 카드는 한 장만 보이고, 내가 멈추면 공개돼요<br>
        · 딜러는 <em>16 이하면 무조건 받고, 17 이상이면 멈춰요</em><br>
        · 이기면 <em>2배</em> 돌려받음 · 블랙잭으로 이기면 <em>2.5배</em> · 비기면 베팅 그대로 돌려받음<br>
        · 베팅 100만 ~ 1억 · 6벌 카드를 매 판 새로 섞어요</p>
        <b>⚔️ 1대1</b>
        <p>· 둘이 같은 금액을 걸고, 상대 카드는 첫 장만 보여요<br>
        · 둘 다 멈추면 공개해서 <em>21에 더 가까운 사람이 판돈 전부</em><br>
        · 블랙잭 > 21 · 한 명만 버스트면 상대 승 · 둘 다 버스트거나 같은 점수면 무승부(돌려받음)<br>
        · 시작 후 <em>60초</em> 안에 안 멈추면 자동 스탠드</p>
        <b>💡 기본 팁</b>
        <p>· 내 합이 <em>11 이하</em>면 히트해도 절대 안 터져요<br>
        · 딜러 공개 카드가 <em>2~6</em>이면 딜러가 터지기 쉬워서 12 이상이면 멈추는 게 유리<br>
        · 딜러 공개 카드가 <em>7~A</em>면 17이 될 때까지 받는 게 유리<br>
        · 내 합 <em>10·11</em>에 딜러 카드가 약하면 더블 찬스</p>
      </div>
      <button class="btn gold" data-x>확인</button>`);
    p.querySelector('[data-x]').onclick = closeModal;
  };
  $('bjClose').onclick = () => { $('bjOverlay').classList.add('hidden'); clearInterval(timerIv); };
  $('bjTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.bt; if (tab !== 'duel') $('bjChat').classList.add('hidden'); openBJ(); };
})();
