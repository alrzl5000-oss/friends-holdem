const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Table } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.send('ok'));

const tables = new Map();

const hooks = {
  emit(table) {
    for (const s of table.seats) {
      if (s && s.connected) io.to(s.socketId).emit('state', table.viewFor(s.id));
    }
  },
  log(table, text) {
    const msg = { system: true, text, ts: Date.now() };
    table.chat.push(msg);
    if (table.chat.length > 150) table.chat.shift();
    io.to(table.code).emit('chat', msg);
  },
};

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (tables.has(code));
  return code;
}

io.on('connection', socket => {
  let table = null;
  let pid = null;

  function join(code, name, playerId, cb) {
    code = String(code || '').trim().toUpperCase();
    const t = tables.get(code);
    if (!t) return cb && cb({ error: '방을 찾을 수 없어요. 코드를 확인해주세요.' });
    name = String(name || '').trim().slice(0, 12) || '플레이어';
    playerId = String(playerId || '').slice(0, 64);
    if (!playerId) return cb && cb({ error: '잘못된 요청이에요' });

    if (table && table !== t) {
      table.removePlayer(pid);
      socket.leave(table.code);
    }
    const r = t.addPlayer(playerId, name, socket.id);
    if (r.error) return cb && cb(r);
    table = t;
    pid = playerId;
    socket.join(code);
    cb && cb({ ok: true, code });
    socket.emit('chatHistory', t.chat);
    if (!r.rejoined) t.log(`${name} 님이 입장했어요`);
    t.emit();
  }

  socket.on('create', ({ name, playerId } = {}, cb) => {
    const code = newCode();
    tables.set(code, new Table(code, hooks));
    join(code, name, playerId, cb);
  });

  socket.on('join', ({ room, name, playerId } = {}, cb) => join(room, name, playerId, cb));

  socket.on('start', () => {
    if (!table) return;
    const r = table.start(pid);
    if (r.error) socket.emit('toast', r.error);
  });

  socket.on('action', ({ type, amount } = {}) => {
    if (!table) return;
    const r = table.act(pid, type, amount);
    if (r && r.error) socket.emit('toast', r.error);
  });

  socket.on('rebuy', () => {
    if (!table) return;
    const r = table.rebuy(pid);
    if (r.error) socket.emit('toast', r.error);
  });

  socket.on('chat', text => {
    if (!table) return;
    const i = table.seatOf(pid);
    if (i < 0) return;
    text = String(text || '').trim().slice(0, 200);
    if (!text) return;
    const msg = { name: table.seats[i].name, seat: i, text, ts: Date.now() };
    table.chat.push(msg);
    if (table.chat.length > 150) table.chat.shift();
    io.to(table.code).emit('chat', msg);
  });

  socket.on('leave', () => {
    if (!table) return;
    const s = table.seats[table.seatOf(pid)];
    if (s) table.log(`${s.name} 님이 나갔어요`);
    table.removePlayer(pid);
    socket.leave(table.code);
    table = null;
  });

  socket.on('disconnect', () => {
    if (table) table.setConnected(pid, socket.id, false);
  });
});

// 아무도 접속 안 한 방은 30분 뒤 정리
setInterval(() => {
  const now = Date.now();
  for (const [code, t] of tables) {
    if (t.connectedCount() === 0 && now - t.lastActive > 30 * 60 * 1000) {
      t.destroy();
      tables.delete(code);
    }
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`홀덤 서버 실행 중: http://localhost:${PORT}`));
