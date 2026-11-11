const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const db = require('./db');
const yut = require('./yut');
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
  if (u && sid) io.to(sid).emit('me', { id: u.id, username: u.username, assets: u.assets, yutHold: u.yutHold, yut: u.yut || {}, owned: u.owned || SHOP.DEFAULT_OWNED, equip: Object.assign({}, SHOP.DEFAULT_EQUIP, u.equip || {}) });
}
yut.init({
  getUser: id => db.byId.get(id),
  save: () => db.save(),
  notify: (uid, ev, payload) => {
    if (ev === 'me') return pushMe(uid);
    if (!uid) return io.emit(ev, payload);
    const sid = userSocket.get(uid);
    if (sid) io.to(sid).emit(ev, payload);
  },
});

io.on('connection', socket => {
  let user = null;
  const enter = u => { user = u; userSocket.set(u.id, socket.id); pushMe(u.id); };
  socket.on('register', ({ username, password } = {}, cb = () => {}) => {
    const r = db.register(username, password);
    if (r.error) return cb(r);
    enter(r.user); cb({ ok: true });
  });
  socket.on('login', ({ username, password } = {}, cb = () => {}) => {
    const r = db.login(username, password);
    if (r.error) return cb(r);
    enter(r.user); cb({ ok: true });
  });
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
  socket.on('disconnect', () => { if (user && userSocket.get(user.id) === socket.id) userSocket.delete(user.id); });
});

server.listen(PORT, () => console.log(`윷놀이 서버 실행 중: http://localhost:${PORT}`));
