// yakuzadle/src/App.jsx  
import { useState, useEffect } from "react";
import GuessInput from "./components/GuessInput";
import ResultTable from "./components/ResultTable";
import Celebration from "./components/Celebration";
import Toast from "./components/Toast";
import "./styles/main.css";

import StatsModal from "./components/StatsModal";
import {
  guessCharacter,
  getCharacterList,
  getDailyTarget,
  getHint,
  setDebugTarget,
  IMAGE_BASE_URL,
} from "./services/api";

// Utilidades de estadísticas
const STATS_KEY = (difficulty) => `yakuzadle_stats_${difficulty}`;

const CACHE_KEY = `characterList_${import.meta.env.VITE_BUILD_HASH || "dev"}`;  
const CACHE_KEY_AT = `${CACHE_KEY}_cachedAt`;

const defaultStats = () => ({
  gamesPlayed: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: null,
  guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, "7+": 0 },
});

function loadStats(difficulty) {
  try {
    const raw = localStorage.getItem(STATS_KEY(difficulty));
    return raw ? { ...defaultStats(), ...JSON.parse(raw) } : defaultStats();
  } catch {
    return defaultStats();
  }
}

function saveStats(difficulty, stats) {
  localStorage.setItem(STATS_KEY(difficulty), JSON.stringify(stats));
}

