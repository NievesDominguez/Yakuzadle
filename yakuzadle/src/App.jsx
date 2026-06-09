// yakuzadle/src/App.jsx  
import { useState, useEffect } from "react";
import GuessInput from "./components/GuessInput";
import ResultTable from "./components/ResultTable";
import Celebration from "./components/Celebration";
import Toast from "./components/Toast";
import "./styles/main.css";

function App() {
  // Lista de personajes adivinados en la sesión actual
  const [guesses, setGuesses] = useState([]);

  // Datos completos del personaje objetivo del día (nombre, imágenes, atributos)
  const [targetCharacter, setTargetCharacter] = useState(null);

  // true cuando el jugador ha acertado el personaje  
  const [gameWon, setGameWon] = useState(false);

  // true cuando la animación de victoria ha terminado y se muestra el componente Celebration  
  const [showCelebration, setShowCelebration] = useState(false);

  // Número de intentos realizados en la partida actual  
  const [attempts, setAttempts] = useState(0);

  // Estado del toast de notificación (mensaje y visibilidad)  
  const [toast, setToast] = useState({ message: "", show: false });

  // Lista de nombres de todos los personajes disponibles para el autocompletado  
  const [characterNames, setCharacterNames] = useState([]);

  // true cuando el jugador ha pulsado "Rendirse" y ha abandonado la partida  
  const [gameSurrendered, setGameSurrendered] = useState(false);

  // Dificultad actual: "normal" o "kiwami" 
  const [difficulty, setDifficulty] = useState("normal");

  // Campos ya mostrados como pista (para no repetirlos)  
  const [usedHintFields, setUsedHintFields] = useState([]);
  // Pistas ya obtenidas para mostrarlas en pantalla  
  const [hints, setHints] = useState([]);

  // Carga inicial de la lista de personajes
  // Se intenta primero desde localStorage para evitar llamadas innecesarias a la API. Si no hay caché, se pide al backend y se guarda para futuras visitas
  useEffect(() => {
    const cached = localStorage.getItem("characterListV2");
    // Si hay datos en caché, los usamos directamente
    if (cached) {
      setCharacterNames(JSON.parse(cached).map(item => item.name));
    }
    // Si no hay caché, hace la petición al backend para obtener la lista de personajes y guardarla en localStorage para la próxima vez
    else {
      fetch(`${import.meta.env.VITE_API_BASE_URL}/list`)
        .then(res => res.json())
        .then(data => {
          localStorage.setItem("characterListV2", JSON.stringify(data));
          setCharacterNames(data.map(item => item.name));
        })
        .catch(() => showToastMessage("Failed to load character list"));
    }
  }, []);

  // Muestra un toast en pantalla
  const showToastMessage = (msg) => {
    setToast({ message: msg, show: true });
  };

  // Maneja el cambio de dificultad (normal/kiwami)
  const handleDifficultyChange = (newDifficulty) => {
    if (newDifficulty === difficulty) return;
    setDifficulty(newDifficulty);
    // Resetear toda la partida al cambiar de dificultad  
    setGuesses([]);
    setGameWon(false);
    setGameSurrendered(false);
    setShowCelebration(false);
    setAttempts(0);
    setTargetCharacter(null);
    setUsedHintFields([]);
    setHints([]);
  };

  // Lógica de intento de adivinar un personaje
  const handleGuess = async (name) => {
    try {
      // Envía el nombre del personaje al backend para que lo compare con el objetivo del día
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/guess?name=${encodeURIComponent(name)}&difficulty=${difficulty}`
      );
      // El backend responde con los datos del personaje adivinado, el resultado de la comparación y los datos del personaje objetivo (si no se han enviado antes)
      const data = await res.json();

      if (data.error) {
        showToastMessage("Character not found");
        return;
      }

      // El personaje objetivo se guardala primera vez que llega del backend  
      if (!targetCharacter) {
        setTargetCharacter(data.target);
      }

      const isCorrect = data.character.name === data.target.name;

      // Añade el intento a la tabla de resultados  
      setGuesses((prev) => [
        ...prev,
        {
          name: data.character.name,
          character: data.character,
          comparison: data.result,
        },
      ]);
      setAttempts((prev) => prev + 1);

      // Si el intento es correcto, espera a que termine la animación de la fila antes de mostrar la pantalla de celebración  
      if (isCorrect && !gameWon) {
        setGameWon(true);
        const totalAnimationTime = 4000; // ms que dura la animación de la fila  
        setTimeout(() => {
          setShowCelebration(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, totalAnimationTime);
      }
    } catch (error) {
      showToastMessage("Network error. Please try again.");
    }
  };

  // Rendirse
  const handleSurrender = async () => {
    // Si ya tiene el personaje objetivo cargado, no necesita hacer la petición al backend y muestra directamente la pantalla de rendición
    if (targetCharacter) {
      setGameSurrendered(true);
      return;
    }
    // Si no tiene el personaje objetivo, lo obtiene del backend
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/daily-target?difficulty=${difficulty}`);
      const data = await res.json();
      setTargetCharacter(data);
      setGameSurrendered(true);
    } catch {
      showToastMessage("No se pudo obtener el personaje del día.");
    }
  };

  // Reiniciar partida
  // Limpia todos los estados de la partida para empezar desde cero
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

  // Debug: cambiar objetivo aleatoriamente (solo en desarrollo)
  const handleDebugNewTarget = async () => {
    // Si no hay personajes cargados, muestra un mensaje de error y no hace nada
    if (characterNames.length === 0) {
      showToastMessage("No characters loaded");
      return;
    }
    // Elige un personaje al azar de la lista de nombres
    const randomName = characterNames[Math.floor(Math.random() * characterNames.length)];
    // Envía una petición al backend para establecer el nuevo objetivo, luego reinicia el estado de la partida localmente para empezar de nuevo con el nuevo objetivo
    try {
      await fetch(`http://localhost:3001/debug-set-target?name=${encodeURIComponent(randomName)}&difficulty=${difficulty}`);
      setGuesses([]);
      setGameWon(false);
      setGameSurrendered(false);
      setShowCelebration(false);
      setAttempts(0);
      setTargetCharacter(null);
      showToastMessage(`New target set: ${randomName}`);
    } catch (error) {
      showToastMessage("Failed to set debug target");
    }
  };


  // Se encarga de mostrar las pistas
  const handleHint = async () => {
    // Campos con pista y ya adivinados correctamente
    const HINT_FIELDS = ["affiliation", "nationality", "games", "fighting_style", "height", "date_of_birth"];
    const correctFields = HINT_FIELDS.filter((field) =>
      guesses.some((g) => g.comparison?.[field] === "green")
    );

    // Unión de campos ya usados como pista y ya adivinados correctamente  
    const allUsed = [...new Set([...usedHintFields, ...correctFields])];

    try {
      // Pide al backend una pista, enviando la dificultad actual y los campos ya usados para que no los repita
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/hint?difficulty=${difficulty}&usedFields=${allUsed.join(",")}`
      );
      const data = await res.json();

      // Si el backend indica que no quedan pistas disponibles, muestra un mensaje y no hace nada
      if (data.noHints) {
        showToastMessage("No hints available");
        return;
      }

      // Formatear el valor para mostrarlo  
      const displayValue = Array.isArray(data.value)
        ? data.value.join(", ")
        : data.value;

      // Etiqueta legible del campo  
      const fieldLabels = {
        affiliation: "Affiliation",
        nationality: "Nationality/Heritage",
        games: "Games",
        fighting_style: "Fighting Style",
        height: "Height",
        date_of_birth: "Birthdate",
      };

      // Añade el nuevo campo de pista a la lista de campos usados y a la lista de pistas para mostrar en pantalla
      setUsedHintFields((prev) => [...prev, data.field]);
      setHints((prev) => [...prev, { field: fieldLabels[data.field], value: displayValue }]);
    } catch {
      showToastMessage("Could not get hint.");
    }
  };

  // Render
  return (
    <div className="page">
      <div className="top-container">
        <header className="hero">
          <h1 className="title">Yakuzadle</h1>
          {/* Selector de dificultad */}
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
          {
            // Si la partida no se ha ganado ni el jugador se ha rendido, muestra el input de adivinar y el botón de rendirse
            !gameWon && !gameSurrendered ? (
              <>
                {/* Input de búsqueda con autocompletado */}
                <GuessInput onGuess={handleGuess} onError={showToastMessage} />

                {/* Botón para abandonar la partida y ver la respuesta */}
                <button className="surrender-button" onClick={handleSurrender}>
                  Give up
                </button>
                <button className="hint-button" onClick={handleHint}>
                  Hint
                </button>
                {hints.length > 0 && (
                  <div className="hints-container">
                    {hints.map((h, i) => (
                      <div key={i} className="hint-item">
                        <span className="hint-label">{h.field}:</span> {h.value}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : showCelebration ? (
              /* Pantalla de victoria con confeti y opción de jugar de nuevo */
              <Celebration onPlayAgain={handlePlayAgain} />
            ) : gameSurrendered ? (
              /* Pantalla de rendición: muestra imagen y nombre del personaje correcto */
              <div className="surrender-screen">
                <h2>You gave up</h2>
                <p>The character was:</p>

                {/* Imagen del personaje */}
                {targetCharacter?.images?.[0] && (
                  <img
                    className="surrender-character-image"
                    src={`https://raw.githubusercontent.com/NievesDominguez/Yakuzadle/main/img_yakuzadle/${targetCharacter.images[0]}`}
                    alt={targetCharacter.name}
                  />
                )}

                <p className="surrender-character-name">{targetCharacter?.name}</p>

                <button className="guess-button" onClick={handlePlayAgain}>
                  Play Again
                </button>
              </div>
            ) : (
              /* Estado transitorio: partida ganada pero la animación de la fila aún no terminó */
              <div className="waiting-message">✨ Revealing... ✨</div>
            )}
        </header>

        {/* Contador de intentos y botón de debug (solo en modo desarrollo) */}
        <div className="attempts-counter">
          Attempts: {attempts}
          {import.meta.env.DEV && (
            <button className="debug-button" onClick={handleDebugNewTarget} title="Set random target">
              🎲
            </button>
          )}
        </div>
      </div>

      {/* Tabla de resultados: solo visible cuando hay al menos un intento */}
      <div className="bottom-container">
        {guesses.length > 0 && (
          <main className="results">
            <ResultTable guesses={guesses} target={targetCharacter} />
          </main>
        )}
      </div>

      {/* Toast de notificaciones (errores, avisos) */}
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