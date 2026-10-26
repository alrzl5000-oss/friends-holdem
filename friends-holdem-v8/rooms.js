// 방 종류: 일반모드(CashRoom), 토너먼트(TourneyRoom)
const { Table } = require('./game');
const db = require('./db');

const FEE = db.ENTRY_FEE;   // 참가비/리바이 1억
const T_STACK = 1e8;        // 토너먼트 시작 금액 1억
const REBUY_MAX = 2;        // 리바이 최대 2회
const REBUY_LEVELS = 5;     // 레벨 5까지 리바이 가능 (레벨 6부터 불가)
const CHOP_MS = 30000;      // 찹 제안 유효 시간
const REBUY_WAIT_MS = 20000;

// 1억 스택 기준 블라인드 (SB, BB) — 100BB로 시작해서 점점 오름
const LEVELS = [
  [50e4, 100e4], [100e4, 200e4], [150e4, 300e4], [200e4, 400e4], [300e4, 600e4],
  [400e4, 800e4], [500e4, 1000e4], [700e4, 1400e4], [1000e4, 2000e4], [1500e4, 3000e4],
  [2000e4, 4000e4], [3000e4, 6000e4], [5000e4, 10000e4],
];
function levelBlinds(n) {
  if (n <= LEVELS.length) return LEVELS[n - 1];
  const [s, b] = LEVELS[LEVELS.length - 1];
  const k = 2 ** (n - LEVELS.length);
  return [s * k, b * k];
}

// 상금 비율 (참가 인원별)
function payoutPct(n) {
  if (n <= 4) return [1];
  if (n <= 6) return [0.7, 0.3];
  return [0.5, 0.3, 0.2];
}

const CASH_TIERS = {
  low: { sb: 10e4, bb: 20e4 },
  mid: { sb: 50e4, bb: 100e4 },
  high: { sb: 250e4, bb: 500e4 },
};

class BaseRoom {
  constructor(ctx, code, name, host) {
    this.ctx = ctx;
    this.code = code;
    this.name = String(name || '').trim().slice(0, 16) || `${host.username}의 방`;
    this.hostId = host.id;
    this.chat = [];
    this.spectators = new Map(); // userId -> socketId
    this.lastActive = Date.now();
  }
  get seated() { return this.table.seats.filter(Boolean); }
  hooks(extra) {
    return Object.assign({
      emit: () => this.emit(),
      log: t => this.log(t),
      seatRemoved: s => this.onSeatRemoved(s),
    }, extra);
  }
  emit() {
    this.lastActive = Date.now();
    for (const s of this.table.seats) {
      if (s && s.connected) this.ctx.io.to(s.socketId).emit('state', this.viewFor(s.id));
    }
    for (const [uid, sid] of this.spectators) this.ctx.io.to(sid).emit('state', this.viewFor(uid));
    this.ctx.lobbyChanged();
  }
  log(text) {
    const msg = { system: true, text, ts: Date.now() };
    this.pushChat(msg);
  }
  pushChat(msg) {
    this.chat.push(msg);
    if (this.chat.length > 150) this.chat.shift();
    this.ctx.io.to('room:' + this.code).emit('chat', msg);
  }
  reconnect(user, socketId) {
    const s = this.table.seat(user.id);
    if (!s) return false;
    s.name = user.username;
    s.avatar = user.avatar;
    s.shame = db.shameLevel(user);
    s.leaving = false;
    this.table.setConnected(user.id, socketId, true);
    return true;
  }
  setConnected(uid, socketId, on) { this.table.setConnected(uid, socketId, on); }
  fixHost() {
    if (this.table.seat(this.hostId)) return;
    const next = this.seated.find(s => !s.leaving);
    if (next) this.hostId = next.id;
  }
  onSeatRemoved(s) {
    this.ctx.userRoom.delete(s.id);
    this.ctx.pushMe(s.id);
    this.fixHost();
  }
  baseInfo(uid) {
    const host = this.table.seat(this.hostId);
    return {
      code: this.code, name: this.name, mode: this.mode, isHost: uid === this.hostId, hostName: host ? host.name : '',
      spectating: this.spectators.has(uid), watchers: this.spectators.size,
    };
  }
  viewFor(uid) {
    return Object.assign(this.table.viewFor(uid), { room: this.info(uid) });
  }
  isEmpty() { return this.seated.length === 0; }
  shameChat(user) {
    if (db.shameLevel(user) > 0) this.pushChat({ name: user.username, uid: user.id, text: '저는 개좃밥 입니다', ts: Date.now(), auto: true });
  }
  shameTick() {
    // 24시간 지나면 좃밥 해제
    for (const s of this.seated) {
      const u = db.byId(s.id);
      if (u) s.shame = db.shameLevel(u);
    }
  }
}

