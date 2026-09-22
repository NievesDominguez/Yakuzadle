import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { IMAGE_BASE_URL } from '../services/api';

function Celebration({ onShare, target }) {
  useEffect(() => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => {
      confetti({ particleCount: 50, spread: 100, origin: { y: 0.5, x: 0.2 } });
      confetti({ particleCount: 50, spread: 100, origin: { y: 0.5, x: 0.8 } });
    }, 250);
  }, []);

  return (
    <div className="celebration">
      <h2>🎉 Congratulations! 🎉</h2>
      <p>You guessed the character correctly!</p>
      {target?.images?.[0] && (
        <img
          className="surrender-character-image"
          src={`${IMAGE_BASE_URL}${target.images[0]}`}
          alt={target.name}
        />
      )}
      <p className="surrender-character-name">{target?.name}</p>
      {onShare && (
        <button onClick={onShare} className="guess-button">
          📋 Share result
        </button>
      )}
    </div>
  );
}

export default Celebration;