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
  getHint,
  setDebugTarget,
  getStartToken,
  getDailyTarget,
  IMAGE_BASE_URL,
} from "./services/api";

// Utilidades de estadísticas  
const STATS_KEY = (difficulty) => `yakuzadle_stats_${difficulty}`;
const MAX_ATTEMPTS = 15;

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

// Actualiza las estadísticas al terminar una partida  
function updateStats(difficulty, won, attempts) {
  const stats = loadStats(difficulty);
  const today = new Date().toISOString().split("T")[0];

  // Evitar contar la misma partida dos veces si el jugador recarga  
  if (stats.lastPlayedDate === today) return stats;

  stats.gamesPlayed += 1;
  stats.lastPlayedDate = today;

  // Actualiza estadísticas según si ganó  
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
  const [usedHintFields, setUsedHintFields] = useState(initialSession?.usedHintFields ?? []); // Campos de pistas ya utilizados  
  const [hints, setHints] = useState(initialSession?.hints ?? []); // Lista de pistas obtenidas  
  const [toast, setToast] = useState({ message: "", show: false }); // Estado para mostrar mensajes de error o información al jugador  
  const [characterNames, setCharacterNames] = useState([]); // Lista de nombres de personajes cargada desde la API  
  const [difficulty, setDifficulty] = useState("normal"); // Dificultad actual del juego (normal o kiwami)  

  const [infiniteTarget, setInfiniteTarget] = useState(null); // Nombre del personaje objetivo en modo infinito  

  const [stats, setStats] = useState(() => loadStats("normal")); // Estadísticas del jugador para la dificultad actual    
  const [showStats, setShowStats] = useState(false); // Controla la visibilidad del modal de estadísticas    
  const [isLoading, setIsLoading] = useState(false); // Controla si la lista de personajes se está cargando  
  const [gameLost, setGameLost] = useState(initialSession?.gameLost ?? false); // Controla si el jugador ha perdido

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
    if (newDifficulty === difficulty) return;
    setDifficulty(newDifficulty);
    setStats(loadStats(newDifficulty));
    setGuesses([]);
    setGameWon(false);
    setGameLost(false);
    setShowCelebration(false);
    setAttempts(0);
    setTargetCharacter(null);
    setUsedHintFields([]);
    setHints([]);

    if (newDifficulty === "infinite") {
      const randomName = pickRandomInfiniteTarget(characterNames);
      setInfiniteTarget(randomName);
    } else {
      setInfiniteTarget(null);
      const session = loadSession(newDifficulty);
      setGuesses(session?.guesses ?? []);
      setGameWon(session?.gameWon ?? false);
      setGameLost(session?.gameLost ?? false);
      setAttempts(session?.attempts ?? 0);
      setTargetCharacter(session?.targetCharacter ?? null);
      setUsedHintFields(session?.usedHintFields ?? []);
      setHints(session?.hints ?? []);
    }
  };

  // Función para seleccionar un personaje objetivo aleatorio en modo infinito  
  function pickRandomInfiniteTarget(names) {
    if (!names || names.length === 0) return null;
    return names[Math.floor(Math.random() * names.length)];
  }

  // Maneja el cambio de objetivo en modo infinito  
  const handleChangeTarget = () => {
    const randomName = pickRandomInfiniteTarget(characterNames);
    setInfiniteTarget(randomName);
    setGuesses([]);
    setGameWon(false);
    setGameLost(false);
    setShowCelebration(false);
    setAttempts(0);
    setTargetCharacter(null);
    setUsedHintFields([]);
    setHints([]);
  };

  // Revela el personaje objetivo del día usando /start + /daily-target  
  const revealTarget = async () => {
    try {
      const backendDifficulty = difficulty === "infinite" ? "kiwami" : difficulty;
      const { token } = await getStartToken(backendDifficulty);
      const target = await getDailyTarget(backendDifficulty, token);
      setTargetCharacter(target);
      return target;
    } catch (error) {
      console.error("Error revealing target:", error);
      return null;
    }
  };

  // Maneja el intento de adivinar un personaje  
  const handleGuess = async (name) => {
    // Evitar hacer múltiples peticiones si no se ha cargado la lista de personajes o si se está procesando otro guess  
    if (isLoading) return;
    setIsLoading(true);
    try {
      // Llamada al backend: en modo infinito se pasa el objetivo aleatorio; si no, se usa el diario  
      const data = await guessCharacter(
        name,
        difficulty === "infinite" ? "kiwami" : difficulty,
        difficulty === "infinite" ? infiniteTarget : null
      );

      // La corrección la decide el servidor (campo `correct` de /guess)  
      const isCorrect = data.correct;

      const newAttempts = attempts + 1;
      const newGuesses = [...guesses, { name: data.character.name, character: data.character, comparison: data.result }];
      setGuesses(newGuesses);
      setAttempts(newAttempts);

      // ¿Se ha perdido por agotar los intentos sin acertar?  
      const isLoss = !isCorrect && newAttempts >= MAX_ATTEMPTS;

      let revealed = targetCharacter;
      if (isLoss) {
        revealed = await revealTarget();
      }

      saveSession(difficulty, {
        guesses: newGuesses,
        attempts: newAttempts,
        gameWon: isCorrect,
        gameLost: isLoss,
        // Se persiste el objetivo si se acierta o si se pierde  
        targetCharacter: isCorrect ? data.target : (isLoss ? revealed : targetCharacter),
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
      } else if (isLoss && !gameLost) {
        setGameLost(true);
        const updated = updateStats(difficulty, false, newAttempts);
        setStats(updated);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error) {
      console.error("Error submitting guess:", error);
      showToastMessage("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };


  // Maneja la rendición: completa el límite de intentos y termina la partida como derrota  
  const handleSurrender = async () => {
    if (gameWon || gameLost) return;
    setAttempts(MAX_ATTEMPTS);
    setGameLost(true);
    const revealed = await revealTarget();
    const updated = updateStats(difficulty, false, MAX_ATTEMPTS);
    setStats(updated);
    saveSession(difficulty, {
      guesses,
      attempts: MAX_ATTEMPTS,
      gameWon: false,
      gameLost: true,
      targetCharacter: revealed,
      usedHintFields,
      hints,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  // Reinicia el juego para jugar de nuevo  
  const handlePlayAgain = () => {
    setGuesses([]);
    setGameWon(false);
    setGameLost(false);
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
      const data = await getHint(
        difficulty === "infinite" ? "kiwami" : difficulty,
        allUsed,
        difficulty === "infinite" ? infiniteTarget : null
      );

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
        gameLost,
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
            <button
              className={`difficulty-btn ${difficulty === "infinite" ? "active" : ""}`}
              onClick={() => handleDifficultyChange("infinite")}
            >
              Infinite
            </button>
          </div>

          {!gameWon && !gameLost ? (
            <GuessInput
              onGuess={handleGuess}
              onError={showToastMessage}
              difficulty={difficulty}
              guessedNames={guesses.map(g => g.name)}
              isLoading={isLoading}
            />
          ) : gameLost ? (
            <div className="surrender-screen">
              <h2>You lost!</h2>
              <p>The character was:</p>
              {targetCharacter?.images?.[0] && (
                <img
                  className="surrender-character-image"
                  src={`${IMAGE_BASE_URL}${targetCharacter.images[0]}`}
                  alt={targetCharacter.name}
                />
              )}
              <p className="surrender-character-name">{targetCharacter?.name}</p>
              {difficulty === "infinite" && (
                <button className="guess-button" onClick={handleChangeTarget}>
                  🔄 Change Target
                </button>
              )}
            </div>
          ) : showCelebration && difficulty !== "infinite" ? (
            <Celebration onPlayAgain={handlePlayAgain} />
          ) : gameWon && difficulty === "infinite" ? (
            <div className="surrender-screen">
              <h2>You got it!</h2>
              <p>The character was:</p>
              {targetCharacter?.images?.[0] && (
                <img
                  className="surrender-character-image"
                  src={`${IMAGE_BASE_URL}${targetCharacter.images[0]}`}
                  alt={targetCharacter.name}
                />
              )}
              <p className="surrender-character-name">{targetCharacter?.name}</p>
              <button className="guess-button" onClick={handleChangeTarget}>
                🔄 Change Target
              </button>
            </div>
          ) : (
            <div className="waiting-message">🎉 You got it! 🎉</div>
          )}
        </header>

        {attempts > 0 && (
          <div className="attempts-counter">
            Attempts: {attempts}/{MAX_ATTEMPTS}
          </div>
        )}

        {attempts > 0 && !gameWon && (
          <div className="action-bar">
            <button className="hint-button" onClick={handleHint}>
              💡 Hint
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
    </div>
  );
}

export default App;