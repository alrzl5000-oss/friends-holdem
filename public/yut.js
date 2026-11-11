// ================= 윷놀이 (3~4인 · 판돈) =================
// app.js 의 socket, me, $, esc, short, toast 사용
(function () {
  const CHIPS = [1e6, 5e6, 1e7, 5e7, 1e8];
  let bet = 1e7, room = null, lobby = [], timerIv = null;
  const open = () => !$('yutOverlay').classList.contains('hidden');

  function cell(p, v) {
    const mine = v.options.includes(p);
    const toks = [];
    v.players.forEach(pl => { const k = pl.pos.filter(q => q === p).length; for (let i = 0; i < k; i++) toks.push(`<i class="yt-tok" style="background:${pl.color}">${esc(pl.name.slice(0, 1))}</i>`); });
    return `<button class="yt-cell ${mine ? 'opt' : ''} ${p === 30 ? 'goal' : ''}" ${mine ? `data-move="${p}"` : 'disabled'}><small>${p === 30 ? '🏁' : p}</small><span>${toks.join('')}</span></button>`;
  }
  function boardHTML(v) {
    let h = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
      const p = r * 6 + (r % 2 ? 6 - c : c + 1);
      h += cell(p, v);
    }
    return `<div class="yt-board">${h}</div>`;
  }
  function trayHTML(v) {
    return `<div class="yt-tray">${v.players.map(pl => {
      const home = pl.pos.filter(q => q === 0).length;
      return `<div class="yt-pl ${pl.turn ? 'turn' : ''}" style="--pc:${pl.color}"><b>${esc(pl.name)}${pl.host ? ' 👑' : ''}</b><span>대기 ${home} · 골인 ${pl.done}/4</span></div>`;
    }).join('')}</div>`;
  }
  function renderLobby() {
    const cashTxt = me ? short(me.assets) : '-';
    $('yutBody').innerHTML = `
      <div class="yt-head">판돈 <b>${short(bet)}</b> <small>현금 ${cashTxt}</small></div>
      <div class="bj-chips">${CHIPS.map(c => `<button class="bj-chip ${c === bet ? 'on' : ''}" data-ybet="${c}" ${me && me.assets < c ? 'disabled' : ''}>${short(c)}</button>`).join('')}</div>
      <button class="btn gold" id="yutCreate">🎲 방 만들기 (3~4인)</button>
      <div class="yt-join"><input id="yutCode" maxlength="4" placeholder="방 코드 4자리" autocomplete="off"><button class="btn small" id="yutJoin">들어가기</button></div>
      <div class="yt-list">${lobby.length ? lobby.map(r => `<button class="yt-room" data-yjoin="${r.code}"><b>${esc(r.host)}</b> 방 · 판돈 ${short(r.bet)} · ${r.n}/4명 · 코드 ${r.code}</button>`).join('') : '<p class="hint">열린 방이 없어요. 직접 만들어 보세요.</p>'}</div>`;
    $('yutBody').querySelectorAll('[data-ybet]').forEach(b => b.onclick = () => { bet = +b.dataset.ybet; renderLobby(); });
    $('yutCreate').onclick = () => act('create', bet, res => { if (res.state) { room = res.state; renderRoom(); } });
    $('yutJoin').onclick = () => act('join', $('yutCode').value.trim().toUpperCase(), res => { if (res.state) { room = res.state; renderRoom(); } });
    $('yutBody').querySelectorAll('[data-yjoin]').forEach(b => b.onclick = () => act('join', b.dataset.yjoin, res => { if (res.state) { room = res.state; renderRoom(); } }));
  }
  function renderRoom() {
    const v = room;
    if (!v) return renderLobby();
    const isHost = v.players.some(pl => pl.id === v.you && pl.host);
    const turnName = v.status === 'play' ? (v.players.find(pl => pl.turn) || {}).name : '';
    const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000)) : 0;
    let status = v.status === 'open' ? `대기 중 · ${v.players.length}/4명 (3명부터 시작)` : v.status === 'play' ? `${turnName} 차례 · ${left}초` : `🏆 ${v.winner} 우승!`;
    const last = v.last ? `<p class="hint">🎲 마지막 던짐: <b>${v.last.name}</b>${v.last.extra ? ' (한 번 더)' : ''}</p>` : '';
    const actions = v.status === 'open'
      ? `${isHost ? `<button class="btn gold small" id="yutStart" ${v.players.length < 3 ? 'disabled' : ''}>시작</button><button class="btn small" id="yutCancel">방 닫기</button>` : `<button class="btn small" id="yutLeave">나가기</button>`}`
      : '';
    $('yutBody').innerHTML = `
      <div class="yt-head">판돈 <b>${short(v.pot)}</b> <small>${short(v.bet)} × ${v.players.length}명 · 우승자가 전부 가져가요</small></div>
      <div class="yt-status">${esc(status)}</div>
      ${trayHTML(v)}
      ${boardHTML(v)}
      ${v.canThrow ? `<button class="btn gold yt-throw" id="yutThrow">🎲 윷 던지기</button>` : ''}
      ${v.canMove ? `<p class="hint">움직일 말을 칸에서 골라 주세요 (밝게 표시된 칸)</p>` : ''}
      ${last}
      <div class="yt-actions">${actions}</div>
      <div class="bj-chat"><div class="bj-chat-log" id="yutChatLog">${v.chat.map(m => `<div><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('')}</div>
        <form class="chat-form" id="yutChatForm"><input id="yutChatInput" maxlength="100" placeholder="한마디…" autocomplete="off" /><button class="btn gold small" type="submit">전송</button></form></div>`;
    $('yutBody').querySelectorAll('[data-move]').forEach(b => b.onclick = () => act('move', +b.dataset.move));
    if ($('yutThrow')) $('yutThrow').onclick = () => act('throw');
    if ($('yutStart')) $('yutStart').onclick = () => act('start');
    if ($('yutCancel')) $('yutCancel').onclick = () => act('cancel', null, () => { room = null; renderLobby(); });
    if ($('yutLeave')) $('yutLeave').onclick = () => act('leave', null, () => { room = null; renderLobby(); });
    $('yutChatForm').onsubmit = e => { e.preventDefault(); const t = $('yutChatInput').value; $('yutChatInput').value = ''; if (t.trim()) act('chat', t); };
    const log = $('yutChatLog'); if (log) log.scrollTop = log.scrollHeight;
    clearInterval(timerIv);
    if (v.status === 'play') timerIv = setInterval(() => { const el = document.querySelector('.yt-status'); if (el && room && room.deadline) { const s = Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)); el.textContent = `${turnName} 차례 · ${s}초`; } }, 500);
  }
  function act(op, arg, cb) {
    socket.emit('yut', { op, arg }, res => {
      if (res.error) return toast(res.error);
      if (res.state) room = res.state;
      if (op === 'list') { lobby = res.list || []; if (res.mine) room = res.mine; }
      if (cb) cb(res);
      if (op === 'leave' || op === 'cancel') room = null;
      if (room || op === 'list') { if (room) renderRoom(); else renderLobby(); }
      else renderLobby();
    });
  }
  function openYut() {
    $('yutOverlay').classList.remove('hidden');
    act('list');
  }
  socket.on('yutState', v => {
    if (!open()) return;
    if (v.you && room && room.code === v.code) { room = v; renderRoom(); }
  });
  socket.on('yuts', list => { lobby = list; if (open() && !room) renderLobby(); });
  socket.on('me', () => { if (open() && !room) renderLobby(); });

  $('yutBtn').onclick = openYut;
  $('yutClose').onclick = () => { $('yutOverlay').classList.add('hidden'); clearInterval(timerIv); };
})();
