// backend/src/utils/gameLogic.js
// Multi-sport support: NFL and NBA
// NFL: Original complex board with special wildcard rules
// NBA: Simpler board - each column is one position, wildcards match column
//
// UPDATED: board generation now enforces SINGLE-APPEARANCE — a given player
// (name+team) can occupy at most one cell per board. Vote weighting unchanged
// (Fire Sale = 3x, Cool Down = 0.1x). The Kingpin bonus is deprecated/inactive.

// ============================================================
// NFL CONFIGURATION - WEEK 1 2026 SEASON
// All 32 teams play (no byes in Week 1)
// Wed 9/9: NE@SEA
// Thu 9/10: SF@LAR (Melbourne, Australia)
// Sun 9/13: ATL@PIT, BAL@IND, BUF@HOU, CHI@CAR, CLE@JAX, NO@DET,
//           NYJ@TEN, TB@CIN, ARI@LAC, GB@MIN, MIA@LV, WAS@PHI, DAL@NYG
// Mon 9/14: DEN@KC
// ============================================================

const NFL_MATCHUPS = {
  // Wednesday Kickoff - Super Bowl rematch
  NE:  { opp: 'SEA', home: false },
  SEA: { opp: 'NE',  home: true  },
  // Thursday Australia game
  SF:  { opp: 'LAR', home: false },
  LAR: { opp: 'SF',  home: true  },
  // Sunday 1pm
  ATL: { opp: 'PIT', home: false },
  PIT: { opp: 'ATL', home: true  },
  BAL: { opp: 'IND', home: false },
  IND: { opp: 'BAL', home: true  },
  BUF: { opp: 'HOU', home: false },
  HOU: { opp: 'BUF', home: true  },
  CHI: { opp: 'CAR', home: false },
  CAR: { opp: 'CHI', home: true  },
  CLE: { opp: 'JAX', home: false },
  JAX: { opp: 'CLE', home: true  },
  NO:  { opp: 'DET', home: false },
  DET: { opp: 'NO',  home: true  },
  NYJ: { opp: 'TEN', home: false },
  TEN: { opp: 'NYJ', home: true  },
  TB:  { opp: 'CIN', home: false },
  CIN: { opp: 'TB',  home: true  },
  // Sunday 4pm
  ARI: { opp: 'LAC', home: false },
  LAC: { opp: 'ARI', home: true  },
  GB:  { opp: 'MIN', home: false },
  MIN: { opp: 'GB',  home: true  },
  MIA: { opp: 'LV',  home: false },
  LV:  { opp: 'MIA', home: true  },
  WAS: { opp: 'PHI', home: false },
  PHI: { opp: 'WAS', home: true  },
  // Sunday Night
  DAL: { opp: 'NYG', home: false },
  NYG: { opp: 'DAL', home: true  },
  // Monday Night
  DEN: { opp: 'KC',  home: false },
  KC:  { opp: 'DEN', home: true  },
};

// ============================================================
// NFL PLAYER POOLS - WEEK 1 2026
// Pricing derived from Underdog Best Ball ADP (as of May 17, 2026)
// Top 240 players included
// ============================================================

