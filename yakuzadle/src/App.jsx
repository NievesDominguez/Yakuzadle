import { useState, useEffect, useCallback } from "react";
import GuessInput from "./components/GuessInput";
import ResultTable from "./components/ResultTable";
import Celebration from "./components/Celebration";
import Toast from "./components/Toast";
import "./styles/main.css";
import { buildShareText } from "./utils/shareResult";
import { loadStats, updateStats } from "./utils/stats";
import Countdown from "./components/Countdown";

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

const MAX_ATTEMPTS = 15;
// Intentos tras los que se gana una carga de pista
const HINT_CHARGE_THRESHOLDS = [3, 6, 9, 12];
const MAX_HINTS = 4;

const CACHE_PREFIX = "characterList_";
const CACHE_KEY = `${CACHE_PREFIX}${import.meta.env.VITE_BUILD_HASH || "dev"}`;
const CACHE_KEY_AT = `${CACHE_KEY}_cachedAt`;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Lee la lista de personajes de la caché local; devuelve null si no existe, caducó o está corrupta
function readCachedCharacters() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedAt = Number(localStorage.getItem(CACHE_KEY_AT));
    if (!cached || !cachedAt || Date.now() - cachedAt > ONE_DAY_MS) return null;
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

// Guarda la lista y borra las cachés de despliegues anteriores (cada build usa una clave distinta)
function writeCachedCharacters(data) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX) && !k.startsWith(CACHE_KEY))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_KEY_AT, String(Date.now()));
  } catch {
    // localStorage no disponible o lleno: la app sigue funcionando sin caché
  }
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
  } catch { /* sin localStorage no se persiste la sesión */ }
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
  const earnedCharges = HINT_CHARGE_THRESHOLDS.filter((t) => attempts >= t).length; // Cargas de pistas ganadas según los intentos realizados
  const availableCharges = Math.min(MAX_HINTS, earnedCharges) - hints.length; // Cargas de pistas disponibles = ganadas menos las pistas ya consumidas
  const [toast, setToast] = useState({ message: "", show: false }); // Estado para mostrar mensajes de error o información al jugador  
  // FIX (bug 1): la lista completa (nombre, imagen, alias...) se carga aquí una sola vez y se pasa a GuessInput
  const [characters, setCharacters] = useState([]);
  const characterNames = characters.map((c) => c.name); // Lista de nombres de personajes
  const [difficulty, setDifficulty] = useState("normal"); // Dificultad actual del juego (normal, kiwami o infinite)  

  const [infiniteTarget, setInfiniteTarget] = useState(null); // Nombre del personaje objetivo en modo infinito  

  const [stats, setStats] = useState(() => loadStats("normal")); // Estadísticas del jugador para la dificultad actual    
  const [showStats, setShowStats] = useState(false); // Controla la visibilidad del modal de estadísticas    
  const [isLoading, setIsLoading] = useState(false); // Controla si hay una petición en curso  
  const [gameLost, setGameLost] = useState(initialSession?.gameLost ?? false); // Controla si el jugador ha perdido

  // Funciones estables (useCallback) para que no cambien en cada render
  const showToastMessage = useCallback((msg) => {
    setToast({ message: msg, show: true });
  }, []);
  const closeToast = useCallback(() => setToast({ show: false, message: "" }), []);

  // Carga inicial de la lista de personajes con caché de 24h
  // Las dependencias son estables y no hay reintentos en cascada: como mucho una petición por montaje, y si falla se avisa una sola vez
  useEffect(() => {
    let cancelled = false;

    const cached = readCachedCharacters();
    if (cached) {
      setCharacters(cached);
      return;
    }

    getCharacterList()
      .then((data) => {
        if (cancelled) return;
        setCharacters(data);
        writeCachedCharacters(data);
      })
      .catch(() => {
        if (!cancelled) showToastMessage("Error loading character list.");
      });

    return () => {
      cancelled = true;
    };
  }, [showToastMessage]);

  // Persiste la sesión salvo en modo infinito (no se reanuda, su objetivo es aleatorio en el cliente)
  const persistSession = (state) => {
    if (difficulty !== "infinite") saveSession(difficulty, state);
  };

  // Maneja el cambio de dificultad del juego  
  const handleDifficultyChange = (newDifficulty) => {
    if (newDifficulty === difficulty) return;

    // Sin lista cargada no hay objetivo aleatorio: antes se comparaba en silencio contra el diario
    if (newDifficulty === "infinite" && characterNames.length === 0) {
      showToastMessage("Character list not loaded yet. Try again in a moment.");
      return;
    }

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

  // Revela el personaje objetivo.
  // FIX (bug 3): en modo infinito el objetivo lo eligió el cliente (infiniteTarget), así que se
  // construye con los datos de la lista. Antes se pedía el personaje DIARIO de Kiwami: se mostraba
  // un personaje equivocado y además se filtraba la respuesta del día.
  const revealTarget = async () => {
    if (difficulty === "infinite") {
      if (!infiniteTarget) return null;
      const item = characters.find((c) => c.name === infiniteTarget);
      const target = { name: infiniteTarget, images: item?.image ? [item.image] : [] };
      setTargetCharacter(target);
      return target;
    }

    // Modos diarios: /start + /daily-target
    try {
      const { token } = await getStartToken(difficulty);
      const target = await getDailyTarget(difficulty, token);
      setTargetCharacter(target);
      return target;
    } catch (error) {
      console.error("Error revealing target:", error);
      return null;
    }
  };

  // Maneja el intento de adivinar un personaje  
  const handleGuess = async (name) => {
    // Evitar peticiones simultáneas o intentos cuando la partida ya terminó
    if (isLoading || gameWon || gameLost) return;

    // FIX (bug 5): defensa final contra intentos repetidos (no gastan intento ni duplican filas)
    if (guesses.some((g) => g.name === name)) {
      showToastMessage(`You already guessed ${name}.`);
      return;
    }

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

      persistSession({
        guesses: newGuesses,
        attempts: newAttempts,
        gameWon: isCorrect,
        gameLost: isLoss,
        // Se persiste el objetivo si se acierta o si se pierde  
        targetCharacter: isCorrect ? data.target : (isLoss ? revealed : targetCharacter),
        usedHintFields,
        hints,
      });

      if (isCorrect) {
        setGameWon(true);
        setTargetCharacter(data.target); // guarda el objetivo revelado para que la tarjeta salga verde
        const updated = updateStats(difficulty, true, newAttempts);
        setStats(updated);
        const totalAnimationTime = 4000;
        setTimeout(() => {
          setShowCelebration(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, totalAnimationTime);
      } else if (isLoss) {
        setGameLost(true);
        const updated = updateStats(difficulty, false, newAttempts);
        setStats(updated);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error) {
      console.error("Error submitting guess:", error);
      // FIX (bug 5): mensajes distintos según el error, no todo es "Network error"
      if (error.status === 429) {
        showToastMessage("Too many requests, please slow down.");
      } else if (error.status === 404) {
        showToastMessage("Character not found.");
      } else {
        showToastMessage("Network error. Please try again.");
      }
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
    persistSession({
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

  // Copia el resultado tipo Wordle al portapapeles  
  const handleShare = async () => {
    const text = buildShareText(guesses, difficulty, attempts, gameWon, MAX_ATTEMPTS);
    try {
      await navigator.clipboard.writeText(text);
      showToastMessage("Result copied to clipboard!");
    } catch {
      showToastMessage("Could not copy result.");
    }
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
    // Solo se puede pedir pista si hay una carga disponible  
    if (hints.length >= MAX_HINTS) {
      showToastMessage("You reached the maximum number of hints for this game.");
      return;
    }
    if (availableCharges <= 0) {
      // Próximo intento que otorga una carga
      const next = HINT_CHARGE_THRESHOLDS[hints.length];
      showToastMessage(
        next
          ? `You can get a new hint after attempt number ${next}`
          : "There are no more hints available for this game"
      );
      return;
    }

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
      persistSession({
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
          <h1 className="title">LADdle</h1>
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
              characters={characters}
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
              <button className="guess-button" onClick={handleShare}>
                📋 Share result
              </button>
              {difficulty === "infinite" && (
                <button className="guess-button" onClick={handleChangeTarget}>
                  🔄 Change Target
                </button>
              )}
              {difficulty !== "infinite" && <Countdown />}
            </div>
          ) : showCelebration && difficulty !== "infinite" ? (
            <>
              <Celebration onShare={handleShare} target={targetCharacter} />
              <Countdown />
            </>
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
              <button className="guess-button" onClick={handleShare}>
                📋 Share result
              </button>
              <button className="guess-button" onClick={handleChangeTarget}>
                🔄 Change Target
              </button>
            </div>
          ) : (
            <div className="waiting-message">
              🎉 You got it! 🎉
              {targetCharacter?.images?.[0] && (
                <img
                  className="surrender-character-image"
                  src={`${IMAGE_BASE_URL}${targetCharacter.images[0]}`}
                  alt={targetCharacter.name}
                />
              )}
              <p className="surrender-character-name">{targetCharacter?.name}</p>
              <button className="guess-button" onClick={handleShare}>
                📋 Share result
              </button>
              <Countdown />
            </div>
          )}
        </header>

        {attempts > 0 && (
          <div className="attempts-counter">
            Attempts: {attempts}/{MAX_ATTEMPTS}
          </div>
        )}
      </div>

      {attempts > 0 && !gameWon && (
        <div className="action-bar">
          <button
            className="hint-button"
            onClick={handleHint}
            disabled={availableCharges <= 0 || hints.length >= MAX_HINTS}
          >
            💡 Hint ({availableCharges} · {hints.length}/{MAX_HINTS})
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
        <Toast message={toast.message} onClose={closeToast} />
      )}
    </div>
  );
}

export default App;