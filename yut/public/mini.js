// 미니게임 클라이언트 (고누 · 십이장기, 1대1) — app.js 의 공용 함수($, socket, me, modal, toast, won, esc, Art …)를 씀
(function () {
  const BETS = [1e6, 5e6, 1e7, 5e7, 1e8];
  const TURN_MS = 30000;
  const SIDE_COLOR = { gonu: ['#c43a4a', '#3f6fb8'], j12: ['#2f8f58', '#c43a4a'] };   // 십이장기: 초(초록)·한(빨강)
  let R = null;            // 지금 보고 있는 미니게임 판 (서버 view)
  let sel = null;          // 고른 말: 고누 {from} / 십이장기 {kind:'move', from:[c,r]} | {kind:'drop', t}
  let list = [];
  let chatN = 0, chatCode = null, lastSeq = 0, tick = null;

  const send = (op, arg = {}, after) => socket.emit('mini', { op, ...arg }, r => { if (r && r.error) toast(r.error); else if (after) after(r); });
  const isMe = () => R && !R.spectating;
  const vside = () => (R && R.side === 1 ? 1 : 0);               // 내가 아래쪽에 오도록
  const colorOfSide = s => ((typeof isExcel === 'function' && isExcel()) ? ['#4472c4', '#ed7d31'][s] : SIDE_COLOR[R ? R.type : 'gonu'][s]);

  // ---------------- 로비 ----------------
  function renderLobby() {
    const box = $('miniList'); if (!box) return;
    box.innerHTML = list.map(r => {
      const open = r.status === 'open', canJoin = open && r.n < 2;
      return `<div class="room"><span class="tag ${open ? 'bet' : 'live'}">${esc(r.title)}</span>
        <div class="info"><b>${esc(r.host)}님의 ${esc(r.title)}</b><span>${open ? `코드 ${r.code} · ` : '진행 중 · '}판돈 ${won(r.bet).replace('원', '')}${r.watchers ? ` · 👀 ${r.watchers}` : ''}</span></div>
        <span class="cnt">${r.n}/2</span>
        ${canJoin ? `<button class="btn small green" data-mjoin="${r.code}">입장</button>` : ''}
        <button class="watch-btn" data-mwatch="${r.code}">관전</button></div>`;
    }).join('');
    box.querySelectorAll('[data-mjoin]').forEach(b => b.onclick = () => join(b.dataset.mjoin));
    box.querySelectorAll('[data-mwatch]').forEach(b => b.onclick = () => send('watch', { code: b.dataset.mwatch }, r => enter(r.state)));
    if ($('ill-gonu') && !$('ill-gonu').innerHTML) { $('ill-gonu').innerHTML = gonuSVG(null, true); $('ill-j12').innerHTML = j12Mini(); }
  }
  document.querySelectorAll('[data-mnew]').forEach(b => b.onclick = () => createModal(b.dataset.mnew));
  document.querySelectorAll('[data-mrule]').forEach(b => b.onclick = () => rulebook(b.dataset.mrule));
  socket.on('minis', l => { list = l; if (!R) renderLobby(); });
  function refreshList() { socket.emit('miniList', r => { if (r && r.list) { list = r.list; renderLobby(); } }); }

  function createModal(type) {
    let bet = 1e7;
    const title = type === 'gonu' ? '고누' : '십이장기';
    const draw = () => {
      modal(`<h3>${title} 판 만들기</h3><p class="hint" style="text-align:left">1대1로 같은 판돈을 내고, 이긴 사람이 다 가져가요. 무승부면 돌려받아요. 선은 시작할 때 무작위.</p>
        <div class="bet-grid">${BETS.map(b => `<button class="bet-opt${b === bet ? ' on' : ''}" data-b="${b}" ${me.assets < b ? 'disabled' : ''}>${won(b)}<small>이기면 ${won(b * 2)}</small></button>`).join('')}</div>
        <div class="row2"><button class="btn" data-close>취소</button><button class="btn green" id="mkMini">${won(bet)}로 만들기</button></div>`);
      document.querySelectorAll('.bet-opt').forEach(b => b.onclick = () => { bet = +b.dataset.b; draw(); });
      document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
      $('mkMini').onclick = () => { closeModal(); send('create', { type, bet }, r => enter(r.state)); };
    };
    draw();
  }
  function join(code) { send('join', { code }, r => enter(r.state)); }
  function enter(state) { R = state; sel = null; chatCode = null; lastSeq = state ? state.seq : 0; renderAll(); }
  function leaveView() { R = null; sel = null; clearInterval(tick); refreshList(); renderAll(); }
  socket.on('miniState', v => { if (R && R.code === v.code) { const fresh = v.seq !== R.seq; R = v; if (fresh) sel = null; render(fresh); } else if (!R && v && !v.spectating && v.status !== 'done') { R = v; renderAll(); } });
  socket.on('miniGone', code => { if (R && R.code === code) { toast('방장이 판을 닫았어요. 판돈은 돌려받았어요'); leaveView(); } });
  function checkMine() { send('mine', {}, r => { if (r.state) { R = r.state; renderAll(); } refreshList(); }); }

  $('mExit').onclick = () => {
    if (!R) return;
    if (R.spectating) return send('unwatch', {}, leaveView);
    if (R.status === 'done') return leaveView();   // 끝난 판은 서버에서 이미 정리됨
    if (R.status === 'play') {
      modal(`<h3>기권할까요?</h3><p class="hint" style="text-align:left">진행 중에는 나갈 수 없어요. 기권하면 판돈을 상대가 가져가요.</p>
        <div class="row2"><button class="btn" data-close>계속하기</button><button class="btn red" id="mResign">기권</button></div>`);
      document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
      $('mResign').onclick = () => { closeModal(); send('resign'); };
      return;
    }
    send(R.players[0] && R.host === me.username ? 'cancel' : 'leave', {}, leaveView);
  };
  $('mRules').onclick = () => R && rulebook(R.type);
  $('mForm').onsubmit = e => { e.preventDefault(); const t = $('mIn').value.trim(); $('mIn').value = ''; if (t) send('chat', { text: t }); };

  // ---------------- 판 그리기 ----------------
  function render(fresh) {
    if (!R) return;
    const v = R;
    $('mName').textContent = `${v.host}님의 ${v.title}`;
    $('mSub').textContent = `판돈 ${won(v.pot)} · 코드 ${v.code}${v.watchers ? ` · 👀 ${v.watchers}` : ''}`;
    const my = v.players.find(p => p.side === vside() && !v.spectating) || v.players.find(p => p.side === vside());
    const op = v.players.find(p => p !== my);
    $('mOpp').innerHTML = sideHTML(op, false);
    $('mMe').innerHTML = sideHTML(my, true);
    $('mBoard').innerHTML = v.type === 'gonu' ? gonuSVG(v) : j12SVG(v);
    $('mBoard').className = 'm-board ' + v.type;
    bindBoard();
    // 컨트롤
    let h = '';
    const host = v.host === me.username;
    if (v.status === 'open') {
      h = v.spectating ? `<div class="wait">👀 관전 중 · 시작 전<div class="row"><button class="btn" id="mUnwatch">관전 그만하기</button></div></div>`
        : host ? `<div class="wait">${v.players.length < 2 ? `상대를 기다리는 중 · 코드 <b>${v.code}</b>` : '두 명이 모였어요'}
            <div class="row"><button class="btn" id="mCancel">판 닫기</button><button class="btn green" id="mStart" ${v.players.length < 2 ? 'disabled' : ''}>시작하기</button></div></div>`
        : `<div class="wait">방장이 시작하길 기다리는 중…<div class="row"><button class="btn" id="mLeave">나가기</button></div></div>`;
    } else if (v.status === 'play') {
      const turnP = v.players.find(p => p.side === v.turn);
      h = v.spectating ? `<div class="wait">👀 관전 중 · ${esc(turnP ? turnP.name : '')}님 차례<div class="row"><button class="btn" id="mUnwatch">관전 그만하기</button></div></div>`
        : v.moves.length ? `<p class="hint m-hint">${v.type === 'gonu' ? '움직일 말을 누르고, 갈 점을 누르세요' : '말이나 포로를 누르고, 빛나는 칸을 누르세요'}</p>`
        : `<div class="wait">${esc(turnP ? turnP.name : '')}님 차례예요</div>`;
      if (!v.spectating) h += `<button class="btn small m-resign" id="mResignBtn">🏳 기권</button>`;
      h += `<div class="turn-bar"><i id="mBar"></i></div>`;
    } else {
      const meWin = v.winner === me.username;
      h = `<div class="m-result ${v.draw ? 'draw' : meWin ? 'win' : 'lose'}">${v.draw ? '🤝 무승부' : `🏆 ${esc(v.winner)} 승리`}<small>${esc(v.reason)}</small></div>
        <button class="btn gold big" id="mDone">로비로</button>`;
    }
    $('mCtrl').innerHTML = h;
    const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('mStart', () => send('start')); on('mCancel', () => send('cancel', {}, leaveView)); on('mLeave', () => send('leave', {}, leaveView));
    on('mUnwatch', () => send('unwatch', {}, leaveView)); on('mResignBtn', () => $('mExit').click());
    on('mDone', () => (v.spectating ? send('unwatch', {}, leaveView) : leaveView()));
    renderChat();
    if (fresh && v.state && v.state.last) effects(v);
    clearInterval(tick);
    if (v.status === 'play') tick = setInterval(() => {
      const bar = $('mBar'); if (!bar || !R || !R.deadline) return;
      const left = Math.max(0, R.deadline - Date.now()); bar.style.width = (left / TURN_MS * 100) + '%'; bar.classList.toggle('low', left < 8000);
    }, 250);
    sizeBoard();
  }
  function sideHTML(p, mine) {
    if (!p) return `<div class="m-card empty">${R.status === 'open' ? '빈 자리 · 상대를 기다리는 중' : ''}</div>`;
    const turn = R.status === 'play' && R.turn === p.side;
    const c = colorOfSide(p.side);
    const hand = R.type === 'j12' && R.state ? R.state.hand[p.side] : [];
    const handHTML = R.type === 'j12' ? `<div class="m-hand">${hand.length ? hand.map((t, i) => {
      const can = mine && isMe() && R.moves.some(m => m.kind === 'drop' && m.t === t);
      const on = sel && sel.kind === 'drop' && sel.t === t;
      return `<button class="m-hand-p${can ? ' can' : ''}${on ? ' on' : ''}" data-hand="${t}" ${can ? '' : 'disabled'}>${pieceTile(t, p.side, false, 34)}</button>`;
    }).join('') : '<span class="m-hand-empty">포로 없음</span>'}</div>` : '';
    return `<div class="m-card${turn ? ' turn' : ''}" style="--c:${c}">${avHTML(pieceArt(p.piece))}
      <div class="m-who"><b>${esc(p.name)}${p.id === R.you ? ' (나)' : ''}${shameTag(p.shame)}</b>
        <span>${R.type === 'j12' ? (p.side === 0 ? '초 (아래에서 시작)' : '한 (위에서 시작)') : (p.side === 0 ? '선 · 왼쪽' : '후 · 오른쪽')}${turn ? ' · <i class="m-turn">차례</i>' : ''}</span></div>${handHTML}</div>`;
  }
  const sizeBoard = () => {
    const z = document.querySelector('.m-zone'), b = $('mBoard'); if (!z || !b) return;
    const ratio = R && R.type === 'j12' ? 3 / 4 : 1;
    let h = Math.min(z.clientHeight - 6, 520), w = h * ratio;
    if (w > z.clientWidth - 20) { w = z.clientWidth - 20; h = w / ratio; }
    b.style.width = w + 'px'; b.style.height = h + 'px'; b.style.setProperty('--s', Math.min(w, h) + 'px');
  };
  if (window.ResizeObserver) new ResizeObserver(sizeBoard).observe(document.querySelector('.m-zone'));

  // ---------- 고누 ----------
  const GP = [[16, 16], [84, 16], [50, 50], [16, 84], [84, 84]];
  const GE = [[0, 1], [0, 3], [1, 4], [0, 2], [1, 2], [3, 2], [4, 2]];
  let gid = 0;
  function gonuSVG(v, ill) {
    const U = 'gn' + (++gid);   // 그라데이션 id 가 다른 그림(윷가락 등)과 겹치지 않게
    const xl = (typeof isExcel === 'function' && isExcel());
    const board = v && v.state ? v.state.board : [0, 1, null, 0, 1];
    const flip = v && vside() === 1;   // 후는 자기 말이 왼쪽에 오도록 좌우 뒤집기
    const P = i => { const [x, y] = GP[i]; return flip ? [100 - x, y] : [x, y]; };
    const myMoves = v && isMe() ? v.moves : [];
    const targets = sel && sel.from != null ? myMoves.filter(m => m.from === sel.from) : [];
    const last = v && v.state && v.state.last;
    const ink = xl ? '#8a8886' : '#3b2a1c';
    const lines = GE.map(([a, b]) => `<line x1="${P(a)[0]}" y1="${P(a)[1]}" x2="${P(b)[0]}" y2="${P(b)[1]}" stroke="${ink}" stroke-width="${xl ? .8 : 1.6}" stroke-linecap="round"/>`).join('');
    const well = (() => { const [x1] = P(3), [x2] = P(4), cx = (x1 + x2) / 2; return xl
      ? `<rect x="${cx - 7}" y="80" width="14" height="8" fill="#ddebf7" stroke="#8a8886" stroke-width=".4"/><text x="${cx}" y="85.8" font-size="3.6" text-anchor="middle" fill="#595959">우물</text>`
      : `<ellipse cx="${cx}" cy="86" rx="11" ry="6.5" fill="url(#${U}w)" stroke="${ink}" stroke-width="1.1"/><ellipse cx="${cx}" cy="85" rx="7" ry="2.6" fill="#bfe3ff" opacity=".45"/><text x="${cx}" y="96.5" font-size="4" text-anchor="middle" fill="${ink}" font-weight="700">우물</text>`; })();
    const pts = GP.map((_, i) => { const [x, y] = P(i); return `<circle cx="${x}" cy="${y}" r="${xl ? 2.2 : 3.2}" fill="${xl ? '#fff' : '#efe3c4'}" stroke="${ink}" stroke-width="${xl ? .6 : 1}"/>`; }).join('');
    const lastMark = last ? (() => { const [x, y] = P(last.to), [fx, fy] = P(last.from); return `<circle cx="${fx}" cy="${fy}" r="5" fill="none" stroke="#e9c46a" stroke-width=".8" stroke-dasharray="1.6 1.2"/><circle cx="${x}" cy="${y}" r="10" fill="#e9c46a" opacity=".22"/>`; })() : '';
    const pieces = board.map((o, i) => {
      if (o === null) return '';
      const [x, y] = P(i), c = (v ? colorOfSide : s => SIDE_COLOR.gonu[s])(o);
      const can = myMoves.some(m => m.from === i), on = sel && sel.from === i;
      return `<g class="g-p${can ? ' can' : ''}${on ? ' on' : ''}" data-pt="${i}">${xl
        ? `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="${c}" stroke="#fff" stroke-width=".8"/>`
        : `<circle cx="${x}" cy="${y + 1.2}" r="8.6" fill="#000" opacity=".3"/><circle cx="${x}" cy="${y}" r="8.4" fill="url(#${U}s${o})" stroke="#fff" stroke-width="1.1"/><ellipse cx="${x - 2.6}" cy="${y - 3.2}" rx="3.6" ry="2" fill="#fff" opacity=".45"/>`}
        ${on ? `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#ffd36a" stroke-width="1.4"/>` : can ? `<circle class="pulse" cx="${x}" cy="${y}" r="10.5" fill="none" stroke="#ffd36a" stroke-width=".9"/>` : ''}</g>`;
    }).join('');
    const tg = targets.map(m => { const [x, y] = P(m.to); return `<g class="g-t" data-mv="${m.id}"><circle cx="${x}" cy="${y}" r="8" fill="#ffd36a" opacity=".3"/><circle class="pulse" cx="${x}" cy="${y}" r="6" fill="#ffd36a" stroke="#fff" stroke-width=".8"/></g>`; }).join('');
    const defs = `<defs><radialGradient id="${U}w" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#5aa9e6"/><stop offset="1" stop-color="#1d4f7a"/></radialGradient>
      ${[0, 1].map(s => { const c = v ? colorOfSide(s) : SIDE_COLOR.gonu[s]; return `<radialGradient id="${U}s${s}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${Art.light(c, .55)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${Art.dark(c, .45)}"/></radialGradient>`; }).join('')}</defs>`;
    const bg = xl ? `<rect width="100" height="100" fill="#fff"/>` : `<rect width="100" height="100" rx="4" fill="#efe3c4"/><rect x="4" y="4" width="92" height="92" rx="2" fill="none" stroke="#8a5a32" stroke-width=".5"/>`;
    return `<svg viewBox="0 0 100 100" class="${ill ? 'ill' : ''}">${defs}${bg}${lines}${well}${pts}${lastMark}${pieces}${tg}</svg>`;
  }

  // ---------- 십이장기 ----------
  const HANJA = { K: '王', J: '將', S: '相', P: '子', H: '侯' };
  const KOR = { K: '왕', J: '장', S: '상', P: '자', H: '후' };
  const DIRS = { K: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]], J: [[0, -1], [-1, 0], [1, 0], [0, 1]], S: [[-1, -1], [1, -1], [-1, 1], [1, 1]], P: [[0, -1]], H: [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]] };
  // 말 한 개 (위를 보면 내 말, 아래를 보면(뒤집힘) 상대 말) — 가장자리 점은 움직일 수 있는 방향
  function pieceTile(t, owner, flipped, px) {
    const W = 'jw' + (++gid);
    const xl = (typeof isExcel === 'function' && isExcel());
    const c = colorOfSide(owner);
    const dots = DIRS[t].map(([dx, dy]) => `<circle cx="${50 + dx * 33}" cy="${50 + dy * 33}" r="4.2" fill="${c}"/>`).join('');
    const body = xl
      ? `<rect x="8" y="8" width="84" height="84" fill="#fff" stroke="${c}" stroke-width="3"/>`
      : `<path d="M50 6 L84 20 L92 92 L8 92 L16 20 Z" fill="url(#${W})" stroke="${Art.dark(c, .2)}" stroke-width="3.5" stroke-linejoin="round"/><path d="M50 12 L79 24 L86 87 L14 87 L21 24 Z" fill="none" stroke="#fff" stroke-width="1.2" opacity=".5"/>`;
    return `<svg viewBox="0 0 100 100" width="${px || ''}" height="${px || ''}" class="m-tile" style="transform:rotate(${flipped ? 180 : 0}deg)">
      <defs><linearGradient id="${W}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e2b6"/><stop offset=".6" stop-color="#e2bf82"/><stop offset="1" stop-color="#c99a5b"/></linearGradient></defs>
      ${body}${dots}<text x="50" y="${xl ? 60 : 64}" font-size="${xl ? 30 : 36}" text-anchor="middle" fill="${c}" font-weight="900" font-family="'Noto Serif KR', 'Nanum Myeongjo', serif">${HANJA[t]}</text>
      <text x="50" y="${xl ? 84 : 83}" font-size="12" text-anchor="middle" fill="${Art.dark(c, .2)}" font-weight="800" font-family="Pretendard, sans-serif">${KOR[t]}</text></svg>`;
  }
  function j12SVG(v) {
    const s = v.state || { b: Array.from({ length: 4 }, () => [null, null, null]), last: null };
    const vs = vside();
    // 화면 좌표 ↔ 판 좌표 (내가 아래)
    const toScr = (c, r) => (vs === 1 ? [2 - c, 3 - r] : [c, r]);
    const myMoves = isMe() ? v.moves : [];
    let targets = [];
    if (sel && sel.kind === 'move') targets = myMoves.filter(m => m.kind === 'move' && m.from[0] === sel.from[0] && m.from[1] === sel.from[1]);
    if (sel && sel.kind === 'drop') targets = myMoves.filter(m => m.kind === 'drop' && m.t === sel.t);
    const last = s.last;
    let cells = '';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const [sc, sr] = toScr(c, r);
      const terr = r === 3 ? 0 : r === 0 ? 1 : -1;   // 0번 진영(아래 끝줄) / 1번 진영(위 끝줄)
      const p = s.b[r][c];
      const can = p && myMoves.some(m => m.kind === 'move' && m.from[0] === c && m.from[1] === r);
      const on = sel && sel.kind === 'move' && sel.from[0] === c && sel.from[1] === r;
      const tg = targets.find(m => m.to[0] === c && m.to[1] === r);
      const lastTo = last && last.to && last.to[0] === c && last.to[1] === r, lastFrom = last && last.from && last.from[0] === c && last.from[1] === r;
      cells += `<div class="j-cell${terr >= 0 ? ' terr t' + terr : ''}${lastTo ? ' last' : ''}${lastFrom ? ' lastf' : ''}${tg ? ' tg' : ''}${can ? ' can' : ''}${on ? ' on' : ''}"
        style="grid-column:${sc + 1};grid-row:${sr + 1}" ${tg ? `data-mv="${tg.id}"` : ''} ${p ? `data-c="${c}" data-r="${r}"` : ''}>
        ${p ? pieceTile(p.t, p.o, p.o !== vs) : ''}${tg ? `<i class="j-dot${p ? ' cap' : ''}"></i>` : ''}</div>`;
    }
    return `<div class="j-grid">${cells}</div>`;
  }
  function j12Mini() {   // 로비 카드 그림
    return `<div class="j-ill">${['S', 'K', 'J'].map(t => pieceTile(t, 1, true, 30)).join('')}${['J', 'K', 'S'].map(t => pieceTile(t, 0, false, 30)).join('')}</div>`;
  }

  // ---------- 누르기 ----------
  function bindBoard() {
    const b = $('mBoard');
    b.onclick = e => {
      if (!R || !isMe() || R.status !== 'play') return;
      const mv = e.target.closest('[data-mv]');
      if (mv) { send('move', { id: +mv.dataset.mv }); sel = null; return; }
      if (R.type === 'gonu') {
        const p = e.target.closest('[data-pt]'); if (!p) { sel = null; return render(); }
        const i = +p.dataset.pt;
        if (!R.moves.some(m => m.from === i)) return;
        const own = R.moves.filter(m => m.from === i);
        if (own.length === 1 && sel && sel.from === i) { send('move', { id: own[0].id }); sel = null; return; }
        sel = { from: i }; render();
      } else {
        const cell = e.target.closest('[data-c]'); if (!cell) { sel = null; return render(); }
        const c = +cell.dataset.c, r = +cell.dataset.r;
        if (!R.moves.some(m => m.kind === 'move' && m.from[0] === c && m.from[1] === r)) return;
        sel = { kind: 'move', from: [c, r] }; render();
      }
    };
    document.querySelectorAll('[data-hand]').forEach(h => h.onclick = () => { if (!h.disabled) { sel = { kind: 'drop', t: h.dataset.hand }; render(); } });
  }

  // ---------- 효과 ----------
  function effects(v) {
    const L = v.state.last, ev = L.ev || {};
    const mover = v.players.find(p => p.side === L.side);
    if (v.type === 'j12') {
      if (ev.captured === 'K') fx('왕을 잡았다!', '#ffd36a');
      else if (ev.captured) fx(`${KOR[ev.captured]} 잡았다!`, '#ff6b6f');
      else if (ev.promote) fx('자 → 후 승격!', '#7fe3ff');
      else if (ev.drop) fx(`${KOR[ev.drop]} 놓기`, '#ffffff');
      if (v.status === 'play' && v.state.tryKing != null && v.state.tryKing === L.side) fx(`${mover ? mover.name : ''} 왕 입궁! 버티면 승리`, '#ffd36a', 1);
    }
    if (v.status === 'done') fx(v.draw ? '무승부' : `${v.winner} 승리!`, '#ffd36a', 2);
  }
  function fx(text, color, row = 0) {
    const b = $('mBoard'); if (!b || ((typeof isExcel === 'function' && isExcel()))) return;
    const el = document.createElement('b'); el.className = 'm-fx'; el.textContent = text;
    el.style.setProperty('--tc', color); el.style.top = (40 + row * 12) + '%';
    b.appendChild(el); setTimeout(() => el.remove(), 1500);
  }

  // ---------- 채팅 (판 아래 작은 창) ----------
  function renderChat() {
    const log = $('mLog');
    const html = m => (m.name === '📢' ? `<p class="sys">${esc(m.text)}</p>` : `<p${m.name === me.username ? ' class="mine"' : ''}><b>${m.watcher ? '👀 ' : ''}${esc(m.name)}</b>${esc(m.text)}</p>`);
    if (chatCode !== R.code) { chatCode = R.code; log.innerHTML = R.chat.map(html).join(''); chatN = R.chat.reduce((a, m) => Math.max(a, m.n || 0), 0); }
    else { const fresh = R.chat.filter(m => (m.n || 0) > chatN); if (fresh.length) { log.insertAdjacentHTML('beforeend', fresh.map(html).join('')); chatN = fresh[fresh.length - 1].n; while (log.children.length > 80) log.firstChild.remove(); } }
    log.scrollTop = log.scrollHeight;
    $('mIn').maxLength = R.spectating ? 30 : 100;
  }

  // ---------------- 룰북 ----------------
  function rulebook(type) {
    const body = type === 'gonu' ? `
      <div class="rb-fig">${gonuSVG(null, true)}</div>
      <h4>판과 말</h4>
      <ul class="rules"><li>점 5개(네 모서리와 가운데)를 선으로 이은 판이에요.</li>
        <li>아래쪽 두 점 사이에는 <b>우물</b>이 있어서 서로 오갈 수 없어요.</li>
        <li>한 사람에 말 <b>2개</b>. 선(먼저 두는 사람)은 왼쪽 두 점, 후는 오른쪽 두 점에서 시작해요.</li></ul>
      <h4>두는 법</h4>
      <ul class="rules"><li>자기 차례에 말 하나를 <b>선을 따라 바로 옆 빈 점</b>으로 한 칸 옮겨요. 건너뛰기·잡기는 없어요.</li>
        <li><b>첫 수 금지:</b> 선은 첫 수에 우물 쪽 말(왼쪽 아래)을 가운데로 넣을 수 없어요. 넣으면 상대가 바로 갇혀 버려서예요. 그래서 첫 수는 왼쪽 위 말이 가운데로 들어가요.</li></ul>
      <h4>이기는 법</h4>
      <ul class="rules"><li>내 차례가 됐는데 <b>움직일 수 있는 말이 없으면 져요.</b> 상대를 가두면 이겨요.</li>
        <li><b>60수</b>(한 사람 30수) 동안 승부가 안 나면 무승부, 판돈은 돌려받아요.</li></ul>
      <h4>판돈 · 시간</h4>
      <ul class="rules"><li>둘이 같은 판돈을 내고 이긴 사람이 전부 가져가요. 선은 시작할 때 무작위로 정해요.</li>
        <li>한 수에 <b>30초</b>. 넘기면 아무 수나 자동으로 둬요. 언제든 기권할 수 있어요(판돈은 상대에게).</li></ul>
      <h4>요령</h4>
      <ul class="rules"><li>가운데 점은 모든 점과 이어져 있어서 가장 중요해요. 상대 말이 우물 옆에 몰려 있을 때 가운데를 차지하면 가두기 쉬워요.</li></ul>`
      : `
      <div class="rb-fig rb-j12">${rbBoard()}</div>
      <h4>판과 말</h4>
      <ul class="rules"><li>가로 3칸 × 세로 4칸 판. 각자 <b>맨 끝 줄이 자기 진영</b>이에요(판에 색으로 표시).</li>
        <li>한 사람에 <b>왕(王)·장(將)·상(相)·자(子)</b> 4개. 아래가 초(초록), 위가 한(빨강).</li>
        <li>처음 배치: 내 진영 왼쪽부터 장·왕·상, 왕 바로 앞에 자.</li></ul>
      <h4>움직임 (말 가장자리의 점 = 갈 수 있는 방향, 한 번에 1칸)</h4>
      <div class="rb-moves">${['K', 'J', 'S', 'P', 'H'].map(t => `<div>${pieceTile(t, 0, false, 54)}<b>${KOR[t]}(${HANJA[t]})</b><span>${{ K: '8방향 모두', J: '앞·뒤·좌·우', S: '대각선 4방향', P: '앞으로만', H: '뒤쪽 대각선 빼고 6방향' }[t]}</span></div>`).join('')}</div>
      <ul class="rules"><li><b>후(侯):</b> 자가 상대 진영(상대 끝줄)에 들어가면 뒤집혀 후가 돼요.</li></ul>
      <h4>잡기와 포로</h4>
      <ul class="rules"><li>상대 말이 있는 칸으로 가면 <b>잡아요.</b> 잡은 말은 내 <b>포로</b>가 돼요(판 아래에 보여요).</li>
        <li>내 차례에 말을 옮기는 대신 <b>포로 하나를 빈 칸에 놓을 수</b> 있어요. 단, <b>상대 진영(상대 끝줄)에는 못 놓아요.</b></li>
        <li>후를 잡으면 자로 돌아와요.</li></ul>
      <h4>이기는 법</h4>
      <ul class="rules"><li>상대 <b>왕을 잡으면</b> 이겨요.</li>
        <li>내 <b>왕이 상대 진영에 들어가서 상대 차례 한 번을 버티면</b> 이겨요(입궁).</li>
        <li><b>200수</b> 안에 끝나지 않으면 무승부, 판돈은 돌려받아요.</li></ul>
      <h4>판돈 · 시간</h4>
      <ul class="rules"><li>둘이 같은 판돈을 내고 이긴 사람이 전부 가져가요. 선(초)은 시작할 때 무작위.</li>
        <li>한 수에 <b>30초</b>, 넘기면 아무 수나 자동. 언제든 기권할 수 있어요.</li></ul>
      <h4>조작</h4>
      <ul class="rules"><li>내 말이나 포로를 누르면 갈 수 있는 칸이 빛나요. 빛나는 칸을 누르면 둬요.</li></ul>`;
    modal(`<h3>📖 ${type === 'gonu' ? '고누 (우물고누)' : '십이장기'} 룰북</h3><div class="rulebook">${body}</div><button class="btn gold" data-close>닫기</button>`);
    document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
  }
  function rbBoard() {   // 룰북용 처음 배치 그림
    const b = [['S1', 'K1', 'J1'], [null, 'P1', null], [null, 'P0', null], ['J0', 'K0', 'S0']];
    return `<div class="j-grid">${b.map((row, r) => row.map((x, c) => `<div class="j-cell${r === 3 ? ' terr t0' : r === 0 ? ' terr t1' : ''}" style="grid-column:${c + 1};grid-row:${r + 1}">${x ? pieceTile(x[0], +x[1], x[1] === '1') : ''}</div>`).join('')).join('')}</div>`;
  }

  // 화면 크기 바뀌면 판 다시 맞춤
  window.addEventListener('resize', sizeBoard);
  window.Mini = { active: () => !!R, render: () => render(false), join, checkMine, renderLobby, refreshList };
})();
