import { useState, useEffect, useRef } from "react";
import { getCharacterList } from "../services/api";

function GuessInput({ onGuess, onError, difficulty, guessedNames, isLoading }) {
  const [value, setValue] = useState("");
  const [allItems, setAllItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    const cached = localStorage.getItem("characterListV3");
    if (cached) {
      setAllItems(JSON.parse(cached));  // guardar items completos, no solo nombres  
    } else {
      getCharacterList()
        .then(data => {
          setAllItems(data);
          localStorage.setItem("characterListV3", JSON.stringify(data));
        })
        .catch(() => onError("Failed to load character list"));
    }
  }, [onError]);

  const handleChange = (e) => {
    const v = e.target.value;
    setValue(v);
    if (!v.length) {
      setFiltered([]);
      return;
    }
    const lower = v.toLowerCase();

    const f = allItems
      .map((item) => {
        // Filtrar por nombre, aliases y apodos, ignorando los ya adivinados y los personajes exclusivos según la dificultad
        if (guessedNames && guessedNames.includes(item.name)) return null;
        if (difficulty === "normal" && item.kiwamiOnly) return null;
        // Comprobar si el nombre principal coincide  
        if (item.name.toLowerCase().includes(lower)) {
          return { ...item, matchedAlias: null };
        }
        // Comprobar aliases  
        const matchedAlias = [...(item.aliases || []), ...(item.nicknames || [])].find(
          (a) => a.toLowerCase().includes(lower)
        );
        if (matchedAlias) {
          return { ...item, matchedAlias };
        }
        return null;
      })
      .filter(Boolean);

    setFiltered(f.slice(0, 8));
  };

  // Al seleccionar un personaje de las sugerencias, hacer el guess y limpiar el input
  const selectItem = (item) => {
    setFiltered([]);
    onGuess(item.name);
    setValue("");
    inputRef.current?.focus();
  };

  // Al hacer submit, usar el valor del input para hacer el guess
  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onGuess(value.trim());
    setValue("");
    setFiltered([]);
    inputRef.current?.focus();
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
        <button className="guess-button" disabled={isLoading}>Guess</button>
      </form>
      {/* Sugerencias de personajes que coinciden con el input, mostrando imagen, nombre y alias coincidente */}
      {filtered.length > 0 && (
        <div className="autocomplete-box">
          {filtered.map((item, i) => (
            <div
              key={i}
              className="autocomplete-item"
              onClick={() => selectItem(item)}
            >
              {item.image ? (
                <img src={item.image} alt={item.name} className="suggestion-img" />
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
