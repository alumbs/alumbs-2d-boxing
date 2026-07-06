// Fighter roster, ordered weakest → strongest. Stats are 1-10.
// style: 'slugger' | 'out-boxer' | 'pressure' | 'counter'

// Five hairstyles, deterministically assigned to roster fighters from their
// id so no per-fighter hair data needs to be hand-authored.
const HAIR_STYLES = ['bald', 'short', 'afro', 'mohawk', 'long'];
const HAIR_COLORS = ['#1a1a1a', '#3b2417', '#6b4423', '#d9b877', '#9a9a9a', '#8a3324'];

// Simple string hash (djb2) → picks a stable style + color per id.
function hairFor(id) {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  return {
    hair: HAIR_STYLES[h % HAIR_STYLES.length],
    hairColor: HAIR_COLORS[Math.floor(h / HAIR_STYLES.length) % HAIR_COLORS.length],
  };
}

const FIGHTERS = [
  {
    id: 'mcgee', name: 'Tommy McGee', nick: 'Glass Jaw', flag: '🇮🇪',
    power: 3, speed: 2, chin: 2, stamina: 3, recovery: 3,
    style: 'slugger', skin: '#e8b088', trunks: '#3d7a3d', gloves: '#265426', ...hairFor('mcgee'),
  },
  {
    id: 'sloane', name: 'Bud Sloane', nick: 'The Bum', flag: '🇺🇸',
    power: 2, speed: 3, chin: 4, stamina: 2, recovery: 2,
    style: 'out-boxer', skin: '#d9a071', trunks: '#6b6b6b', gloves: '#444444', ...hairFor('sloane'),
  },
  {
    id: 'park', name: 'Ernie Park', nick: 'Pillow Fists', flag: '🇰🇷',
    power: 1, speed: 4, chin: 5, stamina: 4, recovery: 3,
    style: 'counter', skin: '#e8c49a', trunks: '#8ab4d8', gloves: '#5580a8', ...hairFor('park'),
  },
  {
    id: 'dimarco', name: 'Sal DiMarco', nick: 'Meatball', flag: '🇮🇹',
    power: 4, speed: 2, chin: 6, stamina: 3, recovery: 4,
    style: 'pressure', skin: '#d9a071', trunks: '#a83232', gloves: '#702020', ...hairFor('dimarco'),
  },
  {
    id: 'tanaka', name: 'Kenji Tanaka', nick: 'Ghost', flag: '🇯🇵',
    power: 4, speed: 9, chin: 4, stamina: 9, recovery: 9,
    style: 'counter', skin: '#e8b98a', trunks: '#f5f5f5', gloves: '#c0c0c0', ...hairFor('tanaka'),
  },
  {
    id: 'brooks', name: 'Deontae Brooks', nick: 'Flash', flag: '🇯🇲',
    power: 8, speed: 8, chin: 3, stamina: 6, recovery: 6,
    style: 'out-boxer', skin: '#7a4a1e', trunks: '#7d2ea0', gloves: '#4d1566', ...hairFor('brooks'),
  },
  {
    id: 'vega', name: 'Ray Vega', nick: 'Silk', flag: '🇲🇽',
    power: 5, speed: 10, chin: 5, stamina: 8, recovery: 7,
    style: 'out-boxer', skin: '#b57e52', trunks: '#0f7a3d', gloves: '#0b5c2e', ...hairFor('vega'),
  },
  {
    id: 'malone', name: 'Sonny Malone', nick: 'Lights Out', flag: '🇬🇧',
    power: 10, speed: 4, chin: 6, stamina: 5, recovery: 5,
    style: 'slugger', skin: '#8d5524', trunks: '#111111', gloves: '#222222', ...hairFor('malone'),
  },
  {
    id: 'okafor', name: 'Ade Okafor', nick: 'The Lion', flag: '🇳🇬',
    power: 7, speed: 7, chin: 7, stamina: 7, recovery: 7,
    style: 'pressure', skin: '#6b4423', trunks: '#0a7d40', gloves: '#f0f0f0', ...hairFor('okafor'),
  },
  {
    id: 'duran', name: 'Mike Duran', nick: 'Iron', flag: '🇺🇸',
    power: 9, speed: 5, chin: 8, stamina: 6, recovery: 6,
    style: 'slugger', skin: '#c68863', trunks: '#c0392b', gloves: '#8e1600', ...hairFor('duran'),
  },
  {
    id: 'petrov', name: 'Viktor Petrov', nick: 'The Wall', flag: '🇺🇦',
    power: 6, speed: 5, chin: 9, stamina: 8, recovery: 6,
    style: 'counter', skin: '#e6b088', trunks: '#e0a800', gloves: '#a07500', ...hairFor('petrov'),
  },
  {
    id: 'rossi', name: 'Marco Rossi', nick: 'Il Toro', flag: '🇮🇹',
    power: 7, speed: 4, chin: 10, stamina: 7, recovery: 8,
    style: 'pressure', skin: '#d9a071', trunks: '#1550a0', gloves: '#0d3670', ...hairFor('rossi'),
  },
];

function fighterRating(def) {
  const avg = (def.power + def.speed + def.chin + def.stamina + def.recovery) / 5;
  return Math.round(avg * 10) / 10;
}
