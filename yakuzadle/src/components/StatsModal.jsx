function StatsModal({ stats, difficulty, onClose }) {  
  const winRate =  
    stats.gamesPlayed > 0  
      ? Math.round((stats.wins / stats.gamesPlayed) * 100)  
      : 0;  
  const maxDist = Math.max(...Object.values(stats.guessDistribution), 1);  
  
  return (  
    <div className="stats-modal-overlay" onClick={onClose}>  
      <div className="stats-modal" onClick={(e) => e.stopPropagation()}>  
        <button className="stats-modal-close" onClick={onClose}>  
          ✕  
        </button>  
        <h2>Statistics — {difficulty === "kiwami" ? "Kiwami" : "Normal"}</h2>  
        <div className="stats-summary">  
          <div className="stats-item">  
            <span>{stats.gamesPlayed}</span>  
            <label>Played</label>  
          </div>  
          <div className="stats-item">  
            <span>{winRate}%</span>  
            <label>Win %</label>  
          </div>  
          <div className="stats-item">  
            <span>{stats.currentStreak}</span>  
            <label>Streak</label>  
          </div>  
          <div className="stats-item">  
            <span>{stats.maxStreak}</span>  
            <label>Best Streak</label>  
          </div>  
        </div>  
        <h3>Guess Distribution</h3>  
        <div className="stats-distribution">  
          {Object.entries(stats.guessDistribution).map(([bucket, count]) => (  
            <div key={bucket} className="dist-row">  
              <span className="dist-label">{bucket}</span>  
              <div  
                className="dist-bar"  
                style={{  
                  width: `${Math.max(  
                    (count / maxDist) * 100,  
                    count > 0 ? 8 : 2  
                  )}%`,  
                }}  
              >  
                {count > 0 && count}  
              </div>  
            </div>  
          ))}  
        </div>  
      </div>  
    </div>  
  );  
}  
  
export default StatsModal;