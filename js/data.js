/* ============================================================
   BLOXBET — STATIC DATA (non-game)
   The games list comes from /api/games now.
   ============================================================ */

const BB = {
  user: {
    name: "Noxi",
    handle: "@larpware",
    tag: "Founder",
    avatar: "N",
    balance: 0,
    level: 27,
    rank: "Diamond"
  },

  stats: [
    { label: "Total Wagered", value: 9821340, delta: "+12.4%", format: "int", neg: false },
    { label: "Active Players", value: 12483,  delta: "+3.1%",  format: "int", neg: false },
    { label: "Your Rank",      value: 27,     delta: "+2",     format: "rank", neg: false },
    { label: "Win Rate",       value: 48,     delta: "-1.2%",  format: "pct", neg: true }
  ],

  activity: [
    { user: "VoidWalker",  avatar: "V", action: "won a Coin Flip",     time: "2s ago",  result: "+1,240",  win: true  },
    { user: "404Queen",    avatar: "4", action: "cashed out on Crash", time: "14s ago", result: "+8,900",  win: true  },
    { user: "ChromeRat",   avatar: "C", action: "hit a mine",          time: "28s ago", result: "-450",    win: false },
    { user: "NeonGhost",   avatar: "N", action: "won a case battle",   time: "47s ago", result: "+3,120",  win: true  },
    { user: "ZeroCool",    avatar: "Z", action: "lost a Coin Flip",    time: "1m ago",  result: "-800",    win: false },
    { user: "SynthDaddy",  avatar: "S", action: "cashed out big",      time: "2m ago",  result: "+24,000", win: true  },
    { user: "GlassPunk",   avatar: "G", action: "hit a mine",          time: "3m ago",  result: "-1,500",  win: false },
    { user: "ByteBandit",  avatar: "B", action: "won a Coin Flip",     time: "4m ago",  result: "+620",    win: true  }
  ],

  online: [
    { name: "VoidWalker",  avatar: "V", tag: "Playing Crash",   status: "on"   },
    { name: "404Queen",    avatar: "4", tag: "In Lobby",        status: "on"   },
    { name: "ChromeRat",   avatar: "C", tag: "Playing Mines",   status: "on"   },
    { name: "NeonGhost",   avatar: "N", tag: "Idle",            status: "away" },
    { name: "ZeroCool",    avatar: "Z", tag: "Case Battles",    status: "on"   },
    { name: "SynthDaddy",  avatar: "S", tag: "In Community",    status: "on"   }
  ],

  announcements: [
    { icon: "sparkle", title: "Season 3 begins",        text: "New games, new rewards, same old regret. Jump in.",       time: "2h ago" },
    { icon: "wrench",  title: "Maintenance complete",   text: "Servers are stable. The house is back in business.",       time: "6h ago" },
    { icon: "trophy",  title: "Weekly leaderboard",     text: "Top 10 players split a 50,000 BLOX pool. Good luck.",      time: "1d ago" }
  ],

  leaderboard: [
    { rank: 1, name: "SynthDaddy", avatar: "S", score: 128400, delta: "+8.2%",  win: true  },
    { rank: 2, name: "404Queen",   avatar: "4", score: 94210,  delta: "+4.1%",  win: true  },
    { rank: 3, name: "VoidWalker", avatar: "V", score: 61880,  delta: "+2.7%",  win: true  },
    { rank: 4, name: "ChromeRat",  avatar: "C", score: 22145,  delta: "-1.4%",  win: false },
    { rank: 5, name: "GlassPunk",  avatar: "G", score: 8900,   delta: "-3.2%",  win: false },
    { rank: 6, name: "NeonGhost",  avatar: "N", score: 7420,   delta: "+0.9%",  win: true  },
    { rank: 7, name: "ZeroCool",   avatar: "Z", score: 5310,   delta: "-0.6%",  win: false }
  ]
};