const NFL_PLAYER_POOLS = {
  QB: {
    // $5: Elite tier (ADP 30-70, QB1-QB6)
    5: [
      {name: 'Josh Allen',      team: 'BUF'},  // QB1  | ADP 30.2
      {name: 'Lamar Jackson',   team: 'BAL'},  // QB2  | ADP 54.3
      {name: 'Joe Burrow',      team: 'CIN'},  // QB3  | ADP 63.5
      {name: 'Jayden Daniels',  team: 'WAS'},  // QB4  | ADP 65.6
      {name: 'Jalen Hurts',     team: 'PHI'},  // QB5  | ADP 69.1
      {name: 'Caleb Williams',  team: 'CHI'},  // QB6  | ADP 70.3
    ],
    // $4: High-end starters (ADP 70-100, QB7-QB13)
    4: [
      {name: 'Drake Maye',       team: 'NE'},  // QB7  | ADP 70.9
      {name: 'Dak Prescott',     team: 'DAL'}, // QB8  | ADP 78.1
      {name: 'Justin Herbert',   team: 'LAC'}, // QB9  | ADP 83.7
      {name: 'Trevor Lawrence',  team: 'JAX'}, // QB10 | ADP 86.4
      {name: 'Jaxson Dart',      team: 'NYG'}, // QB11 | ADP 90.7
      {name: 'Patrick Mahomes',  team: 'KC'},  // QB12 | ADP 92.2
      {name: 'Brock Purdy',      team: 'SF'},  // QB13 | ADP 97.4
    ],
    // $3: Solid mid-tier starters (ADP 100-120, QB14-QB20)
    3: [
      {name: 'Bo Nix',           team: 'DEN'}, // QB14 | ADP 100.6
      {name: 'Matthew Stafford', team: 'LAR'}, // QB15 | ADP 103.9
      {name: 'Jared Goff',       team: 'DET'}, // QB16 | ADP 104.4
      {name: 'Kyler Murray',     team: 'MIN'}, // QB17 | ADP 106.3
      {name: 'Jordan Love',      team: 'GB'},  // QB18 | ADP 107.8
      {name: 'Tyler Shough',     team: 'NO'},  // QB19 | ADP 112.5
      {name: 'Baker Mayfield',   team: 'TB'},  // QB20 | ADP 115.7
    ],
    // $2: Lower-tier starters & rookies (ADP 130-160, QB21-QB26)
    2: [
      {name: 'Malik Willis',     team: 'MIA'}, // QB21 | ADP 131.7
      {name: 'Sam Darnold',      team: 'SEA'}, // QB22 | ADP 137.4
      {name: 'Cam Ward',         team: 'TEN'}, // QB23 | ADP 138.4
      {name: 'C.J. Stroud',      team: 'HOU'}, // QB24 | ADP 141.4
      {name: 'Daniel Jones',     team: 'IND'}, // QB25 | ADP 146.2
      {name: 'Bryce Young',      team: 'CAR'}, // QB26 | ADP 153.9
    ],
    // $1: Deep/rookies/backups (ADP 165+, QB27+)
    1: [
      {name: 'Fernando Mendoza', team: 'LV'},  // QB27 | ADP 167.2 (#1 overall pick)
      {name: 'Jacoby Brissett',  team: 'ARI'}, // QB28 | ADP 177.8
      {name: 'Geno Smith',       team: 'NYJ'}, // QB29 | ADP 178.9
      {name: 'Aaron Rodgers',    team: 'PIT'}, // QB30 | ADP 187.5
      {name: 'Tua Tagovailoa',   team: 'ATL'}, // QB31 | ADP 208.4
      {name: 'Deshaun Watson',   team: 'CLE'}, // QB32 | ADP 213.0
      {name: 'Michael Penix',    team: 'ATL'}, // QB33 | ADP 213.3
      {name: 'Shedeur Sanders',  team: 'CLE'}, // QB34 | ADP 214.6
    ]
  },
  RB: {
    // $5: Workhorse RB1s (RB1-RB8)
    5: [
      {name: 'Bijan Robinson',       team: 'ATL'}, // RB1  | ADP 1.5
      {name: 'Jahmyr Gibbs',         team: 'DET'}, // RB2  | ADP 1.6
      {name: 'Jonathan Taylor',      team: 'IND'}, // RB3  | ADP 6.8
      {name: 'Christian McCaffrey',  team: 'SF'},  // RB4  | ADP 7.2
      {name: 'James Cook',           team: 'BUF'}, // RB5  | ADP 11.0
      {name: 'Ashton Jeanty',        team: 'LV'},  // RB6  | ADP 12.0
      {name: "De'Von Achane",        team: 'MIA'}, // RB7  | ADP 13.6
      {name: 'Saquon Barkley',       team: 'PHI'}, // RB8  | ADP 14.4
    ],
    // $4: Strong RB2 / borderline RB1 (RB9-RB18)
    4: [
      {name: 'Kenneth Walker III', team: 'KC'},  // RB9  | ADP 15.9
      {name: 'Omarion Hampton',    team: 'LAC'}, // RB10 | ADP 16.1
      {name: 'Derrick Henry',      team: 'BAL'}, // RB11 | ADP 17.4
      {name: 'Chase Brown',        team: 'CIN'}, // RB12 | ADP 18.3
      {name: 'Jeremiyah Love',     team: 'ARI'}, // RB13 | ADP 22.9 (rookie #3 overall)
      {name: 'Josh Jacobs',        team: 'GB'},  // RB14 | ADP 26.5
      {name: 'Breece Hall',        team: 'NYJ'}, // RB15 | ADP 30.3
      {name: 'Travis Etienne Jr.', team: 'NO'},  // RB16 | ADP 31.2
      {name: 'Kyren Williams',     team: 'LAR'}, // RB17 | ADP 34.2
      {name: 'Javonte Williams',   team: 'DAL'}, // RB18 | ADP 36.6
    ],
    // $3: Solid starters / strong handcuffs (RB19-RB33)
    3: [
      {name: 'Bucky Irving',        team: 'TB'},  // RB19 | ADP 45.0
      {name: 'Cam Skattebo',        team: 'NYG'}, // RB20 | ADP 46.8
      {name: 'TreVeyon Henderson',  team: 'NE'},  // RB21 | ADP 47.3
      {name: 'David Montgomery',    team: 'HOU'}, // RB22 | ADP 49.2
      {name: "D'Andre Swift",       team: 'CHI'}, // RB23 | ADP 53.6
      {name: 'Quinshon Judkins',    team: 'CLE'}, // RB24 | ADP 56.0
      {name: 'Jadarian Price',      team: 'SEA'}, // RB25 | ADP 58.2 (rookie R1)
      {name: 'Bhayshul Tuten',      team: 'JAX'}, // RB26 | ADP 60.7
      {name: 'Chuba Hubbard',       team: 'CAR'}, // RB27 | ADP 68.6
      {name: 'Rhamondre Stevenson', team: 'NE'},  // RB28 | ADP 74.9
      {name: 'Tony Pollard',        team: 'TEN'}, // RB29 | ADP 76.9
      {name: 'Jaylen Warren',       team: 'PIT'}, // RB30 | ADP 80.7
      {name: 'RJ Harvey',           team: 'DEN'}, // RB31 | ADP 84.4
      {name: 'Kyle Monangai',       team: 'CHI'}, // RB32 | ADP 90.0
      {name: 'Rico Dowdle',         team: 'PIT'}, // RB33 | ADP 90.5
    ],
    // $2: Committee backs & lottery tickets (RB34-RB48)
    2: [
      {name: 'Blake Corum',             team: 'LAR'}, // RB34 | ADP 96.4
      {name: 'J.K. Dobbins',            team: 'DEN'}, // RB35 | ADP 103.3
      {name: 'Chris Rodriguez Jr.',     team: 'JAX'}, // RB36 | ADP 110.9
      {name: 'Jacory Croskey-Merritt',  team: 'WAS'}, // RB37 | ADP 114.1
      {name: 'Kenneth Gainwell',        team: 'TB'},  // RB38 | ADP 117.6
      {name: 'Aaron Jones Sr.',         team: 'MIN'}, // RB39 | ADP 120.0
      {name: 'Jordan Mason',            team: 'MIN'}, // RB40 | ADP 121.9
      {name: 'Rachaad White',           team: 'WAS'}, // RB41 | ADP 122.9
      {name: 'Jonathon Brooks',         team: 'CAR'}, // RB42 | ADP 124.8
      {name: 'Tyrone Tracy Jr.',        team: 'NYG'}, // RB43 | ADP 130.3
      {name: 'Jonah Coleman',           team: 'DEN'}, // RB44 | ADP 141.8
      {name: 'Keaton Mitchell',         team: 'LAC'}, // RB45 | ADP 145.0
      {name: 'Woody Marks',             team: 'HOU'}, // RB46 | ADP 149.0
      {name: 'Isiah Pacheco',           team: 'DET'}, // RB47 | ADP 150.6
      {name: 'Zach Charbonnet',         team: 'SEA'}, // RB48 | ADP 157.8
    ],
    // $1: Deep bench / backups / late-round dart throws (RB49+)
    1: [
      {name: 'Tyler Allgeier',     team: 'ARI'}, // RB49 | ADP 159.2
      {name: 'Tyjae Spears',       team: 'TEN'}, // RB50 | ADP 162.8
      {name: 'Brian Robinson Jr.', team: 'ATL'}, // RB51 | ADP 165.4
      {name: 'Dylan Sampson',      team: 'CLE'}, // RB52 | ADP 167.6
      {name: 'Nicholas Singleton', team: 'TEN'}, // RB53 | ADP 173.9
      {name: 'Tank Bigsby',        team: 'PHI'}, // RB54 | ADP 178.4
      {name: 'Alvin Kamara',       team: 'NO'},  // RB55 | ADP 181.2
      {name: 'Emmett Johnson',     team: 'KC'},  // RB56 | ADP 183.0
      {name: 'Mike Washington',    team: 'LV'},  // RB57 | ADP 184.2
      {name: 'Kaytron Allen',      team: 'WAS'}, // RB58 | ADP 189.7
      {name: 'Emanuel Wilson',     team: 'SEA'}, // RB59 | ADP 192.4
      {name: 'Sean Tucker',        team: 'TB'},  // RB60 | ADP 200.1
      {name: 'Braelon Allen',      team: 'NYJ'}, // RB61 | ADP 200.7
      {name: 'Ray Davis',          team: 'BUF'}, // RB62 | ADP 203.1
      {name: 'Kaelon Black',       team: 'SF'},  // RB63 | ADP 206.4
      {name: 'Kimani Vidal',       team: 'LAC'}, // RB64 | ADP 212.1
      {name: 'Demond Claiborne',   team: 'MIN'}, // RB65 | ADP 212.6
      {name: 'James Conner',       team: 'ARI'}, // RB66 | ADP 213.9
    ]
  },
  WR: {
    // $5: Elite WR1s (WR1-WR8)
    5: [
      {name: "Ja'Marr Chase",       team: 'CIN'}, // WR1 | ADP 3.1
      {name: 'Puka Nacua',          team: 'LAR'}, // WR2 | ADP 4.1
      {name: 'Jaxon Smith-Njigba',  team: 'SEA'}, // WR3 | ADP 5.2
      {name: 'Amon-Ra St. Brown',   team: 'DET'}, // WR4 | ADP 8.0
      {name: 'CeeDee Lamb',         team: 'DAL'}, // WR5 | ADP 9.3
      {name: 'Justin Jefferson',    team: 'MIN'}, // WR6 | ADP 9.7
      {name: 'Rashee Rice',         team: 'KC'},  // WR7 | ADP 19.0
      {name: 'Drake London',        team: 'ATL'}, // WR8 | ADP 19.7
    ],
    // $4: Strong WR1 / High-end WR2 (WR9-WR20)
    4: [
      {name: 'Malik Nabers',     team: 'NYG'}, // WR9  | ADP 22.9
      {name: 'George Pickens',   team: 'DAL'}, // WR10 | ADP 25.3
      {name: 'Nico Collins',     team: 'HOU'}, // WR11 | ADP 25.8
      {name: 'A.J. Brown',       team: 'PHI'}, // WR12 | ADP 27.5
      {name: 'DeVonta Smith',    team: 'PHI'}, // WR13 | ADP 32.2
      {name: 'Chris Olave',      team: 'NO'},  // WR14 | ADP 32.7
      {name: 'Tee Higgins',      team: 'CIN'}, // WR15 | ADP 35.6
      {name: 'Tetairoa McMillan',team: 'CAR'}, // WR16 | ADP 35.7
      {name: 'Zay Flowers',      team: 'BAL'}, // WR17 | ADP 38.2
      {name: 'Garrett Wilson',   team: 'NYJ'}, // WR18 | ADP 38.3
      {name: 'Emeka Egbuka',     team: 'TB'},  // WR19 | ADP 39.9
      {name: 'Ladd McConkey',    team: 'LAC'}, // WR20 | ADP 40.5
    ],
    // $3: Solid WR2 / Elite WR3 (WR21-WR36)
    3: [
      {name: 'Luther Burden III', team: 'CHI'}, // WR21 | ADP 42.5
      {name: 'Mike Evans',        team: 'SF'},  // WR22 | ADP 45.3
      {name: 'Jameson Williams',  team: 'DET'}, // WR23 | ADP 48.2
      {name: 'Jaylen Waddle',     team: 'DEN'}, // WR24 | ADP 49.9
      {name: 'Terry McLaurin',    team: 'WAS'}, // WR25 | ADP 50.5
      {name: 'Davante Adams',     team: 'LAR'}, // WR26 | ADP 50.9
      {name: 'D.J. Moore',        team: 'BUF'}, // WR27 | ADP 53.0
      {name: 'Rome Odunze',       team: 'CHI'}, // WR28 | ADP 56.4
      {name: 'Christian Watson',  team: 'GB'},  // WR29 | ADP 59.3
      {name: 'Carnell Tate',      team: 'TEN'}, // WR30 | ADP 60.7
      {name: 'Jordyn Tyson',      team: 'NO'},  // WR31 | ADP 62.5
      {name: 'Brian Thomas Jr.',  team: 'JAX'}, // WR32 | ADP 64.8
      {name: 'Marvin Harrison Jr.',team: 'ARI'},// WR33 | ADP 67.4
      {name: 'Alec Pierce',       team: 'IND'}, // WR34 | ADP 71.5
      {name: 'Makai Lemon',       team: 'PHI'}, // WR35 | ADP 72.5
      {name: 'Parker Washington', team: 'JAX'}, // WR36 | ADP 75.4
    ],
    // $2: Strong WR3 / Flex (WR37-WR55)
    2: [
      {name: 'DK Metcalf',         team: 'PIT'}, // WR37 | ADP 76.5
      {name: 'Courtland Sutton',   team: 'DEN'}, // WR38 | ADP 81.2
      {name: 'Jayden Reed',        team: 'GB'},  // WR39 | ADP 82.4
      {name: 'Jordan Addison',     team: 'MIN'}, // WR40 | ADP 85.6
      {name: 'Michael Wilson',     team: 'ARI'}, // WR41 | ADP 87.6
      {name: 'Chris Godwin',       team: 'TB'},  // WR42 | ADP 88.7
      {name: 'Quentin Johnston',   team: 'LAC'}, // WR43 | ADP 94.2
      {name: 'Jakobi Meyers',      team: 'JAX'}, // WR44 | ADP 95.9
      {name: 'Josh Downs',         team: 'IND'}, // WR45 | ADP 99.3
      {name: 'Ricky Pearsall',     team: 'SF'},  // WR46 | ADP 101.7
      {name: 'Matthew Golden',     team: 'GB'},  // WR47 | ADP 106.1
      {name: 'Michael Pittman Jr.',team: 'PIT'}, // WR48 | ADP 108.3
      {name: 'Xavier Worthy',      team: 'KC'},  // WR49 | ADP 110.0
      {name: 'Romeo Doubs',        team: 'NE'},  // WR50 | ADP 113.4
      {name: 'KC Concepcion',      team: 'CLE'}, // WR51 | ADP 114.8
      {name: "Wan'Dale Robinson",  team: 'TEN'}, // WR52 | ADP 117.4
      {name: 'Jayden Higgins',     team: 'HOU'}, // WR53 | ADP 123.9
      {name: 'Khalil Shakir',      team: 'BUF'}, // WR54 | ADP 127.0
      {name: 'Jalen Coker',        team: 'CAR'}, // WR55 | ADP 131.9
    ],
    // $1: Deep / late-round (WR56+)
    1: [
      {name: 'Rashid Shaheed',     team: 'SEA'}, // WR56 | ADP 136.8
      {name: 'Omar Cooper',        team: 'NYJ'}, // WR57 | ADP 139.9
      {name: 'Travis Hunter',      team: 'JAX'}, // WR59 | ADP 142.0
      {name: 'Jalen McMillan',     team: 'TB'},  // WR60 | ADP 144.5
      {name: 'Jauan Jennings',     team: 'MIN'}, // WR61 | ADP 146.9
      {name: 'Jalen Nailor',       team: 'LV'},  // WR62 | ADP 156.7
      {name: 'Tre Tucker',         team: 'LV'},  // WR63 | ADP 157.3
      {name: 'Antonio Williams',   team: 'WAS'}, // WR64 | ADP 160.1
      {name: 'Denzel Boston',      team: 'CLE'}, // WR65 | ADP 161.3
      {name: "De'Zhaun Stribling", team: 'SF'},  // WR66 | ADP 164.1
      {name: 'Isaac TeSlaa',       team: 'DET'}, // WR67 | ADP 168.9
      {name: 'Brandon Aiyuk',      team: 'SF'},  // WR69 | ADP 175.3
      {name: 'Calvin Ridley',      team: 'TEN'}, // WR70 | ADP 175.7
      {name: 'Jerry Jeudy',        team: 'CLE'}, // WR71 | ADP 179.9
      {name: 'Germie Bernard',     team: 'PIT'}, // WR72 | ADP 182.5
      {name: "Tre' Harris",        team: 'LAC'}, // WR74 | ADP 185.4
      {name: 'Chris Bell',         team: 'MIA'}, // WR75 | ADP 188.5
      {name: 'Tank Dell',          team: 'HOU'}, // WR78 | ADP 196.7
      {name: 'Zachariah Branch',   team: 'ATL'}, // WR79 | ADP 198.0
      {name: 'Darnell Mooney',     team: 'NYG'}, // WR80 | ADP 198.7
      {name: 'Kayshon Boutte',     team: 'NE'},  // WR81 | ADP 200.1
      {name: 'Malik Washington',   team: 'MIA'}, // WR82 | ADP 203.2
      {name: 'Cooper Kupp',        team: 'SEA'}, // WR84 | ADP 208.3
      {name: 'Rashod Bateman',     team: 'BAL'}, // WR94 | ADP 214.3
      {name: 'Christian Kirk',     team: 'SF'},  // WR93 | ADP 213.7
      {name: 'Keon Coleman',       team: 'BUF'}, // WR96 | ADP 214.8
      {name: 'Jaylin Noel',        team: 'HOU'}, // WR98 | ADP 215.0
    ]
  },
  TE: {
    // $5: Elite TE1s (TE1-TE2)
    5: [
      {name: 'Brock Bowers',  team: 'LV'},  // TE1 | ADP 21.3
      {name: 'Trey McBride',  team: 'ARI'}, // TE2 | ADP 24.4
    ],
    // $4: Strong TE1 (TE3-TE6)
    4: [
      {name: 'Colston Loveland', team: 'CHI'}, // TE3 | ADP 46.6
      {name: 'Tyler Warren',     team: 'IND'}, // TE4 | ADP 66.7
      {name: 'Tucker Kraft',     team: 'GB'},  // TE5 | ADP 80.5
      {name: 'Harold Fannin Jr.',team: 'CLE'}, // TE6 | ADP 91.9
    ],
    // $3: Mid-tier TE1 / Elite TE2 (TE7-TE13)
    3: [
      {name: 'Sam LaPorta',     team: 'DET'}, // TE7  | ADP 97.8
      {name: 'Kyle Pitts',      team: 'ATL'}, // TE8  | ADP 103.4
      {name: 'George Kittle',   team: 'SF'},  // TE9  | ADP 116.7
      {name: 'Jake Ferguson',   team: 'DAL'}, // TE10 | ADP 124.3
      {name: 'Travis Kelce',    team: 'KC'},  // TE11 | ADP 124.3
      {name: 'Mark Andrews',    team: 'BAL'}, // TE12 | ADP 127.3
      {name: 'Dalton Kincaid',  team: 'BUF'}, // TE13 | ADP 131.3
    ],
    // $2: TE2 / streamers (TE14-TE22)
    2: [
      {name: 'Isaiah Likely',   team: 'NYG'}, // TE14 | ADP 133.3
      {name: 'Dallas Goedert',  team: 'PHI'}, // TE15 | ADP 135.3
      {name: 'Oronde Gadsden II',team:'LAC'}, // TE16 | ADP 137.0
      {name: 'Kenyon Sadiq',    team: 'NYJ'}, // TE17 | ADP 147.7
      {name: 'Hunter Henry',    team: 'NE'},  // TE18 | ADP 150.2
      {name: 'Brenton Strange', team: 'JAX'}, // TE19 | ADP 153.0
      {name: 'Chig Okonkwo',    team: 'WAS'}, // TE20 | ADP 153.2
      {name: 'Juwan Johnson',   team: 'NO'},  // TE21 | ADP 155.5
      {name: 'T.J. Hockenson',  team: 'MIN'}, // TE22 | ADP 163.9
    ],
    // $1: Deep / dart throws (TE23+)
    1: [
      {name: 'AJ Barner',        team: 'SEA'}, // TE23 | ADP 170.3
      {name: 'Dalton Schultz',   team: 'HOU'}, // TE24 | ADP 171.3
      {name: 'Gunnar Helm',      team: 'TEN'}, // TE25 | ADP 181.2
      {name: 'Cade Otton',       team: 'TB'},  // TE26 | ADP 185.4
      {name: 'David Njoku',      team: 'LAC'}, // TE27 | ADP 190.3
      {name: 'Eli Stowers',      team: 'PHI'}, // TE28 | ADP 193.5
      {name: 'Pat Freiermuth',   team: 'PIT'}, // TE29 | ADP 194.7
      {name: 'Terrance Ferguson',team: 'LAR'}, // TE30 | ADP 205.4
      {name: 'Mike Gesicki',     team: 'CIN'}, // TE31 | ADP 207.8
      {name: 'Greg Dulcich',     team: 'MIA'}, // TE32 | ADP 209.9
      {name: 'Jake Tonges',      team: 'SF'},  // TE33 | ADP 212.3
      {name: 'Colby Parkinson',  team: 'LAR'}, // TE34 | ADP 214.1
      {name: 'Evan Engram',      team: 'DEN'}, // TE35 | ADP 214.9
      {name: 'Michael Mayer',    team: 'LV'},  // TE38 | ADP 215.5
      {name: 'Tommy Tremble',    team: 'CAR'}, // outside top-240; included for CAR coverage
    ]
  }
};