// ===================== 일반모드 =====================
class CashRoom extends BaseRoom {
  constructor(ctx, code, name, host, opts = {}) {
    super(ctx, code, name, host);
    this.mode = 'cash';
    const tier = CASH_TIERS[opts.tier] || CASH_TIERS.mid;
    this.tier = opts.tier in CASH_TIERS ? opts.tier : 'mid';
    this.buyMin = tier.bb * 40;
    this.buyMax = tier.bb * 200;
    this.buyDef = tier.bb * 100;
    this.table = new Table({
      sb: tier.sb, bb: tier.bb,
      hooks: this.hooks({ handEnd: () => this.sync() }),
    });
    this.table.running = true;
  }
  join(user, socketId, buyIn) {
    if (this.reconnect(user, socketId)) return { ok: true };
    if (this.seated.length >= this.table.max) return { error: '자리가 꽉 찼어요' };
    if (buyIn == null) return { needBuyIn: { min: this.buyMin, max: this.buyMax, def: this.buyDef, sb: this.table.sb, bb: this.table.bb } };
    buyIn = Math.floor(Number(buyIn));
    if (!(buyIn >= this.buyMin && buyIn <= this.buyMax)) return { error: '바이인 금액이 범위를 벗어났어요' };
    if (user.assets < buyIn) return { error: '자산이 부족해요' };
    user.assets -= buyIn;
    user.inPlay = buyIn;
    db.save();
    const r = this.table.addPlayer(user, socketId, buyIn, { shame: db.shameLevel(user) });
    if (r.error) { user.assets += buyIn; user.inPlay = 0; return r; }
    this.log(`${user.username} 님 입장 (바이인 ${fmt(buyIn)})`);
    this.shameChat(user);
    return { ok: true };
  }
  sync() {
    this.shameTick();
    for (const s of this.seated) {
      const u = db.byId(s.id);
      if (u) u.inPlay = s.chips;
    }
    db.save();
    for (const s of this.seated) this.ctx.pushMe(s.id);
  }
  onSeatRemoved(s) {
    const u = db.byId(s.id);
    if (u) {
      u.assets += s.chips;
      u.inPlay = 0;
      db.save();
    }
    this.log(`${s.name} 님 퇴장 (정산 ${fmt(s.chips)})`);
    super.onSeatRemoved(s);
  }
  leave(uid) { this.table.removePlayer(uid); }
  topUp(user, amount) {
    const s = this.table.seat(user.id);
    if (!s) return { error: '자리가 없어요' };
    if (this.table.inBetting() && s.inHand && !s.folded) return { error: '핸드가 끝난 뒤에 충전할 수 있어요' };
    amount = Math.floor(Number(amount));
    if (!(amount > 0)) return { error: '금액이 올바르지 않아요' };
    if (s.chips + amount > this.buyMax) return { error: `테이블 최대 ${fmt(this.buyMax)}까지 가질 수 있어요` };
    if (user.assets < amount) return { error: '자산이 부족해요' };
    user.assets -= amount;
    s.chips += amount;
    user.inPlay = s.chips;
    db.save();
    this.log(`${s.name} 충전 +${fmt(amount)}`);
    this.table.maybeAutoStart();
    this.emit();
    return { ok: true };
  }
  info(uid) {
    const u = db.byId(uid);
    return Object.assign(this.baseInfo(uid), {
      buyMin: this.buyMin, buyMax: this.buyMax, buyDef: this.buyDef,
      assets: u ? u.assets : 0,
    });
  }
  summary() {
    return {
      code: this.code, name: this.name, mode: this.mode, status: 'open',
      players: this.seated.length, max: this.table.max, watchers: this.spectators.size,
      blinds: `${fmt(this.table.opts.sb)}/${fmt(this.table.opts.bb)}`,
      buyIn: `${fmt(this.buyMin)}~${fmt(this.buyMax)}`,
    };
  }
  close() {
    this.table.destroy();
    for (const s of this.seated) {
      this.table.seats[this.table.seatOf(s.id)] = null;
      // 진행 중이던 판의 베팅금까지 돌려줌
      s.chips += s.total;
      this.onSeatRemoved(s);
    }
  }
}

