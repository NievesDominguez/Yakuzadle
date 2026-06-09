import { useState, useEffect, useRef } from "react";

function GuessInput({ onGuess, onError }) {
  const [value, setValue] = useState("");
  const [allItems, setAllItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    const cached = localStorage.getItem("characterListV2");
    if (cached) {
      setAllItems(JSON.parse(cached));
    } else {
      fetch(`${import.meta.env.VITE_API_BASE_URL}/list`)
        .then((res) => res.json())
        .then((data) => {
          setAllItems(data);
          localStorage.setItem("characterListV2", JSON.stringify(data));
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

  const selectItem = (item) => {
    setFiltered([]);
    onGuess(item.name);
    setValue("");
    inputRef.current?.focus();
  };

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
      <form onSubmit={submit} className="guess-form">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a character..."
          value={value}
          onChange={handleChange}
          className="guess-input"
        />
        <button className="guess-button">Guess</button>
      </form>
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
