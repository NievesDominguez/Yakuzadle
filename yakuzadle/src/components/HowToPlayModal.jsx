import { useEffect, useRef } from "react";

function HowToPlayModal({ onClose }) {
  const dialogRef = useRef(null);

  // Cierra con la tecla Escape y lleva el foco al modal al abrirlo
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="stats-modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="stats-modal howto-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="stats-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <h2 id="howto-title">How to play</h2>

        <div className="howto-content">
          <p>
            Guess the mystery <strong>Like a Dragon / Yakuza / Judgment</strong> character. A new one is randomly chosen every
            day at 00:00 UTC, you have <strong>15 attempts</strong>.
          </p>

          <h3>Making a guess</h3>
          <p>
            Type a character&rsquo;s name and press guess or pick it from the list.
            The table then compares that character with the mystery one, attribute by attribute:
            gender, affiliation, nationality/heritage, games, blood type, fighting style, height
            and birthdate.
          </p>

          <h3>Colors</h3>
          <ul className="howto-colors">
            <li>
              <span className="howto-swatch green" /> <strong>Green</strong>: the attribute matches.
            </li>
            <li>
              <span className="howto-swatch yellow" /> <strong>Yellow</strong>: partial match
              (for example, they share some games, but not all).
            </li>
            <li>
              <span className="howto-swatch red" /> <strong>Red</strong>: the attribute does not match.
            </li>
          </ul>

          <h3>Arrows</h3>
          <p>
            Height and birthdate also show an arrow:
            <strong> ↑</strong> The mystery character is taller or older.
            <strong> ↓</strong> The mystery character is shorter or younger.
          </p>
          <h3>Hints</h3>
          <p>
            You earn a 💡 hint charge after attempts 3, 6, 9 and 12 (up to 4 hints). Each hint reveals one
            key attribute of the mystery character that you haven&rsquo;t already guessed at random, if there&rsquo;s any.
          </p>

          <h3>Difficulty</h3>
          <ul>
            <li><strong>Normal</strong>: main and most relevant secondary characters.</li>
            <li>
              <strong>Kiwami</strong>: all the normal characters + minor characters and in the future
              characters from secondary spin-offs.
            </li>
            <li>
              <strong>Infinite</strong>: a random character, as many times as you want. Not tied to the daily one.
            </li>
          </ul>

          <h3>Sharing</h3>
          <p>
            When the game ends, press <strong>Share result</strong> to copy your colored grid and
            show it off without spoilers.
          </p>

          <h3>Tips</h3>
          <ul>
            <li>
              This game includes characters from all mainline games and both Judgment games, but no characters
              exclusive from Ishin, Kenzan, Kurohyou or RGG Online... <i>yet</i>.
            </li>
            <li>
              Ryu Ga Gotoku Online does not count for the color comparison in the Games
              column. If it matches, it appears in <strong>bold</strong>.
            </li>
            <li>
              The game comparison is for games where the character actually appears. Flashbacks do not count, but minor appearances do.
            </li>
            <li>
              Nationality and heritage are difficult things to determine for some characters. As most of them could
              be considered Japanese for one reason or another, I&rsquo;ve tried to keep it simple and useful for the game and omit
              the Japanese nationality for most characters that have a different heritage. If we know the character is mixed, though,
              or if the their heritage is Japanese but they&rsquo;re somehow heavily related to another place, then both might appear.
              Ex: Ichiban will appear as both Japanese and Hawaiian, but Zhao as only Chinese.
              You might find some other surprises for a certain set of characters here, but I won&rsquo;t ruin the surprise for you.
            </li>
            <li>
              You will find certain special cases where columns you might not expect will appear in yellow. Find out why, there&rsquo;s a reason.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default HowToPlayModal;
