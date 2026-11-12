const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const db = require('./db');
const yut = require('./yut');
const mini = require('./mini');
const SHOP = require('./shop');

const app = express();
// 배포 후 옛 화면이 캐시로 남지 않도록: 매번 서버에 새 버전인지 확인하게 함
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true, lastModified: true,
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache'),
}));
app.get('/api/shop', (req, res) => res.json(SHOP.ITEMS));
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const userSocket = new Map(); // uid -> socket.id

function pushMe(uid) {
  const u = db.byId.get(uid);
  const sid = userSocket.get(uid);
  if (u && sid) io.to(sid).emit('me', { id: u.id, username: u.username, assets: u.assets, yutHold: u.yutHold, trophy: u.trophy || 0, throws: u.throws || {}, mini: u.mini || {}, shame: db.shameLevel(u), shameUntil: db.shameUntil(u), bailoutsToday: db.bailoutsToday(u), bailoutLimit: db.DAILY_BAILOUTS, bailoutAmount: db.BAILOUT_AMOUNT, yut: u.yut || {}, owned: u.owned || SHOP.DEFAULT_OWNED, equip: Object.assign({}, SHOP.DEFAULT_EQUIP, u.equip || {}) });
}
yut.init({
  getUser: id => db.byId.get(id),
  shameOf: u => db.shameLevel(u),
  save: () => db.save(),
  otherBusy: uid => mini.busy(uid),
  notify: (uid, ev, payload) => {
    if (ev === 'me') return pushMe(uid);
    if (!uid) return io.emit(ev, payload);
    const sid = userSocket.get(uid);
    if (sid) io.to(sid).emit(ev, payload);
  },
});

// 미니게임 (고누 · 십이장기, 1대1)
mini.init({
  getUser: id => db.byId.get(id),
  shameOf: u => db.shameLevel(u),
  save: () => db.save(),
  otherBusy: uid => yut.busy(uid),
  hasOtherCode: c => yut.hasCode(c),
  notify: (uid, ev, payload) => {
    if (ev === 'me') return pushMe(uid);
    const sid = userSocket.get(uid);
    if (sid) io.to(sid).emit(ev, payload);
  },
});
mini.setPushList(() => io.emit('minis', mini.lobbyList()));

// 저장해 둔 판 되살리기 → 되살리지 못한 판돈은 환불
const alive = [...yut.restore(db.storedGames()), ...mini.restore(db.storedMini())];
db.refundOrphans(alive);
db.setDump(yut.dump);
db.setMiniDump(mini.dump);
db.save();
if (alive.length) console.log(`저장된 판 복원: 참가자 ${alive.length}명`);
// 재배포 때 꺼지기 직전 상태 저장
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { db.save(); } catch (e) {} process.exit(0); });

io.on('connection', socket => {
  let user = null;
  const enter = u => { user = u; userSocket.set(u.id, socket.id); pushMe(u.id); };
  socket.on('register', ({ username, password } = {}, cb = () => {}) => {
    const r = db.register(username, password);
    if (r.error) return cb(r);
    enter(r.user); cb({ ok: true, token: r.token });
  });
  socket.on('login', ({ username, password } = {}, cb = () => {}) => {
    const r = db.login(username, password);
    if (r.error) return cb(r);
    enter(r.user); cb({ ok: true, token: r.token });
  });
  // 새로고침·재접속: 저장된 토큰으로 자동 로그인
  socket.on('auth', ({ token } = {}, cb = () => {}) => {
    const u = db.byToken(token);
    if (!u) return cb({ error: '다시 로그인해 주세요' });
    enter(u); cb({ ok: true });
  });
  socket.on('logout', ({ token } = {}, cb = () => {}) => { db.logout(token); cb({ ok: true }); });
  const guard = fn => (...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
    if (!user) return cb({ error: '로그인이 필요해요' });
    try { fn(cb, ...args); } catch (e) { console.error(e); cb({ error: '서버 오류가 났어요' }); }
  };
  socket.on('yut', guard((cb, { op, arg } = {}) => {
    const r = yut.yutAct(user, String(op), arg);
    if (r.ok && ['create', 'join', 'leave', 'cancel', 'start'].includes(op)) pushMe(user.id);
    cb(r);
  }));
  socket.on('shop', guard((cb, { op, id } = {}) => {
    const r = op === 'buy' ? db.buy(user, String(id)) : op === 'equip' ? db.equip(user, String(id)) : { error: '알 수 없는 요청이에요' };
    if (r.ok) pushMe(user.id);
    cb(r);
  }));
  // 충전: 현금 1억 미만이면 3억, 하루 3번, 24시간 동안 말에 딱지
  socket.on('bailout', guard(cb => {
    const r = db.bailout(user);
    if (r.error) return cb(r);
    pushMe(user.id); yut.refreshFor(user.id);
    cb(r);
  }));
  socket.on('mini', guard((cb, { op, ...arg } = {}) => cb(mini.act(user, String(op), arg))));
  socket.on('miniList', guard(cb => cb({ ok: true, list: mini.lobbyList() })));
  // 판 코드가 윷놀이 판인지 미니게임 판인지
  socket.on('whichCode', guard((cb, code) => { const c = String(code || '').toUpperCase(); cb({ ok: true, kind: yut.hasCode(c) ? 'yut' : mini.hasCode(c) ? 'mini' : null }); }));
  socket.on('rank', guard(cb => cb({ ok: true, list: db.rank() })));
  socket.on('throwStats', guard(cb => cb({ ok: true, all: db.throwStats(), mine: user.throws || {} })));
  socket.on('disconnect', () => { if (user && userSocket.get(user.id) === socket.id) userSocket.delete(user.id); });
});

server.listen(PORT, () => console.log(`윷놀이 서버 실행 중: http://localhost:${PORT}`));
