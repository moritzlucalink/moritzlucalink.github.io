(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BG = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var WHITE = 0, BLACK = 1;

  function otherPlayer(p) { return 1 - p; }

  function initialState() {
    var pts = new Array(24).fill(0);
    pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
    pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
    return { points: pts, bar: [0, 0], off: [0, 0], turn: WHITE };
  }

  function cloneState(s) {
    return { points: s.points.slice(), bar: s.bar.slice(), off: s.off.slice(), turn: s.turn };
  }

  function sign(p) { return p === WHITE ? 1 : -1; }
  function own(s, i, p) { return s.points[i] * sign(p); } // own checker count (negative if opp)

  function applyMove(state, move) {
    var s = cloneState(state), p = state.turn, sg = sign(p), opp = 1 - p;
    if (move.from === 'bar') s.bar[p]--;
    else s.points[move.from] -= sg;
    if (move.to === 'off') s.off[p]++;
    else {
      if (s.points[move.to] === -sg) { s.points[move.to] = 0; s.bar[opp]++; }
      s.points[move.to] += sg;
    }
    return s;
  }

  function endTurn(state) {
    var s = cloneState(state); s.turn = 1 - state.turn; return s;
  }

  function allHome(s, p) {
    if (s.bar[p] > 0) return false;
    for (var i = 0; i < 24; i++) {
      if (own(s, i, p) > 0) {
        if (p === WHITE ? i > 5 : i < 18) return false;
      }
    }
    return true;
  }

  function movesForDie(s, die) {
    var p = s.turn, out = [], i, to;
    if (s.bar[p] > 0) {
      to = p === WHITE ? 24 - die : die - 1;
      if (own(s, to, p) >= -1) out.push({ from: 'bar', to: to, die: die });
      return out;
    }
    var home = allHome(s, p);
    for (i = 0; i < 24; i++) {
      if (own(s, i, p) <= 0) continue;
      to = p === WHITE ? i - die : i + die;
      if (to >= 0 && to <= 23) {
        if (own(s, to, p) >= -1) out.push({ from: i, to: to, die: die });
      } else if (home) {
        var exact = p === WHITE ? to === -1 : to === 24;
        var ok = exact;
        if (!ok) {
          ok = true;
          for (var j = 0; j < 24; j++) {
            if (own(s, j, p) > 0 && (p === WHITE ? j > i : j < i)) { ok = false; break; }
          }
        }
        if (ok) out.push({ from: i, to: 'off', die: die });
      }
    }
    return out;
  }

  function legalSequences(state, dice) {
    var a = dice[0], b = dice[1];
    var orders = a === b ? [[a, a, a, a]] : [[a, b], [b, a]];
    var results = [], maxLen = 0;
    function dfs(s, order, k, seq) {
      if (seq.length > maxLen) maxLen = seq.length;
      if (k === order.length) { results.push(seq); return; }
      var ms = movesForDie(s, order[k]);
      if (!ms.length) { results.push(seq); return; }
      for (var m = 0; m < ms.length; m++) {
        dfs(applyMove(s, ms[m]), order, k + 1, seq.concat([ms[m]]));
      }
    }
    orders.forEach(function (o) { dfs(state, o, 0, []); });
    var res = results.filter(function (q) { return q.length === maxLen; });
    if (maxLen === 1 && a !== b) {
      var big = Math.max(a, b);
      var bigOnes = res.filter(function (q) { return q[0].die === big; });
      if (bigOnes.length) res = bigOnes;
    }
    if (maxLen === 0) return [[]];
    return res;
  }

  function sameMove(x, y) { return x.from === y.from && x.to === y.to && x.die === y.die; }

  function nextMoves(state, dice, played) {
    var seqs = legalSequences(state, dice), out = [];
    seqs.forEach(function (q) {
      if (q.length <= played.length) return;
      for (var i = 0; i < played.length; i++) if (!sameMove(q[i], played[i])) return;
      var m = q[played.length];
      if (!out.some(function (o) { return sameMove(o, m); })) out.push(m);
    });
    return out;
  }

  function winner(state) {
    for (var p = 0; p < 2; p++) {
      if (state.off[p] === 15) {
        var l = 1 - p, kind = 1;
        if (state.off[l] === 0) {
          kind = 2;
          var bad = state.bar[l] > 0;
          for (var i = 0; i < 24 && !bad; i++) {
            if (own(state, i, l) > 0 && (p === WHITE ? i <= 5 : i >= 18)) bad = true;
          }
          if (bad) kind = 3;
        }
        return { player: p, kind: kind };
      }
    }
    return null;
  }

  function pipCount(state, player) {
    var n = state.bar[player] * 25;
    for (var i = 0; i < 24; i++) {
      var c = own(state, i, player);
      if (c > 0) n += c * (player === WHITE ? i + 1 : 24 - i);
    }
    return n;
  }

  function rollDie(rng) {
    rng = rng || Math.random;
    return 1 + Math.floor(rng() * 6);
  }

  return {
    WHITE: WHITE, BLACK: BLACK,
    initialState: initialState, applyMove: applyMove, endTurn: endTurn,
    legalSequences: legalSequences, nextMoves: nextMoves, winner: winner,
    pipCount: pipCount, rollDie: rollDie, otherPlayer: otherPlayer
  };
});