// ============================================================
// NBA CONFIGURATION - Feb 25, 2026 Slate (UNCHANGED)
// ============================================================

const NBA_MATCHUPS = {
  IND: { opp: 'PHI', home: false },
  PHI: { opp: 'IND', home: true },
  TOR: { opp: 'OKC', home: false },
  OKC: { opp: 'TOR', home: true },
  ATL: { opp: 'WAS', home: false },
  WAS: { opp: 'ATL', home: true },
  CLE: { opp: 'NY', home: false },
  NY: { opp: 'CLE', home: true },
  BKN: { opp: 'DAL', home: false },
  DAL: { opp: 'BKN', home: true },
  MIL: { opp: 'MIA', home: false },
  MIA: { opp: 'MIL', home: true },
  NOP: { opp: 'GS', home: false },
  GS: { opp: 'NOP', home: true },
  CHI: { opp: 'CHA', home: false },
  CHA: { opp: 'CHI', home: true },
  PHO: { opp: 'BOS', home: false },
  BOS: { opp: 'PHO', home: true },
  POR: { opp: 'MIN', home: false },
  MIN: { opp: 'POR', home: true },
  LAL: { opp: 'ORL', home: false },
  ORL: { opp: 'LAL', home: true },
};

const NBA_PLAYER_POOLS = {
  PG: {
    5: [
      {name: 'Tyrese Maxey', team: 'PHI'},
      {name: 'James Harden', team: 'CLE'},
      {name: 'Luka Doncic', team: 'LAL'},
      {name: 'Damian Lillard', team: 'MIL'}
    ],
    4: [
      {name: 'Josh Giddey', team: 'CHI'},
      {name: 'Jalen Brunson', team: 'NY'},
      {name: 'LaMelo Ball', team: 'CHA'},
      {name: 'Derrick White', team: 'BOS'},
      {name: 'Jrue Holiday', team: 'POR'}
    ],
    3: [
      {name: 'Immanuel Quickley', team: 'TOR'},
      {name: 'Andrew Nembhard', team: 'IND'},
      {name: 'Jalen Suggs', team: 'ORL'},
      {name: 'Payton Pritchard', team: 'BOS'},
      {name: 'Anthony Black', team: 'ORL'},
      {name: 'Terry Rozier', team: 'MIA'},
      {name: 'Dejounte Murray', team: 'NOP'},
      {name: "D'Angelo Russell", team: 'LAL'},
      {name: 'Kevin Porter Jr.', team: 'MIL'}
    ],
    2: [
      {name: 'Collin Gillespie', team: 'PHO'},
      {name: 'Tre Jones', team: 'CHI'},
      {name: 'Miles McBride', team: 'NY'},
      {name: 'Alex Caruso', team: 'OKC'},
      {name: 'Mike Conley', team: 'MIN'},
      {name: 'Scoot Henderson', team: 'POR'}
    ],
    1: [
      {name: 'T.J. McConnell', team: 'IND'},
      {name: 'Egor Demin', team: 'BKN'},
      {name: 'Spencer Dinwiddie', team: 'DAL'},
      {name: 'Jose Alvarado', team: 'NY'},
      {name: 'Rob Dillingham', team: 'MIN'},
      {name: 'Cason Wallace', team: 'OKC'}
    ]
  },
  SG: {
    5: [
      {name: 'Donovan Mitchell', team: 'CLE'},
      {name: 'Jaylen Brown', team: 'BOS'},
      {name: 'Shai Gilgeous-Alexander', team: 'OKC'},
      {name: 'Anthony Edwards', team: 'MIN'}
    ],
    4: [
      {name: 'Devin Booker', team: 'PHO'},
      {name: 'Austin Reaves', team: 'LAL'},
      {name: 'Norman Powell', team: 'MIA'}
    ],
    3: [
      {name: 'Nickeil Alexander-Walker', team: 'ATL'},
      {name: 'Desmond Bane', team: 'ORL'},
      {name: 'Dyson Daniels', team: 'ATL'},
      {name: 'Kon Knueppel', team: 'CHA'},
      {name: 'VJ Edgecombe', team: 'PHI'},
      {name: 'RJ Barrett', team: 'TOR'},
      {name: 'Josh Hart', team: 'NY'},
      {name: 'Ryan Rollins', team: 'MIL'}
    ],
    2: [
      {name: 'CJ McCollum', team: 'ATL'},
      {name: 'Brandin Podziemski', team: 'GS'},
      {name: 'Quentin Grimes', team: 'PHI'},
      {name: 'Lu Dort', team: 'OKC'},
      {name: 'Donte DiVincenzo', team: 'MIN'},
      {name: 'Klay Thompson', team: 'DAL'},
      {name: 'Dalton Knecht', team: 'LAL'}
    ],
    1: [
      {name: 'Collin Sexton', team: 'CHI'},
      {name: 'Anfernee Simons', team: 'CHI'},
      {name: "De'Anthony Melton", team: 'GS'},
      {name: 'Sam Merrill', team: 'CLE'},
      {name: 'Jordan Goodwin', team: 'PHO'},
      {name: 'Moses Moody', team: 'GS'},
      {name: 'Tre Johnson', team: 'WAS'},
      {name: 'Jordan Hawkins', team: 'NOP'},
      {name: 'Jaden Hardy', team: 'DAL'},
      {name: 'AJ Green', team: 'MIL'},
      {name: 'Max Christie', team: 'DAL'},
      {name: 'Ben Sheppard', team: 'IND'},
      {name: 'Luke Kennard', team: 'LAL'}
    ]
  },
  SF: {
    5: [
      {name: 'Jalen Johnson', team: 'ATL'},
      {name: 'LeBron James', team: 'LAL'},
      {name: 'Jalen Williams', team: 'OKC'}
    ],
    4: [
      {name: 'Michael Porter Jr.', team: 'BKN'},
      {name: 'Mikal Bridges', team: 'NY'},
      {name: 'Brandon Ingram', team: 'TOR'}
    ],
    3: [
      {name: 'Brandon Miller', team: 'CHA'},
      {name: 'OG Anunoby', team: 'NY'},
      {name: 'Kyshawn George', team: 'WAS'},
      {name: 'Jerami Grant', team: 'POR'},
      {name: 'Deni Avdija', team: 'POR'},
      {name: 'Khris Middleton', team: 'MIL'}
    ],
    2: [
      {name: 'Dillon Brooks', team: 'PHO'},
      {name: 'Matas Buzelis', team: 'CHI'},
      {name: 'Kelly Oubre Jr.', team: 'PHI'},
      {name: 'Jaylon Tyson', team: 'CLE'},
      {name: 'Aaron Nesmith', team: 'IND'},
      {name: 'Bilal Coulibaly', team: 'WAS'},
      {name: 'Jaden McDaniels', team: 'MIN'},
      {name: 'Herb Jones', team: 'NOP'},
      {name: 'Jaime Jaquez Jr.', team: 'MIA'},
      {name: 'Naji Marshall', team: 'DAL'},
      {name: 'Aaron Wiggins', team: 'OKC'},
      {name: 'Saddiq Bey', team: 'NOP'}
    ],
    1: [
      {name: 'Ziaire Williams', team: 'BKN'},
      {name: 'Toumani Camara', team: 'POR'},
      {name: 'Andre Jackson Jr.', team: 'MIL'},
      {name: 'Haywood Highsmith', team: 'MIA'}
    ]
  },
  PF: {
    5: [
      {name: 'Scottie Barnes', team: 'TOR'},
      {name: 'Chet Holmgren', team: 'OKC'},
      {name: 'Evan Mobley', team: 'CLE'}
    ],
    4: [
      {name: 'Paolo Banchero', team: 'ORL'},
      {name: 'Zion Williamson', team: 'NOP'},
      {name: 'Julius Randle', team: 'MIN'}
    ],
    3: [
      {name: 'Miles Bridges', team: 'CHA'},
      {name: 'PJ Washington', team: 'DAL'},
      {name: 'Naz Reid', team: 'MIN'}
    ],
    2: [
      {name: 'Draymond Green', team: 'GS'},
      {name: 'Noah Clowney', team: 'BKN'},
      {name: 'Sandro Mamukelashvili', team: 'TOR'},
      {name: "Royce O'Neale", team: 'PHO'},
      {name: 'Bobby Portis', team: 'MIL'},
      {name: 'Nikola Jovic', team: 'MIA'},
      {name: 'Rui Hachimura', team: 'LAL'}
    ],
    1: [
      {name: 'Jalen Smith', team: 'CHI'},
      {name: 'Collin Murray-Boyles', team: 'TOR'},
      {name: 'Dominick Barlow', team: 'PHI'},
      {name: 'Jarred Vanderbilt', team: 'LAL'},
      {name: 'Kenrich Williams', team: 'OKC'}
    ]
  },
  C: {
    5: [
      {name: 'Karl-Anthony Towns', team: 'NY'},
      {name: 'Bam Adebayo', team: 'MIA'},
      {name: 'Jarrett Allen', team: 'CLE'}
    ],
    4: [
      {name: 'Nikola Vucevic', team: 'BOS'},
      {name: 'Rudy Gobert', team: 'MIN'},
      {name: 'Onyeka Okongwu', team: 'ATL'}
    ],
    3: [
      {name: 'Kristaps Porzingis', team: 'GS'},
      {name: 'Nicolas Claxton', team: 'BKN'},
      {name: 'Isaiah Hartenstein', team: 'OKC'},
      {name: 'Deandre Ayton', team: 'LAL'}
    ],
    2: [
      {name: 'Mark Williams', team: 'PHO'},
      {name: 'Wendell Carter Jr.', team: 'ORL'},
      {name: 'Neemias Queta', team: 'BOS'},
      {name: 'Moussa Diabate', team: 'CHA'},
      {name: 'Jock Landale', team: 'ATL'},
      {name: 'Brook Lopez', team: 'MIL'},
      {name: 'Jonas Valanciunas', team: 'NOP'}
    ],
    1: [
      {name: 'Jakob Poeltl', team: 'TOR'},
      {name: "Day'Ron Sharpe", team: 'BKN'},
      {name: 'Jay Huff', team: 'IND'},
      {name: 'Mitchell Robinson', team: 'NY'},
      {name: 'Al Horford', team: 'GS'},
      {name: 'Ryan Kalkbrenner', team: 'CHA'},
      {name: 'Goga Bitadze', team: 'ORL'},
      {name: "Kel'el Ware", team: 'MIA'},
      {name: 'Jaxson Hayes', team: 'LAL'},
      {name: 'Robert Williams III', team: 'POR'},
      {name: 'Yves Missi', team: 'NOP'},
      {name: 'Luka Garza', team: 'MIN'}
    ]
  }
};