// ===================== 토너먼트 =====================
class TourneyRoom extends BaseRoom {
  constructor(ctx, code, name, host, opts = {}) {
    super(ctx, code, name, host);
    this.mode = 'tourney';
    this.status = 'registering';
    const min = [3, 5, 7, 10].includes(Number(opts.levelMin)) ? Number(opts.levelMin) : 5;
    this.levelMs = min * 60000;
    this.startedAt = 0;
    this.entries = 0;      // 참가 + 리바이 수 (= 사용된 티켓)
    this.players = 0;      // 참가 인원
    this.prizePool = 0;
    this.results = [];
    this.entrants = new Set();
    this.pendingTimer = null;
    this.pendingUntil = 0;
    const [sb, bb] = LEVELS[0];
    this.table = new Table({
      sb, bb, dealDisconnected: true, turnMs: 25000,
      hooks: this.hooks({
        blinds: () => { const [s, b] = levelBlinds(this.level()); return { sb: s, bb: b }; },
        beforeHand: () => this.beforeHand(),
        handEnd: () => this.handEnd(),
      }),
    });
  }
  level() {
    if (this.status !== 'running') return 1;
    return Math.floor((Date.now() - this.startedAt) / this.levelMs) + 1;
  }
  rebuyOpen() { return this.status === 'running' && this.level() <= REBUY_LEVELS; }
  join(user, socketId) {
    if (this.reconnect(user, socketId)) return { ok: true };
    if (this.status !== 'registering') return { error: '이미 시작된 토너먼트예요' };
    if (this.seated.length >= this.table.max) return { error: '자리가 꽉 찼어요' };
    if (user.assets < FEE) return { error: '참가비 1억원이 필요해요' };
    const r = this.table.addPlayer(user, socketId, 0, { tStatus: 'alive', rebuys: 0, place: 0, shame: db.shameLevel(user) });
    if (r.error) return r;
    this.log(`${user.username} 님 참가 등록`);
    return { ok: true };
  }
  leave(uid) {
    const s = this.table.seat(uid);
    if (!s) return;
    if (this.status === 'running' && s.tStatus !== 'out') this.withdraw(uid);
    this.table.removePlayer(uid);
  }
  start(uid) {
    if (uid !== this.hostId) return { error: '방장만 시작할 수 있어요' };
    if (this.status !== 'registering') return { error: '이미 시작했어요' };
    if (this.seated.length < 2) return { error: '2명 이상 필요해요' };
    for (const s of this.seated) {
      const u = db.byId(s.id);
      if (!u || u.assets < FEE) {
        this.log(`${s.name} 님은 참가비가 부족해서 제외됐어요`);
        this.table.dropSeat(this.table.seatOf(s.id));
        continue;
      }
      u.assets -= FEE;
      u.tourneyHold = FEE;
      s.chips = T_STACK;
      this.entries++;
      this.players++;
      this.entrants.add(s.id);
      this.ctx.pushMe(s.id);
    }
    if (this.players < 2) {
      for (const id of this.entrants) { const u = db.byId(id); u.assets += u.tourneyHold; u.tourneyHold = 0; this.ctx.pushMe(id); }
      this.entries = 0; this.players = 0; this.entrants.clear();
      this.seated.forEach(s => { s.chips = 0; });
      db.save();
      this.emit();
      return { error: '참가비를 낼 수 있는 사람이 2명 이상 필요해요' };
    }
    this.prizePool = this.entries * FEE;
    this.startedAt = Date.now();
    this.status = 'running';
    db.save();
    this.log(`🏁 토너먼트 시작! ${this.players}명 · 상금 ${fmt(this.prizePool)}`);
    for (const s of this.seated) { const u = db.byId(s.id); if (u) this.shameChat(u); }
    this.table.running = true;
    this.table.startHand();
    return { ok: true };
  }
  alive() { return this.seated.filter(s => s.tStatus === 'alive' || s.tStatus === 'busted'); }
  canRebuy(s) {
    const u = db.byId(s.id);
    return this.rebuyOpen() && s.rebuys < REBUY_MAX && u && u.assets >= FEE;
  }
  handEnd() {
    this.shameTick();
    db.save();
    for (const s of this.seated) {
      if (s.tStatus === 'alive' && s.chips === 0) {
        if (this.canRebuy(s)) {
          s.tStatus = 'busted';
          this.log(`💥 ${s.name} 파산 — 리바이 가능 (${s.rebuys}/${REBUY_MAX})`);
        } else this.eliminate(s);
      }
    }
  }
  eliminate(s) {
    const place = this.alive().length;
    s.tStatus = 'out';
    s.place = place;
    s.chips = 0;
    this.results.push({ id: s.id, name: s.name, avatar: s.avatar, place, prize: 0 });
    this.log(`☠️ ${s.name} 탈락 (${place}위)`);
  }
  beforeHand() {
    if (this.status !== 'running') return false;
    if (!this.rebuyOpen() && !this.rebuyClosedLogged) {
      this.rebuyClosedLogged = true;
      this.log(`🔒 레벨 ${REBUY_LEVELS + 1} — 이제 리바이가 안 돼요`);
    }
    if (!this.rebuyOpen()) for (const s of this.seated) if (s.tStatus === 'busted') this.eliminate(s);
    const withChips = this.seated.filter(s => s.tStatus === 'alive' && s.chips > 0);
    const busted = this.seated.filter(s => s.tStatus === 'busted');
    if (withChips.length <= 1) {
      if (busted.length) {
        if (!this.pendingTimer) {
          this.pendingUntil = Date.now() + REBUY_WAIT_MS;
          this.log(`⏳ 리바이 대기 ${REBUY_WAIT_MS / 1000}초`);
          this.pendingTimer = setTimeout(() => {
            this.pendingTimer = null;
            this.pendingUntil = 0;
            for (const s of this.seated) if (s.tStatus === 'busted') this.eliminate(s);
            this.table.startHand();
          }, REBUY_WAIT_MS);
        }
      } else {
        this.finish();
      }
      return false;
    }
    return true;
  }
  rebuy(user) {
    const s = this.table.seat(user.id);
    if (!s || s.tStatus !== 'busted') return { error: '지금은 리바이할 수 없어요' };
    if (!this.rebuyOpen()) return { error: `레벨 ${REBUY_LEVELS + 1}부터는 리바이가 안 돼요` };
    if (s.rebuys >= REBUY_MAX) return { error: `리바이는 ${REBUY_MAX}회까지예요` };
    if (user.assets < FEE) return { error: '리바이 비용 1억원이 부족해요' };
    user.assets -= FEE;
    user.tourneyHold = (user.tourneyHold || 0) + FEE;
    s.rebuys++;
    s.chips = T_STACK;
    s.tStatus = 'alive';
    this.entries++;
    this.prizePool += FEE;
    db.save();
    this.ctx.pushMe(user.id);
    this.log(`🔁 ${s.name} 리바이 (${s.rebuys}/${REBUY_MAX}) · 상금 ${fmt(this.prizePool)}`);
    if (this.pendingTimer && !this.seated.some(x => x.tStatus === 'busted')) {
      clearTimeout(this.pendingTimer); this.pendingTimer = null; this.pendingUntil = 0;
    }
    if (this.table.stage === 'waiting' && !this.pendingTimer) this.table.startHand();
    else this.emit();
    return { ok: true };
  }
  withdraw(uid) {
    if (this.status !== 'running') return { error: '진행 중인 토너먼트가 아니에요' };
    const i = this.table.seatOf(uid);
    const s = this.table.seats[i];
    if (!s || s.tStatus === 'out') return { error: '이미 탈락했어요' };
    if (this.table.inBetting() && s.inHand && !s.folded && s.allIn) return { error: '올인 중에는 기권할 수 없어요' };
    this.log(`🏳️ ${s.name} 기권`);
    this.eliminate(s);
    if (this.table.inBetting() && s.inHand && !s.folded) this.table.foldOut(i);
    if (this.table.stage === 'waiting' && this.status === 'running') {
      if (this.pendingTimer && !this.seated.some(x => x.tStatus === 'busted')) {
        clearTimeout(this.pendingTimer); this.pendingTimer = null; this.pendingUntil = 0;
      }
      if (!this.pendingTimer) this.table.startHand();
    }
    this.emit();
    return { ok: true };
  }
  // ---------- 찹: 1대1 남았을 때 지금 가진 금액대로 상금을 나누고 끝내기 ----------
  canChop() {
    if (this.status !== 'running') return false;
    const alive = this.alive();
    return alive.length === 2 && alive.every(s => s.tStatus === 'alive') && !this.pendingTimer;
  }
  chopShares() {
    // 3위 이하 상금은 원래대로 주고, 남은 상금을 두 사람이 가진 금액 비율대로 나눔
    const two = this.alive();
    const pct = payoutPct(this.players);
    let lower = 0;
    pct.forEach((p, k) => { if (k >= 2 && this.results.some(x => x.place === k + 1)) lower += Math.floor(this.prizePool * p); });
    const rest = this.prizePool - lower;
    const stacks = two.map(s => s.chips + (this.table.inBetting() ? s.total : 0));
    const sum = stacks.reduce((a, b) => a + b, 0) || 1;
    const shares = stacks.map(x => Math.floor(rest * x / sum));
    shares[stacks[0] >= stacks[1] ? 0 : 1] += rest - shares[0] - shares[1];
    return two.map((s, i) => ({ seat: s, stack: stacks[i], prize: shares[i] }));
  }
  proposeChop(uid) {
    if (!this.canChop()) return { error: '1대1이 남았을 때만 찹할 수 있어요' };
    const s = this.table.seat(uid);
    if (!s || s.tStatus !== 'alive') return { error: '참가 중이 아니에요' };
    if (this.chop && this.chop.from !== uid && this.chop.until > Date.now()) return this.doChop();
    this.chop = { from: uid, until: Date.now() + CHOP_MS };
    this.log(`🤝 ${s.name} 님이 찹을 제안했어요 (지금 가진 금액대로 상금 나누기)`);
    clearTimeout(this.chopTimer);
    this.chopTimer = setTimeout(() => { if (this.chop) { this.chop = null; this.log('🤝 찹 제안 시간이 지났어요'); this.emit(); } }, CHOP_MS);
    this.emit();
    return { ok: true };
  }
  declineChop(uid) {
    if (!this.chop) return { ok: true };
    const s = this.table.seat(uid);
    const mine = this.chop.from === uid;
    this.chop = null;
    clearTimeout(this.chopTimer);
    this.log(`🙅 ${s ? s.name : ''} 님이 찹을 ${mine ? '취소' : '거절'}했어요`);
    this.emit();
    return { ok: true };
  }
  doChop() {
    const shares = this.chopShares();
    clearTimeout(this.chopTimer);
    this.chop = null;
    // 진행 중인 판은 없던 걸로 (낸 돈 돌려받음)
    const t = this.table;
    t.clearTimers();
    clearTimeout(t.nextHandTimer); t.nextHandTimer = null;
    for (const s of t.seats) if (s) { s.chips += t.inBetting() ? s.total : 0; s.total = 0; s.bet = 0; s.inHand = false; s.folded = true; s.hand = []; }
    t.stage = 'waiting'; t.turn = -1; t.community = [];
    this.log(`🤝 찹 성사! ${shares.map(x => `${x.seat.name} ${fmt(x.prize)}`).join(' / ')}`);
    this.finish(shares);
    return { ok: true, chopped: true };
  }

