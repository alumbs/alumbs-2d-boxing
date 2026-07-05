// Fighter roster. Stats are 1-10.
// style: 'slugger' | 'out-boxer' | 'pressure' | 'counter'
const FIGHTERS = [
  {
    id: 'duran', name: 'Mike Duran', nick: 'Iron', flag: '🇺🇸',
    power: 9, speed: 5, chin: 8, stamina: 6, recovery: 6,
    style: 'slugger', skin: '#c68863', trunks: '#c0392b', gloves: '#8e1600',
  },
  {
    id: 'malone', name: 'Sonny Malone', nick: 'Lights Out', flag: '🇬🇧',
    power: 10, speed: 4, chin: 6, stamina: 5, recovery: 5,
    style: 'slugger', skin: '#8d5524', trunks: '#111111', gloves: '#222222',
  },
  {
    id: 'vega', name: 'Ray Vega', nick: 'Silk', flag: '🇲🇽',
    power: 5, speed: 10, chin: 5, stamina: 8, recovery: 7,
    style: 'out-boxer', skin: '#b57e52', trunks: '#0f7a3d', gloves: '#0b5c2e',
  },
  {
    id: 'okafor', name: 'Ade Okafor', nick: 'The Lion', flag: '🇳🇬',
    power: 7, speed: 7, chin: 7, stamina: 7, recovery: 7,
    style: 'pressure', skin: '#6b4423', trunks: '#0a7d40', gloves: '#f0f0f0',
  },
  {
    id: 'rossi', name: 'Marco Rossi', nick: 'Il Toro', flag: '🇮🇹',
    power: 7, speed: 4, chin: 10, stamina: 7, recovery: 8,
    style: 'pressure', skin: '#d9a071', trunks: '#1550a0', gloves: '#0d3670',
  },
  {
    id: 'tanaka', name: 'Kenji Tanaka', nick: 'Ghost', flag: '🇯🇵',
    power: 4, speed: 9, chin: 4, stamina: 9, recovery: 9,
    style: 'counter', skin: '#e8b98a', trunks: '#f5f5f5', gloves: '#c0c0c0',
  },
  {
    id: 'petrov', name: 'Viktor Petrov', nick: 'The Wall', flag: '🇺🇦',
    power: 6, speed: 5, chin: 9, stamina: 8, recovery: 6,
    style: 'counter', skin: '#e6b088', trunks: '#e0a800', gloves: '#a07500',
  },
  {
    id: 'brooks', name: 'Deontae Brooks', nick: 'Flash', flag: '🇯🇲',
    power: 8, speed: 8, chin: 3, stamina: 6, recovery: 6,
    style: 'out-boxer', skin: '#7a4a1e', trunks: '#7d2ea0', gloves: '#4d1566',
  },
];

function fighterRating(def) {
  const avg = (def.power + def.speed + def.chin + def.stamina + def.recovery) / 5;
  return Math.round(avg * 10) / 10;
}
