import { useState, useEffect } from "react";

// Instante (ms) de la próxima medianoche UTC, cuando cambia el personaje del día
function nextUtcMidnight(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

function format(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function Countdown() {
  // La hora objetivo se calcula una vez al montar
  const [deadline] = useState(() => nextUtcMidnight());
  const [remaining, setRemaining] = useState(() => deadline - Date.now());

  useEffect(() => {
    const tick = () => {
      const ms = deadline - Date.now();
      if (ms <= 0) {
        // Nuevo día: recarga para cargar el nuevo personaje
        window.location.reload();
        return;
      }
      setRemaining(ms);
    };

    const id = setInterval(tick, 1000);
    // Los navegadores frenan los timers en pestañas en segundo plano: al volver, comprobar ya
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [deadline]);

  return (
    <div className="countdown">
      <span className="countdown-label">Next character in:</span>
      <span className="countdown-time">{format(remaining)}</span>
    </div>
  );
}

export default Countdown;