  finish(chop) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.table.running = false;
    clearTimeout(this.chopTimer);
    if (chop) {
      // 많이 가진 사람이 1위
      chop.slice().sort((a, b) => b.stack - a.stack).forEach((x, k) => {
        x.seat.tStatus = 'out';
        x.seat.place = k + 1;
        this.results.push({ id: x.seat.id, name: x.seat.name, avatar: x.seat.avatar, place: k + 1, prize: 0, chop: x.prize });
      });
      this.chopped = true;
    } else {
      const winner = this.seated.find(s => s.tStatus === 'alive');
      if (winner) {
        winner.tStatus = 'out';
        winner.place = 1;
        this.results.push({ id: winner.id, name: winner.name, avatar: winner.avatar, place: 1, prize: 0 });
      }
    }
    this.results.sort((a, b) => a.place - b.place);
    const pct = payoutPct(this.players);
    let paid = 0;
    pct.forEach((p, k) => {
      const r = this.results.find(x => x.place === k + 1);
      if (!r || r.chop != null) return;
      r.prize = Math.floor(this.prizePool * p);
      paid += r.prize;
    });
    for (const r of this.results) if (r.chop != null) { r.prize = r.chop; paid += r.chop; delete r.chop; }
    // 나머지(반올림 등)는 우승자에게
    const first = this.results.find(x => x.place === 1);
    if (first && paid < this.prizePool) first.prize += this.prizePool - paid;
    for (const r of this.results) {
      const u = db.byId(r.id);
      if (!u) continue;
      u.assets += r.prize;
      u.stats.placeSum = (u.stats.placeSum || 0) + r.place;
      if (r.place === 1) u.stats.tWins++;
    }
    for (const id of this.entrants) {
      const u = db.byId(id);
      if (!u) continue;
      u.tourneyHold = 0;
      u.stats.tPlayed++;
      this.ctx.pushMe(id);
    }
    db.save();
    this.finishedAt = Date.now();
    if (!chop) this.log(`🏆 우승: ${first ? first.name : '-'} (+${fmt(first ? first.prize : 0)})`);
    this.emit();
  }
  info(uid) {
    const s = this.table.seat(uid);
    const u = db.byId(uid);
    const lv = this.level();
    const [sb, bb] = levelBlinds(lv);
    const [nsb, nbb] = levelBlinds(lv + 1);
    const pct = payoutPct(this.players || this.seated.length);
    return Object.assign(this.baseInfo(uid), {
      status: this.status,
      level: lv,
      blinds: [sb, bb],
      nextBlinds: [nsb, nbb],
      levelEndsAt: this.startedAt + lv * this.levelMs,
      levelMs: this.levelMs,
      players: this.players,
      entries: this.entries,
      alive: this.alive().length,
      prizePool: this.status === 'registering' ? this.seated.length * FEE : this.prizePool,
      payouts: pct.map(p => Math.floor((this.status === 'registering' ? this.seated.length * FEE : this.prizePool) * p)),
      rebuyOpen: this.rebuyOpen(),
      rebuyLevels: REBUY_LEVELS,
      canChop: this.canChop() && !!(s && s.tStatus === 'alive'),
      chop: this.chop ? { mine: this.chop.from === uid, from: (this.table.seat(this.chop.from) || {}).name, until: this.chop.until } : null,
      chopPreview: this.canChop() && s ? (this.chopShares().find(x => x.seat.id === uid) || {}).prize || 0 : 0,
      chopped: !!this.chopped,
      rebuyMax: REBUY_MAX,
      myStatus: s ? s.tStatus : null,
      myRebuys: s ? s.rebuys : 0,
      canRebuy: !!(s && s.tStatus === 'busted' && this.canRebuy(s)),
      pendingUntil: this.pendingUntil,
      results: this.results,
      fee: FEE,
      assets: u ? u.assets : 0,
      startStack: T_STACK,
    });
  }
  summary() {
    return {
      code: this.code, name: this.name, mode: this.mode, status: this.status,
      players: this.seated.length, max: this.table.max, watchers: this.spectators.size,
      level: this.status === 'running' ? this.level() : 0,
      levelMin: this.levelMs / 60000,
      prize: this.status === 'registering' ? this.seated.length * FEE : this.prizePool,
    };
  }
  close() {
    this.table.destroy();
    clearTimeout(this.pendingTimer);
    if (this.status === 'running') {
      // 끝나지 않은 토너먼트가 닫히면 티켓 환불
      for (const id of this.entrants) {
        const u = db.byId(id);
        if (u) { u.assets += u.tourneyHold || 0; u.tourneyHold = 0; }
      }
      db.save();
    }
    for (const s of this.seated) {
      this.table.seats[this.table.seatOf(s.id)] = null;
      super.onSeatRemoved(s);
    }
  }
}

function fmt(n) {
  n = Math.round(n);
  if (n >= 1e8) {
    const e = Math.floor(n / 1e8), m = Math.floor((n % 1e8) / 1e4);
    return `${e}억${m ? ' ' + m.toLocaleString() + '만' : ''}원`;
  }
  if (n >= 1e4) return `${Math.floor(n / 1e4).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

module.exports = { CashRoom, TourneyRoom, CASH_TIERS, LEVELS, levelBlinds, fmt, FEE };
