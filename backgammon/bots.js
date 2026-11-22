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
  function outcomes(state, dice) {
    var seen = {}, out = [];
    BG.legalSequences(state, dice).forEach(function (seq) {
      var s = state;
      for (var i = 0; i < seq.length; i++) s = BG.applyMove(s, seq[i]);
      var k = positionKey(s);
      if (!seen[k]) { seen[k] = true; out.push({ seq: seq, state: s }); }
    });
    return out;
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

  var factories = { random: randomBot };

  function create(name, rng) {
    if (!factories[name]) throw new Error('Unknown bot: ' + name + ' (known: ' + Object.keys(factories).join(', ') + ')');
    return factories[name](rng);
  }

  return { outcomes: outcomes, positionKey: positionKey, randomBot: randomBot, create: create, names: Object.keys(factories) };
});
