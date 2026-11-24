/* Backgammon bots. Every bot has the same interface:
 *   bot.name                      short id, e.g. 'random'
 *   bot.chooseMove(state, dice)   returns one sequence from BG.legalSequences(state, dice)
 * Bots never change the state they're given. Works in the browser (needs window.BG
 * from engine.js) and in Node (requires ./engine.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.BGBots = factory(root.BG);
})(typeof window !== 'undefined' ? window : this, function (BG) {
  'use strict';

  function positionKey(s) {
    return s.points.join(',') + '|' + s.bar[0] + ',' + s.bar[1] + '|' + s.off[0] + ',' + s.off[1];
  }

  // All distinct end positions reachable this turn, each with one sequence that reaches it.
  // Many sequences lead to the same position (e.g. 3-1 vs 1-3); bots should judge positions.
  // With `played`, only sequences that start with those moves count (for suggestions mid-turn).
  function outcomes(state, dice, played) {
    var seen = {}, out = [];
    BG.legalSequences(state, dice).forEach(function (seq) {
      if (played && played.length && !startsWith(seq, played)) return;
      var s = state;
      for (var i = 0; i < seq.length; i++) s = BG.applyMove(s, seq[i]);
      var k = positionKey(s);
      if (!seen[k]) { seen[k] = true; out.push({ seq: seq, state: s }); }
    });
    return out;
  }

  function startsWith(seq, played) {
    if (seq.length < played.length) return false;
    for (var i = 0; i < played.length; i++) {
      var a = seq[i], b = played[i];
      if (a.from !== b.from || a.to !== b.to || a.die !== b.die) return false;
    }
    return true;
  }

  // Picks uniformly among distinct end positions. The weakest possible baseline.
  function randomBot(rng) {
    rng = rng || Math.random;
    return {
      name: 'random',
      chooseMove: function (state, dice) {
        var o = outcomes(state, dice);
        return o[Math.floor(rng() * o.length)].seq;
      }
    };
  }

  // ---------- Shared helpers: the board from one player's point of view ----------
  // my[k] / op[k] = checkers of the player to move / of the opponent on the mover's point k (1..24).
  // The mover moves from 24 down to 1 and bears off below 1; the opponent moves up from 0 (its bar)
  // to 24, so the opponent's home board is the mover's points 19..24.
  function view(s, p) {
    var my = new Array(26).fill(0), op = new Array(26).fill(0);
    for (var k = 1; k <= 24; k++) {
      var c = p === BG.WHITE ? s.points[k - 1] : -s.points[24 - k];
      if (c > 0) my[k] = c; else if (c < 0) op[k] = -c;
    }
    return { my: my, op: op, myBar: s.bar[p], opBar: s.bar[1 - p], myOff: s.off[p], opOff: s.off[1 - p] };
  }

  // A pure race: nobody on the bar and every checker of mine is past every opposing checker.
  function isRace(v) {
    if (v.myBar || v.opBar) return false;
    var maxMy = 0, minOp = 25;
    for (var k = 1; k <= 24; k++) {
      if (v.my[k] && k > maxMy) maxMy = k;
      if (v.op[k] && k < minOp) minOp = k;
    }
    return maxMy < minOp;
  }

  // Scores every distinct end position with evalFn(view after move, startedAsRace) and returns the
  // full sequence of the best. `played` restricts it to sequences that start with those moves.
  function bestOutcome(state, dice, evalFn, played) {
    var p = state.turn, o = outcomes(state, dice, played);
    if (!o.length) return null;
    if (o.length === 1) return o[0].seq;
    var race = isRace(view(state, p)), best = o[0], bestScore = -Infinity;
    for (var i = 0; i < o.length; i++) {
      var sc = evalFn(view(o[i].state, p), race);
      if (sc > bestScore) { bestScore = sc; best = o[i]; }
    }
    return best.seq;
  }

  // ---------- pubeval: Gerry Tesauro's public benchmark evaluator (1993) ----------
  // A linear function of a raw board encoding, with separate race and contact weights.
  // Weights copied verbatim from pubeval.c (Tesauro's posting to rec.games.backgammon, Feb 1993).
  var PUB_WR = [0.00000,-0.17160,0.27010,0.29906,-0.08471,0.00000,-1.40375,-1.05121,0.07217,-0.01351,0.00000,-1.29506,-2.16183,0.13246,-1.03508,0.00000,-2.29847,-2.34631,0.17253,0.08302,0.00000,-1.27266,-2.87401,-0.07456,-0.34240,0.00000,-1.34640,-2.46556,-0.13022,-0.01591,0.00000,0.27448,0.60015,0.48302,0.25236,0.00000,0.39521,0.68178,0.05281,0.09266,0.00000,0.24855,-0.06844,-0.37646,0.05685,0.00000,0.17405,0.00430,0.74427,0.00576,0.00000,0.12392,0.31202,-0.91035,-0.16270,0.00000,0.01418,-0.10839,-0.02781,-0.88035,0.00000,1.07274,2.00366,1.16242,0.22520,0.00000,0.85631,1.06349,1.49549,0.18966,0.00000,0.37183,-0.50352,-0.14818,0.12039,0.00000,0.13681,0.13978,1.11245,-0.12707,0.00000,-0.22082,0.20178,-0.06285,-0.52728,0.00000,-0.13597,-0.19412,-0.09308,-1.26062,0.00000,3.05454,5.16874,1.50680,5.35000,0.00000,2.19605,3.85390,0.88296,2.30052,0.00000,0.92321,1.08744,-0.11696,-0.78560,0.00000,-0.09795,-0.83050,-1.09167,-4.94251,0.00000,-1.00316,-3.66465,-2.56906,-9.67677,0.00000,-2.77982,-7.26713,-3.40177,-12.32252,0.00000,3.42040];
  var PUB_WC = [0.25696,-0.66937,-1.66135,-2.02487,-2.53398,-0.16092,-1.11725,-1.06654,-0.92830,-1.99558,-1.10388,-0.80802,0.09856,-0.62086,-1.27999,-0.59220,-0.73667,0.89032,-0.38933,-1.59847,-1.50197,-0.60966,1.56166,-0.47389,-1.80390,-0.83425,-0.97741,-1.41371,0.24500,0.10970,-1.36476,-1.05572,1.15420,0.11069,-0.38319,-0.74816,-0.59244,0.81116,-0.39511,0.11424,-0.73169,-0.56074,1.09792,0.15977,0.13786,-1.18435,-0.43363,1.06169,-0.21329,0.04798,-0.94373,-0.22982,1.22737,-0.13099,-0.06295,-0.75882,-0.13658,1.78389,0.30416,0.36797,-0.69851,0.13003,1.23070,0.40868,-0.21081,-0.64073,0.31061,1.59554,0.65718,0.25429,-0.80789,0.08240,1.78964,0.54304,0.41174,-1.06161,0.07851,2.01451,0.49786,0.91936,-0.90750,0.05941,1.83120,0.58722,1.28777,-0.83711,-0.33248,2.64983,0.52698,0.82132,-0.58897,-1.18223,3.35809,0.62017,0.57353,-0.07276,-0.36214,4.37655,0.45481,0.21746,0.10504,-0.61977,3.54001,0.04612,-0.18108,0.63211,-0.87046,2.47673,-0.48016,-1.27157,0.86505,-1.11342,1.24612,-0.82385,-2.77082,1.23606,-1.59529,0.10438,-1.30206,-4.11520,5.62596,-2.75800];

  // Same as pubeval(race, pos) in the C code, where pos[k] = my[k] - op[k] (k = 1..24),
  // pos[0] = -(opponent on bar), pos[26] = my checkers off. Like the original, the race flag
  // comes from the position BEFORE the move.
  function pubevalScore(v, race) {
    if (v.myOff === 15) return 99999999;
    var w = race ? PUB_WR : PUB_WC, s = 0;
    for (var j = 1; j <= 24; j++) {
      var k = 25 - j, n = v.my[k] - v.op[k], b = 5 * (j - 1);
      if (n === -1) s += w[b];
      if (n === 1) s += w[b + 1];
      if (n >= 2) s += w[b + 2];
      if (n === 3) s += w[b + 3];
      if (n >= 4) s += w[b + 4] * (n - 3) / 2;
    }
    return s + w[120] * v.opBar / 2 + w[121] * v.myOff / 15;
  }

  // Every evaluating bot also offers suggest(turnStart, dice, played): the moves it would play to
  // finish the turn, given the moves already played (used for the in-game help). Null if none fit.
  function evalBot(name, evalFn) {
    return {
      name: name,
      chooseMove: function (state, dice) { return bestOutcome(state, dice, evalFn); },
      suggest: function (state, dice, played) {
        played = played || [];
        var seq = bestOutcome(state, dice, evalFn, played);
        return seq ? seq.slice(played.length) : null;
      }
    };
  }

  function pubevalBot() { return evalBot('pubeval', pubevalScore); }

  // ---------- heuristic: hand-weighted position features, in pip-equivalent units ----------
  function pips(v) {
    var m = v.myBar * 25, o = v.opBar * 25;
    for (var k = 1; k <= 24; k++) { m += v.my[k] * k; o += v.op[k] * (25 - k); }
    return { my: m, op: o };
  }

  // Whether the opponent can hit my blot on point p with the roll (a, b). Opponent checkers move up;
  // my made points (2+) block landing and intermediate stops. Bar rules are approximated: with one
  // opponent checker on the bar, other checkers only get direct single-die shots; with two or more,
  // only entering checkers can hit.
  function canHit(v, p, a, b) {
    var blocked = function (k) { return k >= 1 && k <= 24 && v.my[k] >= 2; };
    for (var q = 0; q < p; q++) {
      if (q === 0 ? !v.opBar : !v.op[q]) continue;
      if (q > 0 && v.opBar >= 2) continue;
      var d = p - q;
      if (q > 0 && v.opBar === 1) { if (d === a || d === b) return true; continue; }
      if (a !== b) {
        if (d === a || d === b) return true;
        if (d === a + b && (!blocked(q + a) || !blocked(q + b))) return true;
      } else {
        for (var n = 1, at = q; n <= 4; n++) {
          at += a;
          if (at === p) return true;
          if (at > p || blocked(at)) break;
        }
      }
    }
    return false;
  }

  // Expected cost of my blots being hit on the opponent's next roll, averaged over all 36 rolls.
  // A hit costs the pips that blot had travelled, plus tempo, plus more when the opponent's
  // home board (my points 19..24) is hard to enter.
  function blotRisk(v) {
    var blots = [], k;
    for (k = 1; k <= 24; k++) if (v.my[k] === 1) blots.push(k);
    if (v.myBar) blots.push(25); // can't happen after a legal full move, but stay safe
    if (!blots.length) return { loss: 0, shots: 0 };
    var oppBoard = 0;
    for (k = 19; k <= 24; k++) if (v.op[k] >= 2) oppBoard++;
    var loss = 0, shots = 0;
    for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) {
      var worst = 0;
      for (var i = 0; i < blots.length; i++) {
        var p = blots[i];
        if (p <= 24 && canHit(v, p, a, b)) worst = Math.max(worst, (25 - p) + 4 + 2 * oppBoard);
      }
      if (worst) { loss += worst; shots++; }
    }
    return { loss: loss / 36, shots: shots };
  }

  // Value of owning a made point, by my point number. Home board and bar point build primes and
  // close the board; 18..21 are the best anchors in the opponent's home board.
  var POINT_VALUE = [0,
    0.3, 0.6, 0.9, 1.2, 1.5, 1.3,   // 1..6   home board
    1.1, 0.7, 0.4, 0.3, 0.2, 0.2,   // 7..12  outer board (7 = bar point)
    0.2, 0.2, 0.2, 0.2, 0.2, 0.6,   // 13..18
    0.5, 0.9, 1.0, 0.6, 0.3, 0.3];  // 19..24 anchors (20 and 21 = opponent's 5- and 4-point)
  var PRIME_VALUE = [0, 0, 0.5, 1.5, 3, 5, 8];
  // Penalty for one of my checkers by how many of the 6 points in front of it the opponent holds.
  var TRAP_VALUE = [0, 0, 0.3, 1, 2.5, 5, 9];

  // How stuck my checkers are behind opposing points. Only checkers that still have to pass
  // opposing checkers can be trapped. The bar counts as point 25.
  function trapped(v) {
    var minOp = 25, k, total = 0;
    for (k = 1; k <= 24; k++) if (v.op[k]) { minOp = k; break; }
    for (var p = 25; p > minOp; p--) {
      var n = p === 25 ? v.myBar : v.my[p];
      if (!n) continue;
      var blocked = 0;
      for (k = p - 1; k >= Math.max(1, p - 6); k--) if (v.op[k] >= 2) blocked++;
      total += n * TRAP_VALUE[blocked];
    }
    return total;
  }

  // Gammon / backgammon danger: my checkers still in the opponent's home board (or on the bar)
  // while the opponent gets close to bearing off.
  function lateBack(v, opPips) {
    var back = v.myBar;
    for (var k = 19; k <= 24; k++) back += v.my[k];
    return back * Math.max(0, Math.min(2, (110 - opPips) / 40));
  }

  // Tuned 2026-11-24 with Backgammon/bot/tune.js against pubeval: point 4 -> 2, then trap 1 -> 0
  // (the trap term made it worse; kept in the code for later experiments).
  var DEFAULT_WEIGHTS = { pip: 1, risk: 1, point: 2, prime: 2, barBoard: 1.5, stack: 1, raceOff: 3, raceOutside: 1,
    trap: 0, late: 3 };

  function heuristicScore(v, race, W) {
    var pc = pips(v), k;
    if (race) {
      // No contact: get home and off fast, without wasting pips.
      var outside = 0;
      for (k = 7; k <= 24; k++) outside += v.my[k];
      return -pc.my + W.raceOff * v.myOff - W.raceOutside * outside;
    }
    var score = W.pip * (pc.op - pc.my);
    var points = 0, homeMade = 0, stack = 0;
    for (k = 1; k <= 24; k++) {
      if (v.my[k] >= 2) { points += POINT_VALUE[k]; if (k <= 6) homeMade++; }
      if (v.my[k] > 3) stack += v.my[k] - 3;
    }
    // Primes only matter while opposing checkers are still behind them.
    var prime = 0, minOp = v.opBar ? 0 : 25;
    for (k = 1; k <= 24; k++) if (v.op[k]) { minOp = Math.min(minOp, k); break; }
    for (k = 1; k <= 24; ) {
      if (v.my[k] < 2) { k++; continue; }
      var lo = k; while (k <= 24 && v.my[k] >= 2) k++;
      if (minOp < lo) prime += PRIME_VALUE[Math.min(6, k - lo)];
    }
    score += W.point * points + W.prime * prime + W.barBoard * v.opBar * homeMade - W.stack * stack;
    score -= W.risk * blotRisk(v).loss;
    score -= W.trap * trapped(v) + W.late * lateBack(v, pc.op);
    return score;
  }

  function heuristicBot(rng, weights) {
    var W = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
    return evalBot('heuristic', function (v, race) { return heuristicScore(v, race, W); });
  }

  var factories = { random: randomBot, heuristic: heuristicBot, pubeval: pubevalBot };

  function create(name, rng) {
    if (!factories[name]) throw new Error('Unknown bot: ' + name + ' (known: ' + Object.keys(factories).join(', ') + ')');
    return factories[name](rng);
  }

  return {
    outcomes: outcomes, positionKey: positionKey, create: create, names: Object.keys(factories),
    randomBot: randomBot, heuristicBot: heuristicBot, pubevalBot: pubevalBot,
    // exposed for tests and tuning
    view: view, isRace: isRace, pubevalScore: pubevalScore, heuristicScore: heuristicScore,
    blotRisk: blotRisk, canHit: canHit, trapped: trapped, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS
  };
});