// Position arrays
const NFL_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
const NBA_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Legacy exports for backward compatibility
const PLAYER_POOLS = NFL_PLAYER_POOLS;
const WEEK_MATCHUPS = NFL_MATCHUPS;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const getMatchupString = (team, sport = 'nfl') => {
  const matchups = sport === 'nba' ? NBA_MATCHUPS : NFL_MATCHUPS;
  const matchup = matchups[team];
  if (!matchup || matchup.opp === 'BYE') return 'BYE';
  return matchup.home ? `vs ${matchup.opp}` : `@ ${matchup.opp}`;
};

// ============================================================
// NFL BOARD GENERATION (single-appearance)
// A given player (name+team) can occupy at most one cell per board.
// Vote weighting unchanged: Fire Sale = 3x, Cool Down = 0.1x.
// ============================================================

const generateNFLBoard = (contestType, fireSaleList = [], coolDownList = []) => {
  const board = [];
  const prices = [5, 4, 3, 2, 1];
  const positions = ['QB', 'RB', 'WR', 'TE'];

  const fireSaleNames = new Set(fireSaleList.map(p => p.name?.toLowerCase()));
  const coolDownNames = new Set(coolDownList.map(p => p.name?.toLowerCase()));

  // ---- single-appearance bookkeeping ----
  const usedKeys = new Set();
  const keyOf = (p) => `${(p.name || '').toLowerCase()}|${p.team || ''}`;
  const tag = (p) => ({
    isFireSale: fireSaleNames.has(p.name?.toLowerCase()),
    isCoolDown: coolDownNames.has(p.name?.toLowerCase()),
  });

  // Weighted, dedup-aware pick. Returns null only if EVERY player in the
  // pool is already on the board.
  const selectWeightedPlayer = (pool) => {
    if (!pool || pool.length === 0) return null;
    const available = pool.filter(p => !usedKeys.has(keyOf(p)));
    if (available.length === 0) return null;

    const weightedPool = [];
    available.forEach(player => {
      const n = player.name?.toLowerCase();
      let weight = 1;
      if (fireSaleNames.has(n)) weight = 3;          // Fire Sale: 3x
      else if (coolDownNames.has(n)) weight = 0.1;   // Cool Down: 0.1x
      const entries = Math.max(1, Math.round(weight * 10));
      for (let i = 0; i < entries; i++) weightedPool.push(player);
    });

    const selected = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    usedKeys.add(keyOf(selected));
    return selected;
  };

  // For FLEX / wildcard cells (which carry their own price): try the
  // preferred tier, then other tiers, so a small exhausted tier never
  // leaves a hole. Returns { player, price } or null.
  const pickUniqueAtPosition = (position, preferredPrice) => {
    const order = [preferredPrice, ...prices.filter(pr => pr !== preferredPrice)];
    for (const pr of order) {
      const player = selectWeightedPlayer(NFL_PLAYER_POOLS[position]?.[pr] || []);
      if (player) return { player, price: pr };
    }
    return null;
  };

  console.log('🏈 Generating NFL board (single-appearance)');
  console.log('🔥 Fire Sale players:', Array.from(fireSaleNames));
  console.log('❄️ Cool Down players:', Array.from(coolDownNames));

  // ---- main grid: one unique player per (position, price) ----
  prices.forEach((price, rowIndex) => {
    const row = [];

    positions.forEach(position => {
      const selected = selectWeightedPlayer(NFL_PLAYER_POOLS[position][price] || []);
      if (selected) {
        row.push({ ...selected, position, price, drafted: false, draftedBy: null, ...tag(selected) });
      }
    });

    // per-row FLEX stays at this row's price tier
    const flexPositions = (rowIndex === 0) ? ['RB', 'WR'] : ['RB', 'WR', 'TE'];
    const flexPos = flexPositions[Math.floor(Math.random() * flexPositions.length)];
    const flexPlayer = selectWeightedPlayer(NFL_PLAYER_POOLS[flexPos][price] || []);
    if (flexPlayer) {
      row.push({ ...flexPlayer, position: 'FLEX', originalPosition: flexPos, price, drafted: false, draftedBy: null, ...tag(flexPlayer) });
    }

    board.push(row);
  });

  // ---- wildcard row (index 5): mixed-price FLEX slots ----
  const flexRow = [];

  const qbPick = pickUniqueAtPosition('QB', prices[Math.floor(Math.random() * prices.length)]);
  if (qbPick) {
    flexRow.push({ ...qbPick.player, position: 'FLEX', originalPosition: 'QB', price: qbPick.price, drafted: false, draftedBy: null, ...tag(qbPick.player) });
  }

  for (let i = 1; i < 4; i++) {
    const pos = ['RB', 'WR', 'TE'][Math.floor(Math.random() * 3)];
    const pick = pickUniqueAtPosition(pos, prices[Math.floor(Math.random() * prices.length)]);
    if (pick) {
      flexRow.push({ ...pick.player, position: 'FLEX', originalPosition: pos, price: pick.price, drafted: false, draftedBy: null, ...tag(pick.player) });
    }
  }

  // stacked WR: a WR sharing a team with a QB already on the board, still unique
  const qbTeams = new Set();
  for (let r = 0; r < 5; r++) if (board[r][0]?.team) qbTeams.add(board[r][0].team);
  if (flexRow[0]?.team) qbTeams.add(flexRow[0].team);
  console.log('🏈 QB teams for stacking:', Array.from(qbTeams));

  const stackableWRs = [];
  Object.entries(NFL_PLAYER_POOLS.WR).forEach(([priceStr, players]) => {
    const price = parseInt(priceStr);
    players.forEach(player => {
      if (qbTeams.has(player.team) && !usedKeys.has(keyOf(player))) {
        stackableWRs.push({ ...player, price });
      }
    });
  });

  if (stackableWRs.length > 0) {
    const weighted = [];
    stackableWRs.forEach(player => {
      const n = player.name?.toLowerCase();
      let weight = 1;
      if (fireSaleNames.has(n)) weight = 3;
      else if (coolDownNames.has(n)) weight = 0.1;
      const entries = Math.max(1, Math.round(weight * 10));
      for (let i = 0; i < entries; i++) weighted.push(player);
    });
    const stackedWR = weighted[Math.floor(Math.random() * weighted.length)];
    usedKeys.add(keyOf(stackedWR));
    flexRow.push({ ...stackedWR, position: 'FLEX', originalPosition: 'WR', drafted: false, draftedBy: null, ...tag(stackedWR), isStackedWR: true });
    console.log(`✅ Stacked WR: ${stackedWR.name} (${stackedWR.team}) at $${stackedWR.price}`);
  } else {
    const pick = pickUniqueAtPosition('WR', prices[Math.floor(Math.random() * prices.length)]);
    if (pick) {
      flexRow.push({ ...pick.player, position: 'FLEX', originalPosition: 'WR', price: pick.price, drafted: false, draftedBy: null, ...tag(pick.player) });
    }
  }

  board.push(flexRow);

  // ---- guarantee at least one RB among the FLEX spots ----
  const flexSpots = [];
  for (let r = 0; r < 5; r++) if (board[r][4]) flexSpots.push({ row: r, col: 4 });
  for (let c = 1; c < 5; c++) if (board[5] && board[5][c]) flexSpots.push({ row: 5, col: c });

  const hasRBInFlex = flexSpots.some(s => board[s.row][s.col]?.originalPosition === 'RB');

  if (!hasRBInFlex && flexSpots.length > 0) {
    const spot = flexSpots[Math.floor(Math.random() * flexSpots.length)];
    const cell = board[spot.row][spot.col];
    if (cell) usedKeys.delete(keyOf(cell)); // free the cell we are replacing

    let rbPlayer = selectWeightedPlayer(NFL_PLAYER_POOLS['RB'][cell.price] || []);
    let rbPrice = cell.price;
    if (!rbPlayer) {
      const pick = pickUniqueAtPosition('RB', cell.price);
      if (pick) { rbPlayer = pick.player; rbPrice = pick.price; }
    }

    if (rbPlayer) {
      board[spot.row][spot.col] = { ...rbPlayer, position: 'FLEX', originalPosition: 'RB', price: rbPrice, drafted: false, draftedBy: null, ...tag(rbPlayer) };
    } else if (cell) {
      usedKeys.add(keyOf(cell)); // couldn't place; keep original
    }
  }

  // ---- guarantee at least one Fire Sale player on the board ----
  if (fireSaleList.length > 0) {
    let fireSaleCount = 0;
    board.forEach(row => row.forEach(p => { if (p && p.isFireSale) fireSaleCount++; }));
    console.log(`🔥 Fire Sale players on board: ${fireSaleCount}`);

    if (fireSaleCount === 0) {
      console.log('⚠️ No Fire Sale players on board - forcing one...');
      const fs = fireSaleList[Math.floor(Math.random() * fireSaleList.length)];
      const fsPosition = fs.position || 'WR';
      const fsPrice = fs.price || 3;
      let replaced = false;

      const priceRow = 5 - fsPrice;
      if (priceRow >= 0 && priceRow < 5) {
        const positionCols = { QB: 0, RB: 1, WR: 2, TE: 3, FLEX: 4 };
        const col = positionCols[fsPosition];
        if (col !== undefined && board[priceRow][col] && !board[priceRow][col].isFireSale) {
          usedKeys.delete(keyOf(board[priceRow][col]));
          board[priceRow][col] = { name: fs.name, team: fs.team, position: fsPosition, price: fsPrice, drafted: false, draftedBy: null, isFireSale: true, isCoolDown: false, forcedFireSale: true };
          usedKeys.add(keyOf(board[priceRow][col]));
          replaced = true;
          console.log(`✅ Forced ${fs.name} into row ${priceRow}, col ${col}`);
        }
      }

      if (!replaced) {
        for (let r = 0; r < board.length && !replaced; r++) {
          for (let c = 0; c < board[r].length && !replaced; c++) {
            if (board[r][c] && !board[r][c].isFireSale && board[r][c].position !== 'FLEX') {
              const old = board[r][c];
              usedKeys.delete(keyOf(old));
              board[r][c] = { name: fs.name, team: fs.team, position: old.position, originalPosition: fsPosition, price: old.price, drafted: false, draftedBy: null, isFireSale: true, isCoolDown: false, forcedFireSale: true };
              usedKeys.add(keyOf(board[r][c]));
              replaced = true;
              console.log(`✅ Forced ${fs.name} into row ${r}, col ${c} (fallback)`);
            }
          }
        }
      }
    }
  }

  // matchup tags
  board.forEach(row => row.forEach(player => {
    if (player && player.team) player.matchup = getMatchupString(player.team, 'nfl');
  }));

  console.log('📋 NFL Board generated:');
  board.forEach((row, i) => {
    const label = i === 5 ? 'Wildcards' : `$${5 - i}`;
    console.log(`  ${label}: ${row.length} players`);
  });

  return board;
};