// Actualiza las estadísticas al terminar una partida.  
// won: true si ganó, false si se rindió. attempts: número de intentos (solo relevante si won).  
function updateStats(difficulty, won, attempts) {
  const stats = loadStats(difficulty);
  const today = new Date().toISOString().split("T")[0];

  // Evitar contar la misma partida dos veces si el jugador recarga  
  if (stats.lastPlayedDate === today) return stats;

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


// Funciones para manejar sesión de juego con persistencia en localStorage.
const SESSION_KEY = (difficulty) => {
  const today = new Date().toISOString().split("T")[0];
  return `yakuzadle_session_${difficulty}_${today}`;
};

function loadSession(difficulty) {
  try {
    const raw = localStorage.getItem(SESSION_KEY(difficulty));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(difficulty, state) {
  try {
    localStorage.setItem(SESSION_KEY(difficulty), JSON.stringify(state));
  } catch { }
}



function App() {
  const initialSession = loadSession("normal");

  const [guesses, setGuesses] = useState(initialSession?.guesses ?? []); // Lista de intentos del jugador
  const [targetCharacter, setTargetCharacter] = useState(initialSession?.targetCharacter ?? null); // Personaje objetivo del día
  const [gameWon, setGameWon] = useState(initialSession?.gameWon ?? false); // Controla si el jugador ha ganado
  const [showCelebration, setShowCelebration] = useState(false); // Controla la animación de celebración al ganar
  const [attempts, setAttempts] = useState(initialSession?.attempts ?? 0); // Número de intentos realizados
  const [gameSurrendered, setGameSurrendered] = useState(initialSession?.gameSurrendered ?? false); // Controla si el jugador se ha rendido
  const [usedHintFields, setUsedHintFields] = useState(initialSession?.usedHintFields ?? []); // Campos de pistas ya utilizados
  const [hints, setHints] = useState(initialSession?.hints ?? []); // Lista de pistas obtenidas
  const [toast, setToast] = useState({ message: "", show: false }); // Estado para mostrar mensajes de error o información al jugador
  const [characterNames, setCharacterNames] = useState([]); // Lista de nombres de personajes cargada desde la API
  const [difficulty, setDifficulty] = useState("normal"); // Dificultad actual del juego (normal o kiwami)

  const [stats, setStats] = useState(() => loadStats("normal")); // Estadísticas del jugador para la dificultad actual  
  const [showStats, setShowStats] = useState(false); // Controla la visibilidad del modal de estadísticas  
  const [isLoading, setIsLoading] = useState(false); // Controla si la lista de personajes se está cargando

  // Carga inicial de la lista de personajes con caché de 24h  
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedAt = localStorage.getItem(CACHE_KEY_AT);
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const isExpired = !cachedAt || (Date.now() - Number(cachedAt)) > ONE_DAY_MS;

    // Si hay datos de los personajes en caché y no han expirado, se usan
    if (cached && !isExpired) {
      setCharacterNames(JSON.parse(cached).map(item => item.name));
    }
    // Si no, se hace la petición a la API para obtener la lista de personajes y se guarda en caché
    else {
      getCharacterList()
        .then(data => {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
          localStorage.setItem(CACHE_KEY_AT, String(Date.now()));
          setCharacterNames(data.map(item => item.name));
        })
        .catch(() => showToastMessage("Error loading character list."));
    }
  }, []);

  // Función para mostrar mensajes de error o información al jugador
  const showToastMessage = (msg) => {
    setToast({ message: msg, show: true });
  };

  // Maneja el cambio de dificultad del juego
  const handleDifficultyChange = (newDifficulty) => {
    // Evita cambiar a la misma dificultad
    if (newDifficulty === difficulty) return;
    setDifficulty(newDifficulty);
    setStats(loadStats(newDifficulty));

    // Carga la sesión guardada para la nueva dificultad, si existe, o reinicia el estado del juego
    const session = loadSession(newDifficulty);
    setGuesses(session?.guesses ?? []);
    setGameWon(session?.gameWon ?? false);
    setGameSurrendered(session?.gameSurrendered ?? false);
    setShowCelebration(false);
    setAttempts(session?.attempts ?? 0);
    setTargetCharacter(session?.targetCharacter ?? null);
    setUsedHintFields(session?.usedHintFields ?? []);
    setHints(session?.hints ?? []);
  };

  // Maneja el intento de adivinar un personaje
  const handleGuess = async (name) => {
    // Evitar hacer múltiples peticiones si no se ha cargado la lista de personajes o si se está procesando otro guess
    if (isLoading) return;
    setIsLoading(true);
    try {
      const data = await guessCharacter(name, difficulty);

      // Maneja el caso en que la API devuelve un error (personaje no encontrado)
      if (data.error) {
        showToastMessage("Character not found");
        return;
      }

      // Si no se ha establecido el personaje objetivo, se establece con el que devuelve la API
      if (!targetCharacter) {
        setTargetCharacter(data.target);
      }

      // Comprueba si el intento es correcto comparando el nombre del personaje con el objetivo y suma el intento
      const isCorrect = data.character.name === data.target.name;
      const newAttempts = attempts + 1;
      const newGuesses = [...guesses, { name: data.character.name, character: data.character, comparison: data.result }];
      setGuesses(newGuesses);
      setAttempts(newAttempts);
      saveSession(difficulty, {
        guesses: newGuesses,
        attempts: newAttempts,
        gameWon: isCorrect,
        gameSurrendered: false,
        targetCharacter: data.target,
        usedHintFields,
        hints,
      });

      // Si el intento es correcto y el juego no se ha ganado aún, se actualizan las estadísticas y se muestra la celebración
      if (isCorrect && !gameWon) {
        setGameWon(true);
        const updated = updateStats(difficulty, true, newAttempts);
        setStats(updated);
        const totalAnimationTime = 4000;
        setTimeout(() => {
          setShowCelebration(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, totalAnimationTime);
      }
    } catch (error) {
      console.error("Error submitting guess:", error);
      showToastMessage("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Maneja la acción de rendirse
  const handleSurrender = async () => {
    if (targetCharacter) {
      const updated = updateStats(difficulty, false, attempts);
      setStats(updated);
      setGameSurrendered(true);

      // Guardar la sesión con el estado de rendición
      saveSession(difficulty, {
        guesses,
        attempts,
        gameWon: false,
        gameSurrendered: true,
        targetCharacter: targetCharacter,
        usedHintFields,
        hints,
      });
      return;
    }
    try {
      const data = await getDailyTarget(difficulty);
      setTargetCharacter(data);
      const updated = updateStats(difficulty, false, attempts);
      setStats(updated);
      setGameSurrendered(true);

      // Guardar la sesión con el estado de rendición
      saveSession(difficulty, {
        guesses,
        attempts,
        gameWon: false,
        gameSurrendered: true,
        targetCharacter: data,
        usedHintFields,
        hints,
      });
    } catch (error) {
      console.error("Error fetching daily target on surrender:", error);
      showToastMessage("No se pudo obtener el personaje del día.");
    }
  };

  // Reinicia el juego para jugar de nuevo
  const handlePlayAgain = () => {
    setGuesses([]);
    setGameWon(false);
    setGameSurrendered(false);
    setShowCelebration(false);
    setAttempts(0);
    setTargetCharacter(null);
    setUsedHintFields([]);
    setHints([]);
  };

  // Función para establecer un nuevo objetivo aleatorio en modo debug
  const handleDebugNewTarget = async () => {
    if (characterNames.length === 0) {
      showToastMessage("No characters loaded");
      return;
    }
    const randomName = characterNames[Math.floor(Math.random() * characterNames.length)];
    try {
      await setDebugTarget(randomName, difficulty);
      setGuesses([]);
      setGameWon(false);
      setGameSurrendered(false);
      setShowCelebration(false);
      setAttempts(0);
      setTargetCharacter(null);
      showToastMessage(`New target set: ${randomName}`);
    } catch (error) {
      console.error("Error setting debug target:", error);
      showToastMessage("Failed to set debug target");
    }
  };

  // Maneja la solicitud de una pista
  const handleHint = async () => {
    // Campos de pistas posibles
    const HINT_FIELDS = ["affiliation", "nationality", "games", "fighting_style", "height", "date_of_birth"];
    // Filtra los campos de pistas que ya han sido utilizados o que ya se han adivinado correctamente
    const correctFields = HINT_FIELDS.filter((field) =>
      guesses.some((g) => g.comparison?.[field] === "green")
    );
    const allUsed = [...new Set([...usedHintFields, ...correctFields])];

    try {
      const data = await getHint(difficulty, allUsed);

      // Si todos los campos de pistas han sido utilizados, muestra un mensaje y no solicita más pistas
      if (data.noHints) {
        showToastMessage("No hints available");
        return;
      }

      // Muestra el valor de la pista, ya sea como un array o un string
      const displayValue = Array.isArray(data.value) ? data.value.join(", ") : data.value;

      const fieldLabels = {
        affiliation: "Affiliation",
        nationality: "Nationality/Heritage",
        games: "Games",
        fighting_style: "Fighting Style",
        height: "Height",
        date_of_birth: "Birthdate",
      };

      // Actualiza los campos de pistas utilizados y las pistas obtenidas, y guarda la sesión
      const newUsedHintFields = [...usedHintFields, data.field];
      const newHints = [...hints, { field: fieldLabels[data.field], value: displayValue }];
      setUsedHintFields(newUsedHintFields);
      setHints(newHints);
      saveSession(difficulty, {
        guesses,
        attempts,
        gameWon,
        gameSurrendered,
        targetCharacter,
        usedHintFields: newUsedHintFields,
        hints: newHints,
      });
    } catch (error) {
      console.error("Error fetching hint:", error);
      showToastMessage("Could not get hint.");
    }
  };


  return (
    <div className="page">
      {showStats && (
        <StatsModal
          stats={stats}
          difficulty={difficulty}
          onClose={() => setShowStats(false)}
        />
      )}

      <div className="top-container">
        <header className="hero">
          <div className="header-actions">
            <button className="stats-button" onClick={() => setShowStats(true)} title="Statistics">
              📊
            </button>
          </div>
          <h1 className="title">Yakuzadle</h1>
          <p className="subtitle">Guess the daily Like a Dragon character</p>

          <p className="difficulty-label">Difficulty:</p>
          <div className="difficulty-selector">
            <button
              className={`difficulty-btn ${difficulty === "normal" ? "active" : ""}`}
              onClick={() => handleDifficultyChange("normal")}
            >
              Normal
            </button>
            <button
              className={`difficulty-btn ${difficulty === "kiwami" ? "active" : ""}`}
              data-difficulty="kiwami"
              onClick={() => handleDifficultyChange("kiwami")}
            >
              Kiwami
            </button>
          </div>

          {!gameWon && !gameSurrendered ? (
            <GuessInput
              onGuess={handleGuess}
              onError={showToastMessage}
              difficulty={difficulty}
              guessedNames={guesses.map(g => g.name)}
              isLoading={isLoading}
            />
          ) : showCelebration ? (
            <Celebration onPlayAgain={handlePlayAgain} />
          ) : gameSurrendered ? (
            <div className="surrender-screen">
              <h2>You gave up</h2>
              <p>The character was:</p>
              {targetCharacter?.images?.[0] && (
                <img
                  className="surrender-character-image"
                  /*src={`https://raw.githubusercontent.com/NievesDominguez/Yakuzadle/main/img_yakuzadle/${targetCharacter.images[0]}`}*/
                  src={`${IMAGE_BASE_URL}${targetCharacter.images[0]}`}
                  alt={targetCharacter.name}
                />
              )}
              <p className="surrender-character-name">{targetCharacter?.name}</p>
              <button className="guess-button" onClick={handlePlayAgain}>
                Play Again
              </button>
            </div>
          ) : (
            <div className="waiting-message">✨ Revealing... ✨</div>
          )}
        </header>

        {attempts > 0 && (
          <div className="attempts-counter">
            Attempts: {attempts}
            {import.meta.env.DEV && (
              <button className="debug-button" onClick={handleDebugNewTarget} title="Set random target">
                🎲
              </button>
            )}
          </div>
        )}
      </div>

      {attempts > 0 && !gameWon && !gameSurrendered && (
        <div className="action-bar">
          <button className="hint-button" onClick={handleHint}>
            💡 Hint
          </button>
          <button className="surrender-button" onClick={handleSurrender}>
            🏳️ Give up
          </button>
        </div>
      )}

      {hints.length > 0 && (
        <div className="hints-area">
          <div className="hints-container">
            {hints.map((h, i) => (
              <div key={i} className="hint-item">
                <span className="hint-label">{h.field}:</span> {h.value}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bottom-container">
        {guesses.length > 0 && (
          <main className="results">
            <ResultTable guesses={guesses} target={targetCharacter} />
          </main>
        )}
      </div>

      {toast.show && (
        <Toast
          message={toast.message}
          onClose={() => setToast({ show: false, message: "" })}
        />
      )}
    </div>
  );
}

export default App;