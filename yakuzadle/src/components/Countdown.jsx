import { useState, useEffect } from "react";  
  
// Devuelve los milisegundos que faltan hasta que se reinicie la sesión diaria
function msUntilNextUtcMidnight() {  
  const now = new Date();  
  const nextMidnight = Date.UTC(  
    now.getUTCFullYear(),  
    now.getUTCMonth(),  
    now.getUTCDate() + 1,  
    0, 0, 0, 0  
  );  
  return nextMidnight - now.getTime();  
}  
  
function format(ms) {  
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));  
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");  
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");  
  const s = String(totalSeconds % 60).padStart(2, "0");  
  return `${h}:${m}:${s}`;  
}  
  
function Countdown() {  
  const [remaining, setRemaining] = useState(() => msUntilNextUtcMidnight());  
  
  useEffect(() => {  
    const id = setInterval(() => {  
      const ms = msUntilNextUtcMidnight();  
      setRemaining(ms);  
      // Cuando llega a cero, recarga para cargar el nuevo personaje del día.  
      if (ms <= 0) window.location.reload();  
    }, 1000);  
    return () => clearInterval(id);  
  }, []);  
  
  return (  
    <div className="countdown">  
      <span className="countdown-label">Next character in:</span>  
      <span className="countdown-time">{format(remaining)}</span>  
    </div>  
  );  
}  
  
export default Countdown;