// ============================================================
// NBA BOARD GENERATION (single-appearance)
// ============================================================

const generateNBABoard = (contestType, fireSaleList = [], coolDownList = []) => {
  const board = [];
  const prices = [5, 4, 3, 2, 1];
  const positions = NBA_POSITIONS;

  const fireSaleNames = new Set(fireSaleList.map(p => p.name?.toLowerCase()));
  const coolDownNames = new Set(coolDownList.map(p => p.name?.toLowerCase()));

  const usedKeys = new Set();
  const keyOf = (p) => `${(p.name || '').toLowerCase()}|${p.team || ''}`;
  const tag = (p) => ({
    isFireSale: fireSaleNames.has(p.name?.toLowerCase()),
    isCoolDown: coolDownNames.has(p.name?.toLowerCase()),
  });

  const selectWeightedPlayer = (pool) => {
    if (!pool || pool.length === 0) return null;
    const available = pool.filter(p => !usedKeys.has(keyOf(p)));
    if (available.length === 0) return null;
    const weightedPool = [];
    available.forEach(player => {
      const n = player.name?.toLowerCase();
      let weight = 1;
      if (fireSaleNames.has(n)) weight = 3;
      else if (coolDownNames.has(n)) weight = 0.1;
      const entries = Math.max(1, Math.round(weight * 10));
      for (let i = 0; i < entries; i++) weightedPool.push(player);
    });
    const selected = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    usedKeys.add(keyOf(selected));
    return selected;
  };

  const pickUniqueAtPosition = (position, preferredPrice) => {
    const order = [preferredPrice, ...prices.filter(pr => pr !== preferredPrice)];
    for (const pr of order) {
      const player = selectWeightedPlayer(NBA_PLAYER_POOLS[position]?.[pr] || []);
      if (player) return { player, price: pr };
    }
    return null;
  };

  console.log('🏀 Generating NBA board (single-appearance)');
  console.log('🔥 Fire Sale players:', Array.from(fireSaleNames));
  console.log('❄️ Cool Down players:', Array.from(coolDownNames));

  // main grid
  prices.forEach((price) => {
    const row = [];
    positions.forEach((position) => {
      const selected = selectWeightedPlayer(NBA_PLAYER_POOLS[position][price] || []);
      if (selected) {
        row.push({ ...selected, position, price, drafted: false, draftedBy: null, ...tag(selected) });
      } else {
        row.push({ name: `${position} $${price}`, team: 'TBD', position, price, drafted: false, draftedBy: null, isFireSale: false, isCoolDown: false });
      }
    });
    board.push(row);
  });

  // wildcard row — each position at a (possibly shifted) unique price
  const wildcardRow = [];
  positions.forEach((position) => {
    const pick = pickUniqueAtPosition(position, prices[Math.floor(Math.random() * prices.length)]);
    if (pick) {
      wildcardRow.push({ ...pick.player, position, price: pick.price, drafted: false, draftedBy: null, ...tag(pick.player), isWildcard: true });
    } else {
      wildcardRow.push({ name: `${position} Wildcard`, team: 'TBD', position, price: prices[Math.floor(Math.random() * prices.length)], drafted: false, draftedBy: null, isFireSale: false, isCoolDown: false, isWildcard: true });
    }
  });
  board.push(wildcardRow);

  // guarantee a Fire Sale player
  if (fireSaleList.length > 0) {
    let fireSaleCount = 0;
    board.forEach(row => row.forEach(p => { if (p && p.isFireSale) fireSaleCount++; }));
    console.log(`🔥 Fire Sale players on board: ${fireSaleCount}`);

    if (fireSaleCount === 0) {
      console.log('⚠️ No Fire Sale players on board - forcing one...');
      const fs = fireSaleList[Math.floor(Math.random() * fireSaleList.length)];
      const fsPosition = fs.position || 'SF';
      const fsPrice = fs.price || 3;
      const priceRow = 5 - fsPrice;
      const positionCol = positions.indexOf(fsPosition);
      if (priceRow >= 0 && priceRow < 5 && positionCol >= 0) {
        const old = board[priceRow][positionCol];
        if (old) usedKeys.delete(keyOf(old));
        board[priceRow][positionCol] = { name: fs.name, team: fs.team, position: fsPosition, price: fsPrice, drafted: false, draftedBy: null, isFireSale: true, isCoolDown: false, forcedFireSale: true };
        usedKeys.add(keyOf(board[priceRow][positionCol]));
        console.log(`✅ Forced ${fs.name} into row ${priceRow}, col ${positionCol}`);
      }
    }
  }

  board.forEach(row => row.forEach(player => {
    if (player && player.team && player.team !== 'TBD') player.matchup = getMatchupString(player.team, 'nba');
  }));

  console.log('📋 NBA Board generated:');
  board.forEach((row, i) => {
    const label = i === 5 ? 'Wildcards' : `$${5 - i}`;
    const positionsStr = row.map(p => `${p.position}($${p.price})`).join(', ');
    console.log(`  ${label}: ${positionsStr}`);
  });

  return board;
};

