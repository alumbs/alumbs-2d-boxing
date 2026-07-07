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
  {
    id: 'flint', name: 'Cody Flint', nick: 'Sparky', flag: '🇺🇸',
    power: 4, speed: 4, chin: 4, stamina: 5, recovery: 4,
    style: 'slugger', skin: '#e8b088', trunks: '#c05a1a', gloves: '#7a3810', ...hairFor('flint'),
  },
  {
    id: 'abara', name: 'Emeka Abara', nick: 'Hammer', flag: '🇳🇬',
    power: 6, speed: 3, chin: 5, stamina: 4, recovery: 4,
    style: 'slugger', skin: '#5c3a1e', trunks: '#1a7a4a', gloves: '#0d4d2e', ...hairFor('abara'),
  },
  {
    id: 'santos', name: 'Beto Santos', nick: 'Relámpago', flag: '🇧🇷',
    power: 4, speed: 6, chin: 4, stamina: 6, recovery: 5,
    style: 'out-boxer', skin: '#b57e52', trunks: '#f0d000', gloves: '#b09800', ...hairFor('santos'),
  },
  {
    id: 'novak', name: 'Emil Novak', nick: 'The Clinic', flag: '🇨🇿',
    power: 4, speed: 6, chin: 6, stamina: 6, recovery: 5,
    style: 'counter', skin: '#e6c8a0', trunks: '#2a4d8a', gloves: '#182f5a', ...hairFor('novak'),
  },
  {
    id: 'reyes', name: 'Chuy Reyes', nick: 'El Gallo', flag: '🇲🇽',
    power: 6, speed: 5, chin: 5, stamina: 6, recovery: 5,
    style: 'pressure', skin: '#c68863', trunks: '#c0392b', gloves: '#7d1f16', ...hairFor('reyes'),
  },
  {
    id: 'kane', name: 'Del Kane', nick: 'Southpaw', flag: '🇦🇺',
    power: 6, speed: 6, chin: 5, stamina: 5, recovery: 5,
    style: 'out-boxer', skin: '#d9a071', trunks: '#0f5f8a', gloves: '#093f5c', ...hairFor('kane'),
  },
  {
    id: 'yamamoto', name: 'Sho Yamamoto', nick: 'Needle', flag: '🇯🇵',
    power: 5, speed: 7, chin: 5, stamina: 6, recovery: 6,
    style: 'counter', skin: '#e8c49a', trunks: '#d81f1f', gloves: '#8a1010', ...hairFor('yamamoto'),
  },
  {
    id: 'bauer', name: 'Klaus Bauer', nick: 'Panzer', flag: '🇩🇪',
    power: 7, speed: 4, chin: 7, stamina: 6, recovery: 5,
    style: 'pressure', skin: '#e8b088', trunks: '#333333', gloves: '#111111', ...hairFor('bauer'),
  },
  {
    id: 'costa', name: 'Nuno Costa', nick: 'Matador', flag: '🇵🇹',
    power: 6, speed: 7, chin: 5, stamina: 6, recovery: 6,
    style: 'out-boxer', skin: '#b57e52', trunks: '#0a7d40', gloves: '#c0392b', ...hairFor('costa'),
  },
  {
    id: 'dubois', name: 'Yannick Dubois', nick: 'Le Chat', flag: '🇫🇷',
    power: 5, speed: 8, chin: 6, stamina: 7, recovery: 6,
    style: 'counter', skin: '#8d5524', trunks: '#1a1a6a', gloves: '#0d0d40', ...hairFor('dubois'),
  },
  {
    id: 'walsh', name: 'Fergus Walsh', nick: 'Bulldog', flag: '🇮🇪',
    power: 7, speed: 5, chin: 7, stamina: 7, recovery: 6,
    style: 'pressure', skin: '#e8b088', trunks: '#e07a1a', gloves: '#a05010', ...hairFor('walsh'),
  },
  {
    id: 'ivanov', name: 'Gleb Ivanov', nick: 'Winter', flag: '🇷🇺',
    power: 8, speed: 5, chin: 7, stamina: 6, recovery: 6,
    style: 'slugger', skin: '#e6c8a0', trunks: '#b0b0c0', gloves: '#707080', ...hairFor('ivanov'),
  },
  {
    id: 'mensah', name: 'Kwame Mensah', nick: 'Thunder', flag: '🇬🇭',
    power: 8, speed: 6, chin: 6, stamina: 6, recovery: 6,
    style: 'slugger', skin: '#5c3a1e', trunks: '#e0c000', gloves: '#c0392b', ...hairFor('mensah'),
  },
  {
    id: 'romero', name: 'Tavo Romero', nick: 'Cyclone', flag: '🇦🇷',
    power: 6, speed: 8, chin: 6, stamina: 7, recovery: 7,
    style: 'out-boxer', skin: '#c68863', trunks: '#5aa0d8', gloves: '#2d6fa8', ...hairFor('romero'),
  },
  {
    id: 'haddad', name: 'Sami Haddad', nick: 'Scorpion', flag: '🇱🇧',
    power: 7, speed: 7, chin: 6, stamina: 7, recovery: 7,
    style: 'counter', skin: '#c68863', trunks: '#8a0f5a', gloves: '#5c0a3c', ...hairFor('haddad'),
  },
  {
    id: 'oduya', name: 'Femi Oduya', nick: 'Blade', flag: '🇳🇬',
    power: 7, speed: 8, chin: 6, stamina: 7, recovery: 7,
    style: 'out-boxer', skin: '#6b4423', trunks: '#0f7a3d', gloves: '#f0f0f0', ...hairFor('oduya'),
  },
  {
    id: 'blackwood', name: 'Errol Blackwood', nick: 'Nightmare', flag: '🇯🇲',
    power: 9, speed: 6, chin: 6, stamina: 6, recovery: 6,
    style: 'slugger', skin: '#5c3a1e', trunks: '#1a1a1a', gloves: '#3a7a1a', ...hairFor('blackwood'),
  },
  {
    id: 'lindqvist', name: 'Anders Lindqvist', nick: 'The Machine', flag: '🇸🇪',
    power: 7, speed: 7, chin: 8, stamina: 7, recovery: 7,
    style: 'counter', skin: '#e8c8a8', trunks: '#0060c0', gloves: '#f0d000', ...hairFor('lindqvist'),
  },
  {
    id: 'delacruz', name: 'Ramon De La Cruz', nick: 'Huracán', flag: '🇩🇴',
    power: 8, speed: 7, chin: 7, stamina: 7, recovery: 7,
    style: 'pressure', skin: '#b57e52', trunks: '#c0392b', gloves: '#7d1f16', ...hairFor('delacruz'),
  },
  {
    id: 'kowalski', name: 'Piotr Kowalski', nick: 'Granite', flag: '🇵🇱',
    power: 7, speed: 6, chin: 10, stamina: 8, recovery: 7,
    style: 'counter', skin: '#e8b088', trunks: '#d01818', gloves: '#f5f5f5', ...hairFor('kowalski'),
  },
  {
    id: 'ssempa', name: 'Isaac Ssempa', nick: 'The Crane', flag: '🇺🇬',
    power: 7, speed: 9, chin: 7, stamina: 8, recovery: 7,
    style: 'out-boxer', skin: '#6b4423', trunks: '#f0c000', gloves: '#000000', ...hairFor('ssempa'),
  },
  {
    id: 'ferreira', name: 'Diego Ferreira', nick: 'Jaguar', flag: '🇧🇷',
    power: 8, speed: 8, chin: 7, stamina: 8, recovery: 7,
    style: 'pressure', skin: '#8d5524', trunks: '#0a8a3a', gloves: '#f0d000', ...hairFor('ferreira'),
  },
  {
    id: 'volkov', name: 'Roman Volkov', nick: 'The Bear', flag: '🇷🇺',
    power: 10, speed: 5, chin: 8, stamina: 7, recovery: 6,
    style: 'slugger', skin: '#e6c8a0', trunks: '#8a1010', gloves: '#4a0808', ...hairFor('volkov'),
  },
  {
    id: 'nakamura', name: 'Rei Nakamura', nick: 'Mirror', flag: '🇯🇵',
    power: 7, speed: 10, chin: 7, stamina: 8, recovery: 8,
    style: 'counter', skin: '#e8c49a', trunks: '#101010', gloves: '#c0c0c0', ...hairFor('nakamura'),
  },
  {
    id: 'campbell', name: 'Dexter Campbell', nick: 'Slick Rick', flag: '🇺🇸',
    power: 8, speed: 9, chin: 7, stamina: 8, recovery: 8,
    style: 'out-boxer', skin: '#7a4a1e', trunks: '#7d2ea0', gloves: '#d0b000', ...hairFor('campbell'),
  },
  {
    id: 'adeyemi', name: 'Tunde Adeyemi', nick: 'Earthquake', flag: '🇳🇬',
    power: 10, speed: 7, chin: 8, stamina: 7, recovery: 7,
    style: 'slugger', skin: '#5c3a1e', trunks: '#0f7a3d', gloves: '#c0392b', ...hairFor('adeyemi'),
  },
  {
    id: 'moreau', name: 'Julien Moreau', nick: 'The Artist', flag: '🇫🇷',
    power: 8, speed: 9, chin: 8, stamina: 8, recovery: 8,
    style: 'out-boxer', skin: '#d9a071', trunks: '#0040a0', gloves: '#f5f5f5', ...hairFor('moreau'),
  },
  {
    id: 'castillo', name: 'Nando Castillo', nick: 'El Rey', flag: '🇲🇽',
    power: 9, speed: 8, chin: 8, stamina: 8, recovery: 8,
    style: 'pressure', skin: '#c68863', trunks: '#008040', gloves: '#c0392b', ...hairFor('castillo'),
  },
  {
    id: 'thompson', name: 'Marcus Thompson', nick: 'The General', flag: '🇺🇸',
    power: 9, speed: 8, chin: 9, stamina: 8, recovery: 8,
    style: 'counter', skin: '#7a4a1e', trunks: '#101820', gloves: '#c0a000', ...hairFor('thompson'),
  },
  {
    id: 'king', name: 'Julius King', nick: 'His Majesty', flag: '🇺🇸',
    power: 10, speed: 9, chin: 9, stamina: 9, recovery: 9,
    style: 'pressure', skin: '#5c3a1e', trunks: '#d4af37', gloves: '#1a1a1a', ...hairFor('king'),
  },
];

function fighterRating(def) {
  const avg = (def.power + def.speed + def.chin + def.stamina + def.recovery) / 5;
  return Math.round(avg * 10) / 10;
}
