// Utilidades de estadísticas (extraídas de App.jsx para poder probarlas).
// Todas las fechas son UTC, igual que el personaje diario del backend.

const STATS_KEY = (difficulty) => `yakuzadle_stats_${difficulty}`;

export const defaultStats = () => ({
  gamesPlayed: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: null,
  guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, "7+": 0 },
});

const dateStr = (d) => d.toISOString().split("T")[0];

function yesterdayStr(now) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return dateStr(d);
}

// El modo infinito no tiene "día": se puede jugar cualquier número de partidas.
const isDaily = (difficulty) => difficulty !== "infinite";

export function loadStats(difficulty, now = new Date()) {
  try {
    const raw = localStorage.getItem(STATS_KEY(difficulty));
    const stats = raw ? { ...defaultStats(), ...JSON.parse(raw) } : defaultStats();

    // FIX: si no se jugó ni hoy ni ayer, la racha de los modos diarios está rota.
    if (
      isDaily(difficulty) &&
      stats.lastPlayedDate &&
      stats.lastPlayedDate !== dateStr(now) &&
      stats.lastPlayedDate !== yesterdayStr(now)
    ) {
      stats.currentStreak = 0;
    }
    return stats;
  } catch {
    return defaultStats();
  }
}

export function saveStats(difficulty, stats) {
  try {
    localStorage.setItem(STATS_KEY(difficulty), JSON.stringify(stats));
  } catch {
    // localStorage no disponible (modo privado, cuota llena...): se ignora
  }
}

// Actualiza las estadísticas al terminar una partida
export function updateStats(difficulty, won, attempts, now = new Date()) {
  const stats = loadStats(difficulty, now); // ya devuelve la racha a 0 si estaba rota
  const today = dateStr(now);

  // FIX: solo los modos diarios cuentan una partida por día. En infinito se cuentan todas.
  if (isDaily(difficulty) && stats.lastPlayedDate === today) return stats;

  stats.gamesPlayed += 1;
  stats.lastPlayedDate = today;

  if (won) {
    stats.wins += 1;
    stats.currentStreak += 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    const bucket = attempts <= 6 ? String(attempts) : "7+";
    stats.guessDistribution[bucket] = (stats.guessDistribution[bucket] || 0) + 1;
  } else {
    stats.currentStreak = 0;
  }

  saveStats(difficulty, stats);
  return stats;
}
