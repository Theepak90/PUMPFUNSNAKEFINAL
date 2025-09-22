import { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  baseScore: number;
  moneyPerMinute: number;
  lastUpdate: number;
}

interface LeaderboardProps {
  onViewFull: () => void;
}

// Fixed usernames for the leaderboard
const fixedUsernames = [
  'Toyko', '1$TO10K', 'TsEasy', 'JackOnCrack', 'RealNiggaSnake',
  'Coon', 'Faggot', 'FuckJews', 'HH', 'Znoeo',
  'Ben', 'SnakedBySnake', 'CryptoBoss', 'SolSnake', 'SnakeyBob',
  'Bob123', 'HeilPump'
];

// Generate random leaderboard data for top 3
const generateTopThree = (): LeaderboardEntry[] => {
  const now = Date.now();
  
  // Shuffle the array and pick 3 random unique names
  const shuffledUsernames = [...fixedUsernames].sort(() => Math.random() - 0.5);
  const selectedUsernames = shuffledUsernames.slice(0, 3);
  
  return selectedUsernames.map((username, index) => ({
    rank: index + 1,
    username,
    baseScore: Math.floor(Math.random() * 2000) + 500, // Random base score between 500-2500
    score: Math.floor(Math.random() * 2000) + 500,
    moneyPerMinute: Math.random() * 2 + 1, // Random between 1-3$ per minute
    lastUpdate: now
  })).sort((a, b) => b.score - a.score).map((entry, index) => ({
    ...entry,
    rank: index + 1
  }));
};

export default function Leaderboard({ onViewFull }: LeaderboardProps) {
  const [topThree, setTopThree] = useState<LeaderboardEntry[]>([]);

  // Generate initial data
  useEffect(() => {
    setTopThree(generateTopThree());
  }, []);

  // Regenerate leaderboard with completely new random names every 10 seconds
  useEffect(() => {
    const regenerateInterval = setInterval(() => {
      setTopThree(generateTopThree());
    }, 10000); // Regenerate every 10 seconds

    return () => clearInterval(regenerateInterval);
  }, []);

  // Update scores gradually every second
  useEffect(() => {
    const updateInterval = setInterval(() => {
      setTopThree(prevTopThree => {
        const now = Date.now();
        return prevTopThree.map(entry => {
          const timePassed = (now - entry.lastUpdate) / 1000 / 60; // Convert to minutes
          const moneyGained = timePassed * entry.moneyPerMinute;
          const newScore = Math.floor(entry.baseScore + moneyGained);
          
          return {
            ...entry,
            score: newScore,
            lastUpdate: now
          };
        }).sort((a, b) => b.score - a.score).map((entry, index) => ({
          ...entry,
          rank: index + 1
        }));
      });
    }, 1000); // Update every second

    return () => clearInterval(updateInterval);
  }, []);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return 'text-yellow-400';
      case 2: return 'text-gray-300';
      case 3: return 'text-orange-400';
      default: return 'text-white';
    }
  };

  return (
    <div className="bg-gray-800 p-3 border-2 border-gray-600 flex flex-col self-start">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-yellow-400 text-sm font-retro flex items-center">
          <Trophy className="w-4 h-4 mr-1" />
          Leaderboard
        </h3>
      </div>
      
      <div className="text-white text-xs space-y-1 font-retro mb-3">
        {topThree.map((entry) => (
          <div key={`${entry.username}-${entry.rank}`} className="flex justify-between items-center">
            <span className="truncate flex items-center gap-1">
              <span className={getRankColor(entry.rank)}>{getRankIcon(entry.rank)}</span>
              <span className="truncate max-w-[100px]">{entry.username}</span>
            </span>
            <span style={{color: '#53d493'}}>${entry.score.toLocaleString()}</span>
          </div>
        ))}
      </div>
      
      <button 
        onClick={onViewFull}
        className="bg-gray-700 text-white px-2 py-1 text-sm border-2 border-gray-600 hover:bg-gray-600 font-retro w-full transition-colors"
      >
        View Full Board
      </button>
    </div>
  );
}
