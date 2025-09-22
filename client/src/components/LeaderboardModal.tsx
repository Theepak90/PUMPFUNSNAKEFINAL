import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, X } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
}

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Random usernames for the leaderboard
const randomUsernames = [
  'CryptoKing', 'DiamondHands', 'MoonWalker', 'BullRun', 'HODLer',
  'PumpMaster', 'LamboDreams', 'ToTheMoon', 'DiamondEyes', 'CryptoNinja',
  'BlockChain', 'DeFiWizard', 'NFTCollector', 'YieldFarmer', 'StakeLord',
  'TokenHunter', 'SwapMaster', 'LiquidityKing', 'ProtocolBoss', 'ChainGuru',
  'Web3Warrior', 'MetaverseLord', 'GameFiPro', 'PlayToEarn', 'CryptoGamer',
  'PixelPump', 'RetroGamer', 'ArcadeKing', 'GameMaster', 'ScoreHunter',
  'LuckyPlayer', 'WinStreak', 'HighRoller', 'BigWinner', 'JackpotKing',
  'FortuneSeeker', 'LuckyDuck', 'WinnerTakesAll', 'CashOutKing', 'ProfitMaker'
];

// Generate random leaderboard data
const generateRandomLeaderboard = (count: number = 10): LeaderboardEntry[] => {
  const shuffled = [...randomUsernames].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, count);
  
  return selected.map((username, index) => ({
    rank: index + 1,
    username,
    score: Math.floor(Math.random() * 5000) + 100 // Random score between 100-5100
  })).sort((a, b) => b.score - a.score).map((entry, index) => ({
    ...entry,
    rank: index + 1
  }));
};

export default function LeaderboardModal({ isOpen, onClose }: LeaderboardModalProps) {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  // Generate initial data
  useEffect(() => {
    if (isOpen) {
      setLeaderboardData(generateRandomLeaderboard(20));
    }
  }, [isOpen]);

  // Update leaderboard randomly every 3-8 seconds
  useEffect(() => {
    if (!isOpen) return;

    const updateInterval = setInterval(() => {
      setIsUpdating(true);
      
      // Simulate update delay
      setTimeout(() => {
        setLeaderboardData(generateRandomLeaderboard(20));
        setIsUpdating(false);
      }, 500);
    }, Math.random() * 5000 + 3000); // Random interval between 3-8 seconds

    return () => clearInterval(updateInterval);
  }, [isOpen]);

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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gradient-to-br from-gray-800 to-gray-900 border-4 border-yellow-400 text-white max-w-2xl w-full mx-4 rounded-2xl shadow-2xl [&>button]:hidden max-h-[80vh] overflow-hidden">
        {/* Header */}
        <DialogHeader className="pb-4 border-b-2 border-yellow-400/50">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 font-retro text-2xl text-yellow-300 tracking-wide">
              <Trophy className="w-7 h-7" />
              Full Leaderboard
              {isUpdating && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <div className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin"></div>
                  Updating...
                </div>
              )}
            </DialogTitle>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors border-2 border-gray-500 hover:border-yellow-400 bg-gray-800"
            >
              <X className="w-5 h-5 text-gray-300 hover:text-yellow-300" />
            </button>
          </div>
        </DialogHeader>
        
        {/* Leaderboard Content */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
          {leaderboardData.map((entry) => (
            <div 
              key={`${entry.username}-${entry.rank}`}
              className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-300 ${
                entry.rank <= 3 
                  ? 'bg-gradient-to-r from-yellow-900/20 to-yellow-800/10 border-yellow-400/30' 
                  : 'bg-gray-700/30 border-gray-600/30 hover:border-gray-500/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`text-lg font-retro font-bold ${getRankColor(entry.rank)}`}>
                  {getRankIcon(entry.rank)}
                </div>
                <div className="font-retro text-white text-sm truncate max-w-[200px]">
                  {entry.username}
                </div>
              </div>
              <div className="font-retro text-green-400 font-bold text-sm">
                ${entry.score.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t-2 border-yellow-400/30">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-400 font-retro">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              Live Updates
            </div>
            <div className="text-gray-400 font-retro">
              {leaderboardData.length} players
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
