import { useState, useEffect, useMemo, useRef } from "react";
import { IMAGE_BASE_URL } from "../services/api";
import { searchCharacters, resolveGuess } from "../utils/search";

// La lista la carga App una sola vez y llega por props, así que no hay efecto que dependa de onError y no puede haber bucle de peticiones
function GuessInput({ characters, onGuess, onError, difficulty, guessedNames, isLoading }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  // Sugerencias derivadas del texto (sin estado ni efectos extra)
  const suggestions = useMemo(
    () => searchCharacters(characters, value, { difficulty, guessedNames }),
    [characters, value, difficulty, guessedNames]
  );

  // Al terminar una petición el input se vuelve a habilitar: recuperar el foco
  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  const handleChange = (e) => setValue(e.target.value);

  // Al seleccionar una sugerencia se usa su nombre exacto
  const selectItem = (item) => {
    if (isLoading) return; // Bloqueado mientras se revela el intento anterior
    setValue("");
    onGuess(item.name);
  };

  // El texto libre se resuelve contra la lista antes de enviarlo
  const submit = (e) => {
    e.preventDefault();
    if (isLoading || !value.trim()) return; // Bloqueado mientras se revela el intento anterior

    if (characters.length === 0) {
      onError("Character list not loaded yet. Try again in a moment.");
      return;
    }

    const result = resolveGuess(characters, value, { difficulty, guessedNames });
    switch (result.status) {
      case "ok":
        setValue("");
        onGuess(result.name);
        break;
      case "duplicate":
        onError(`You already guessed ${result.name}.`);
        break;
      case "kiwami-only":
        onError(`${result.name} is only available in Kiwami mode.`);
        break;
      default:
        onError("Character not found. Pick one from the suggestions.");
    }
  };

  return (
    <div className="autocomplete-wrapper">
      {/* Formulario de adivinanza con el input y el botón, y debajo las sugerencias filtradas */}
      <form onSubmit={submit} className="guess-form">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a character..."
          value={value}
          onChange={handleChange}
          className="guess-input"
          disabled={isLoading}
        />
        <button type="submit" className="guess-button" disabled={isLoading}>Guess</button>
      </form>

      {/* Sugerencias de personajes que coinciden con el input, mostrando imagen, nombre y alias coincidente */}
      {!isLoading && suggestions.length > 0 && (
        <div className="autocomplete-box">
          {suggestions.map((item) => (
            <div
              key={item.name}
              className="autocomplete-item"
              onClick={() => selectItem(item)}
            >
              {item.image ? (
                <img src={`${IMAGE_BASE_URL}${item.image}`} alt={item.name} className="suggestion-img" />
              ) : (
                <div className="suggestion-img-placeholder"></div>
              )}
              <div className="suggestion-text">
                <span>{item.name}</span>
                {item.matchedAlias && (
                  <span className="suggestion-alias">"{item.matchedAlias}"</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default GuessInput;
