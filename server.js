const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const db = require('./db');
const { CashRoom, TourneyRoom } = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.send('ok'));

const rooms = new Map();
const userRoom = new Map();   // userId -> room code
const userSocket = new Map(); // userId -> socket id
const userWatch = new Map();  // userId -> 관전 중인 room code

function me(u) {
  return Object.assign(db.pub(u), { room: userRoom.get(u.id) || null });
}

let lobbyTimer = null;
const ctx = {
  io,
  userRoom,
  lobbyChanged() {
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => { lobbyTimer = null; io.to('lobby').emit('rooms', roomList()); }, 500);
  },
  pushMe(uid) {
    const sid = userSocket.get(uid);
    const u = db.byId(uid);
    if (sid && u) io.to(sid).emit('me', me(u));
  },
};

function roomList() {
  return [...rooms.values()]
    .filter(r => !(r.mode === 'tourney' && r.status === 'finished'))
    .map(r => r.summary());
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function closeRoom(code) {
  const r = rooms.get(code);
  if (!r) return;
  for (const uid of r.spectators.keys()) userWatch.delete(uid);
  io.to('room:' + code).emit('roomClosed');
  r.close();
  rooms.delete(code);
  ctx.lobbyChanged();
}

io.on('connection', socket => {
  let user = null;
  let token = null;

  const guard = fn => (...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
    if (!user) return cb({ error: '로그인이 필요해요' });
    try { fn(cb, ...args); } catch (e) { console.error(e); cb({ error: '서버 오류가 났어요' }); }
  };

  function bind(u, t) {
    user = u;
    token = t;
    const old = userSocket.get(u.id);
    if (old && old !== socket.id) io.to(old).emit('kicked', '다른 곳에서 로그인해서 연결이 끊겼어요');
    userSocket.set(u.id, socket.id);
    socket.join('lobby');
  }

  function roomOfUser() {
    const code = userRoom.get(user.id);
    return code ? rooms.get(code) : null;
  }

  function stopWatching() {
    const code = userWatch.get(user.id);
    if (!code) return;
    userWatch.delete(user.id);
    socket.leave('room:' + code);
    const r = rooms.get(code);
    if (r) { r.spectators.delete(user.id); ctx.lobbyChanged(); }
  }

  function enterRoom(room, buyIn, cb) {
    const cur = userRoom.get(user.id);
    if (cur && cur !== room.code && rooms.has(cur)) return cb({ error: '이미 다른 방에 참여 중이에요', room: cur });
    const r = room.join(user, socket.id, buyIn);
    if (r.error || r.needBuyIn) return cb(r);
    if (userWatch.get(user.id) === room.code) { room.spectators.delete(user.id); userWatch.delete(user.id); }
    else stopWatching();
    userRoom.set(user.id, room.code);
    socket.join('room:' + room.code);
    socket.emit('chatHistory', room.chat);
    room.emit();
    ctx.pushMe(user.id);
    cb({ ok: true, code: room.code });
  }

  socket.on('register', ({ username, password } = {}, cb = () => {}) => {
    const r = db.register(username, password);
    if (r.error) return cb(r);
    bind(r.user, r.token);
    cb({ token: r.token, user: me(r.user) });
  });

  socket.on('login', ({ username, password } = {}, cb = () => {}) => {
    const r = db.login(username, password);
    if (r.error) return cb(r);
    bind(r.user, r.token);
    cb({ token: r.token, user: me(r.user) });
  });

  socket.on('auth', ({ token: t } = {}, cb = () => {}) => {
    const u = db.byToken(t);
    if (!u) return cb({ error: '다시 로그인해주세요' });
    bind(u, t);
    cb({ user: me(u) });
  });

  socket.on('logout', guard(cb => {
    stopWatching();
    const r = roomOfUser();
    if (r) { r.leave(user.id); socket.leave('room:' + r.code); }
    db.logout(token);
    userSocket.delete(user.id);
    user = null;
    cb({ ok: true });
  }));

  socket.on('rooms', guard(cb => cb(roomList())));
  socket.on('ranking', guard(cb => cb(db.ranking())));
  socket.on('me', guard(cb => cb(me(user))));

  socket.on('avatar', guard((cb, pixels) => {
    if (!/^[0-9a-f]{256}$/.test(String(pixels))) return cb({ error: '잘못된 그림이에요' });
    user.avatar = pixels;
    db.save();
    const r = roomOfUser();
    if (r) { const s = r.table.seat(user.id); if (s) { s.avatar = pixels; r.emit(); } }
    ctx.pushMe(user.id);
    cb({ ok: true });
  }));

  // 스킨 상점
  const refreshSkin = () => {
    const r = roomOfUser();
    if (r) { const s = r.table.seat(user.id); if (s) { s.skin = db.skinOf(user); r.emit(); } }
    ctx.pushMe(user.id);
  };
  socket.on('buy', guard((cb, id) => { const r = db.buy(user, String(id)); if (r.ok) refreshSkin(); cb(r); }));
  socket.on('equip', guard((cb, { cat, id } = {}) => { const r = db.equip(user, String(cat), id ? String(id) : null); if (r.ok) refreshSkin(); cb(r); }));

  // 구제금(충전): 현금 1억 미만이면 10억까지 채워줌 · 하루 3회 · 24시간 좃밥
  socket.on('bailout', guard(cb => {
    if (userRoom.get(user.id)) return cb({ error: '방에서 나온 뒤에 신청할 수 있어요' });
    if (user.assets >= 1e8 || user.inPlay > 0 || user.tourneyHold > 0) return cb({ error: '현금이 1억 미만일 때만 신청할 수 있어요' });
    const r = db.bailout(user);
    if (r.error) return cb(r);
    ctx.pushMe(user.id);
    cb(r);
  }));

  socket.on('createRoom', guard((cb, opts = {}) => {
    const cur = userRoom.get(user.id);
    if (cur && rooms.has(cur)) return cb({ error: '이미 다른 방에 참여 중이에요', room: cur });
    const code = newCode();
    let room;
    if (opts.mode === 'tourney') {
      if (user.assets < db.ENTRY_FEE) return cb({ error: '참가비 1억원이 필요해요' });
      room = new TourneyRoom(ctx, code, opts.name, user, opts);
    } else {
      room = new CashRoom(ctx, code, opts.name, user, opts);
      if (opts.buyIn == null) return cb({ needBuyIn: { min: room.buyMin, max: room.buyMax, def: room.buyDef, sb: room.table.sb, bb: room.table.bb } });
    }
    rooms.set(code, room);
    enterRoom(room, opts.buyIn, res => {
      if (res.error) rooms.delete(code);
      cb(res);
      ctx.lobbyChanged();
    });
  }));

  socket.on('joinRoom', guard((cb, { code, buyIn } = {}) => {
    const room = rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return cb({ error: '방을 찾을 수 없어요' });
    enterRoom(room, buyIn, cb);
  }));

  socket.on('watch', guard((cb, code) => {
    const room = rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return cb({ error: '방을 찾을 수 없어요' });
    const cur = userRoom.get(user.id);
    if (cur && rooms.has(cur)) return cb({ error: '참여 중인 방이 있어요. 나온 뒤에 관전할 수 있어요', room: cur });
    stopWatching();
    room.spectators.set(user.id, socket.id);
    userWatch.set(user.id, room.code);
    socket.join('room:' + room.code);
    socket.emit('chatHistory', room.chat);
    socket.emit('state', room.viewFor(user.id));
    ctx.lobbyChanged();
    cb({ ok: true, code: room.code });
  }));

  socket.on('leaveRoom', guard(cb => {
    stopWatching();
    const r = roomOfUser();
    if (r) {
      r.leave(user.id);
      socket.leave('room:' + r.code);
      if (r.isEmpty()) closeRoom(r.code);
    }
    ctx.pushMe(user.id);
    cb({ ok: true });
  }));

  socket.on('start', guard(cb => {
    const r = roomOfUser();
    if (!r || r.mode !== 'tourney') return cb({ error: '토너먼트 방이 아니에요' });
    cb(r.start(user.id));
  }));

  socket.on('action', guard((cb, { type, amount } = {}) => {
    const r = roomOfUser();
    if (!r) return cb({ error: '방에 없어요' });
    cb(r.table.act(user.id, type, amount));
  }));

  socket.on('rebuy', guard(cb => {
    const r = roomOfUser();
    if (!r || r.mode !== 'tourney') return cb({ error: '토너먼트가 아니에요' });
    cb(r.rebuy(user));
  }));

  socket.on('withdraw', guard(cb => {
    const r = roomOfUser();
    if (!r || r.mode !== 'tourney') return cb({ error: '토너먼트가 아니에요' });
    cb(r.withdraw(user.id));
  }));

  socket.on('chop', guard((cb, yes) => {
    const r = roomOfUser();
    if (!r || r.mode !== 'tourney') return cb({ error: '토너먼트가 아니에요' });
    cb(yes === false ? r.declineChop(user.id) : r.proposeChop(user.id));
  }));

  socket.on('topUp', guard((cb, amount) => {
    const r = roomOfUser();
    if (!r || r.mode !== 'cash') return cb({ error: '일반모드가 아니에요' });
    cb(r.topUp(user, amount));
  }));

  socket.on('chat', guard((cb, text) => {
    const watching = rooms.get(userWatch.get(user.id));
    const r = roomOfUser() || watching;
    if (!r) return cb({ error: '방에 없어요' });
    text = String(text || '').trim().slice(0, 200);
    if (!text) return cb({ ok: true });
    r.pushChat({ name: user.username, uid: user.id, text, ts: Date.now(), watcher: !roomOfUser() });
    cb({ ok: true });
  }));

  socket.on('disconnect', () => {
    if (!user || userSocket.get(user.id) !== socket.id) return;
    userSocket.delete(user.id);
    stopWatching();
    const r = roomOfUser();
    if (r) r.setConnected(user.id, socket.id, false);
  });
});

// 정리: 일반모드에서 3분 넘게 끊긴 사람은 자동 정산 퇴장, 빈 방/끝난 토너먼트 정리
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.mode === 'cash') {
      for (const s of r.seated) {
        if (!s.connected && s.awaySince && now - s.awaySince > 3 * 60 * 1000) r.leave(s.id);
      }
    }
    const anyone = r.seated.some(s => s.connected);
    if (r.isEmpty()) closeRoom(code);
    else if (r.mode === 'tourney' && r.status === 'finished' && now - r.finishedAt > 10 * 60 * 1000) closeRoom(code);
    else if (!anyone && now - r.lastActive > 30 * 60 * 1000) closeRoom(code);
  }
}, 30 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`홀덤 서버 실행 중: http://localhost:${PORT}`));
