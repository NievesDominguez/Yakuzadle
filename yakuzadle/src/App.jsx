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

const [isLoading, setIsLoading] = useState(false);  // Controla si la lista de personajes se está cargando

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

  const [guesses, setGuesses] = useState(initialSession?.guesses ?? []);
  const [targetCharacter, setTargetCharacter] = useState(initialSession?.targetCharacter ?? null);
  const [gameWon, setGameWon] = useState(initialSession?.gameWon ?? false);
  const [showCelebration, setShowCelebration] = useState(false); // no persistir, es visual  
  const [attempts, setAttempts] = useState(initialSession?.attempts ?? 0);
  const [gameSurrendered, setGameSurrendered] = useState(initialSession?.gameSurrendered ?? false);
  const [usedHintFields, setUsedHintFields] = useState(initialSession?.usedHintFields ?? []);
  const [hints, setHints] = useState(initialSession?.hints ?? []);
  const [toast, setToast] = useState({ message: "", show: false });
  const [characterNames, setCharacterNames] = useState([]);
  const [difficulty, setDifficulty] = useState("normal");

  // Estadísticas del jugador para la dificultad actual  
  const [stats, setStats] = useState(() => loadStats("normal"));
  // Controla la visibilidad del modal de estadísticas  
  const [showStats, setShowStats] = useState(false);

  // Carga inicial de la lista de personajes con caché de 24h  
  useEffect(() => {
    const cached = localStorage.getItem("characterListV3");
    const cachedAt = localStorage.getItem("characterListV3_cachedAt");
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const isExpired = !cachedAt || (Date.now() - Number(cachedAt)) > ONE_DAY_MS;

    if (cached && !isExpired) {
      setCharacterNames(JSON.parse(cached).map(item => item.name));
    } else {
      getCharacterList()
        .then(data => {
          localStorage.setItem("characterListV3", JSON.stringify(data));
          localStorage.setItem("characterListV3_cachedAt", String(Date.now()));
          setCharacterNames(data.map(item => item.name));
        })
        .catch(() => showToastMessage("Error loading character list."));
    }
  }, []);

  const showToastMessage = (msg) => {
    setToast({ message: msg, show: true });
  };

  const handleDifficultyChange = (newDifficulty) => {
    if (newDifficulty === difficulty) return;
    setDifficulty(newDifficulty);
    setStats(loadStats(newDifficulty));

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

  const handleGuess = async (name) => {
    // Evitar hacer múltiples peticiones si no se ha cargado la lista de personajes o sise está procesando otro guess
    if (isLoading) return;
    setIsLoading(true);
    try {
      const data = await guessCharacter(name, difficulty);

      if (data.error) {
        showToastMessage("Character not found");
        return;
      }

      if (!targetCharacter) {
        setTargetCharacter(data.target);
      }

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

  const handleSurrender = async () => {
    if (targetCharacter) {
      const updated = updateStats(difficulty, false, attempts);
      setStats(updated);
      setGameSurrendered(true);

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

  const handleHint = async () => {
    const HINT_FIELDS = ["affiliation", "nationality", "games", "fighting_style", "height", "date_of_birth"];
    const correctFields = HINT_FIELDS.filter((field) =>
      guesses.some((g) => g.comparison?.[field] === "green")
    );
    const allUsed = [...new Set([...usedHintFields, ...correctFields])];

    try {
      const data = await getHint(difficulty, allUsed);

      if (data.noHints) {
        showToastMessage("No hints available");
        return;
      }

      const displayValue = Array.isArray(data.value) ? data.value.join(", ") : data.value;

      const fieldLabels = {
        affiliation: "Affiliation",
        nationality: "Nationality/Heritage",
        games: "Games",
        fighting_style: "Fighting Style",
        height: "Height",
        date_of_birth: "Birthdate",
      };

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