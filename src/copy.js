// Every piece of text players see, in one place so the copy can be edited
// without touching game code. {name}-style placeholders are filled in by t().

export const COPY = {
  // Home screen
  'home.tagline': 'REMEMBER RIFFS AND CHALLENGE FRIENDS',
  'home.nameLabel': 'Your name',
  'home.namePlaceholder': 'e.g. Jess',
  'home.levelLabel': 'Level',
  'home.playSolo': 'Play solo',
  'home.playFriends': 'Play against friends',
  'home.friendsDivider': 'or race friends',
  'home.createRoom': 'Create a room',
  'home.codePlaceholder': 'CODE',
  'home.join': 'Join',
  'home.testMode': 'Test mode: rooms only link tabs in this browser until Supabase is configured.',

  // Levels (picker, lobby, in-game tag)
  'level.1.name': 'Rookie',
  'level.1.blurb': '4 pads',
  'level.2.name': 'Riffer',
  'level.2.blurb': '4 pads, faster riff',
  'level.3.name': 'Shredder',
  'level.3.blurb': '8 pads, phone sideways',
  'level.4.name': 'Riff God',
  'level.4.blurb': '12 pads, phone sideways',

  // Invite link: landing page
  'invite.heading': '{name} invited you to race',
  'invite.headingNoName': "You've been invited to race",
  'invite.rules': 'Listen to the sequences, repeat them and race your friends to see who prevails.',
  'invite.join': 'Join game',
  'invite.solo': 'Play solo instead',

  // Invite link: the message and link-preview card
  'share.message': '{name} has challenged you to a round of Riff God',
  'share.fallbackName': 'A friend',
  'preview.title': '{name} has challenged you to a round of Riff God',
  'preview.titleNoName': "You've been challenged to a round of Riff God",
  'preview.description': 'Listen to the sequences, repeat them and race your friends to see who prevails.',

  // Lobby (waiting room)
  'lobby.codeLabel': 'Room code',
  'lobby.share': 'Share invite link',
  'lobby.copied': 'Link copied!',
  'lobby.players': 'Players ({count})',
  'lobby.you': '(you)',
  'lobby.host': 'Host',
  'lobby.waitingFriend': 'Waiting for a friend to join…',
  'lobby.levelShown': 'Level {level} · {name} — {blurb}',
  'lobby.hostPicking': 'The host is picking a level…',
  'lobby.start': 'Start race',
  'lobby.startLocked': 'Invite a friend to start',
  'lobby.waitingHost': 'Waiting for the host to start…',

  // Rotate prompt (levels 3–4)
  'rotate.heading': 'Rotate your phone',
  'rotate.body': 'Level {level} · {name} is played sideways — {perSide} pads on each side.',
  'rotate.hint': 'The countdown starts once you turn it.',

  // During a game
  'game.leave': '← Leave',
  'game.tagSolo': 'Solo',
  'game.tagDemo': 'Demo race',
  'game.tagRoom': 'Room {code}',
  'game.levelTag': 'Level {level} · {name}',
  'game.goalSolo': 'Clear all {rounds} rounds',
  'game.goalRace': 'First to clear round {rounds} wins',
  'game.round': 'Round {round} / {rounds}',
  'game.best': 'Best: {time}',
  'game.oops': 'oops!',
  'status.watch': 'Watch the riff…',
  'status.repeat': 'Your turn — play it back',
  'status.wrong': 'Wrong note! Try this round again',
  'status.cleared': 'Nice!',
  'status.done': 'Finished! Waiting for results…',

  // Results
  'solo.done': 'Riff mastered! 🎸',
  'solo.newBest': 'New personal best!',
  'solo.best': 'Best: {time}',
  'results.winnerLabel': 'Winner',
  'results.youWin': 'You win! 🎸',
  'results.theyWin': '{name} wins!',
  'results.rounds': '{cleared}/{rounds} rounds',
  'results.playAgain': 'Play again',
  'results.waitingRematch': 'Waiting for the host to start a rematch…',

  // Errors
  'error.needName': 'Enter your name first.',
  'error.codeLength': 'Room codes are 4 characters.',
  'error.joinFailed': "Couldn't join that room. Try again.",
  'error.serverUnreachable': "Couldn't reach the game server. Check your connection and try again.",
};

export function t(key, vars = {}) {
  const text = COPY[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}