// ============================================================
// MAIN BOARD GENERATION FUNCTION
// ============================================================

const generatePlayerBoard = (contestType, fireSaleList = [], coolDownList = [], sport = 'nfl') => {
  if (sport === 'nba') {
    return generateNBABoard(contestType, fireSaleList, coolDownList);
  }
  return generateNFLBoard(contestType, fireSaleList, coolDownList);
};

// ============================================================
// GAME MECHANICS
// ============================================================

// DEPRECATED / INACTIVE: the Kingpin (stacking + duplicate) bonus is no longer
// applied in scoring or settlement. With single-appearance boards the duplicate
// branch can never trigger. Retained only to preserve the export surface; safe
// to remove once you confirm nothing imports it.
const calculateKingpinBonus = (team, newPlayer) => {
  let bonusAdded = 0;

  const duplicates = team.players.filter(p =>
    p.name === newPlayer.name && p.team === newPlayer.team
  );
  if (duplicates.length === 2) {
    bonusAdded++;
  }

  const teamLeader = team.players.find(p =>
    (p.position === 'QB' || p.originalPosition === 'QB' ||
     p.position === 'PG' || p.originalPosition === 'PG') &&
    p.team === newPlayer.team
  );
  const isPassCatcher = ['WR', 'TE', 'SG', 'SF'].includes(newPlayer.position) ||
    ['WR', 'TE', 'SG', 'SF'].includes(newPlayer.originalPosition);

  if (teamLeader && isPassCatcher) {
    bonusAdded++;
  }

  const isLeader = newPlayer.position === 'QB' || newPlayer.originalPosition === 'QB' ||
                   newPlayer.position === 'PG' || newPlayer.originalPosition === 'PG';
  if (isLeader) {
    const hasPassCatcher = team.players.some(p =>
      p !== newPlayer &&
      p.team === newPlayer.team &&
      (['WR', 'TE', 'SG', 'SF'].includes(p.position) ||
       ['WR', 'TE', 'SG', 'SF'].includes(p.originalPosition))
    );
    if (hasPassCatcher) {
      bonusAdded++;
    }
  }

  return bonusAdded;
};

const applySkipPenalty = (teams, skippingTeamIndex) => {
  teams.forEach((team, index) => {
    if (index !== skippingTeamIndex) {
      team.budget += 1;
    }
  });
};

// ============================================================
// SPORT CONFIGURATION EXPORT
// ============================================================

const SPORT_CONFIG = {
  nfl: {
    positions: NFL_POSITIONS,
    playerPools: NFL_PLAYER_POOLS,
    matchups: NFL_MATCHUPS
  },
  nba: {
    positions: NBA_POSITIONS,
    playerPools: NBA_PLAYER_POOLS,
    matchups: NBA_MATCHUPS
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  SPORT_CONFIG,
  NFL_PLAYER_POOLS,
  NBA_PLAYER_POOLS,
  NFL_MATCHUPS,
  NBA_MATCHUPS,
  NFL_POSITIONS,
  NBA_POSITIONS,

  PLAYER_POOLS,
  WEEK_MATCHUPS,

  getMatchupString,
  generatePlayerBoard,
  generateNFLBoard,
  generateNBABoard,
  calculateKingpinBonus,
  applySkipPenalty
};