'use strict';

function serializeGiveaway(giveaway) {
  const serializable = { ...giveaway };
  delete serializable.timer;
  return {
    ...serializable,
    participants: Array.from(giveaway.participants || [])
  };
}

function hydrateGiveaway(giveaway) {
  return {
    ...giveaway,
    participants: new Set(Array.isArray(giveaway.participants) ? giveaway.participants : [])
  };
}

function serializePoll(poll) {
  return {
    ...poll,
    yesVoters: Array.from(poll.yesVoters || []),
    noVoters: Array.from(poll.noVoters || [])
  };
}

function hydratePoll(poll) {
  return {
    ...poll,
    yesVoters: new Set(Array.isArray(poll.yesVoters) ? poll.yesVoters : []),
    noVoters: new Set(Array.isArray(poll.noVoters) ? poll.noVoters : [])
  };
}

module.exports = {
  hydrateGiveaway,
  hydratePoll,
  serializeGiveaway,
  serializePoll
};
