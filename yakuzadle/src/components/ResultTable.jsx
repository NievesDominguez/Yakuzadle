import { useEffect, useRef } from "react";
import ResultRow from "./ResultRow";

function ResultTable({ guesses, target, onNewestRevealed }) {
  const tableRef = useRef(null);

  useEffect(() => {
    if (tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [guesses.length]);

  return (
    <div className="table">
      <div className="header-row">
        <div className="header-cell">Character</div>
        <div className="header-cell">Gender</div>
        <div className="header-cell">Affiliation</div>
        <div className="header-cell">Nationality/Heritage</div>
        <div className="header-cell">Games</div>
        <div className="header-cell">Blood Type</div>
        <div className="header-cell">Fighting Style</div>
        <div className="header-cell">Height</div>
        <div className="header-cell">Birthdate</div>
      </div>

      <div ref={tableRef} />

      {[...guesses].reverse().map((g, i) => (
        // Solo la fila más reciente avisa de cuándo termina de revelarse
        <ResultRow
          key={g.name}
          guess={g}
          target={target}
          onRevealed={i === 0 ? onNewestRevealed : undefined}
        />
      ))}

      <div className="scroll-hint">
        Swipe horizontally to see all columns.
      </div>

      <div className="table-footer">
        * LADdle is an unofficial fan project, not affiliated with or endorsed by Ryu Ga Gotoku Studio or SEGA. Like a
        Dragon / Yakuza and its characters belong to their respective owners.. *
      </div>

    </div>
  );
}

export default ResultTable;