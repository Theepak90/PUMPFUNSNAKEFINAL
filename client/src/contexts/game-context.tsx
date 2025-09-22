import React, { createContext, useContext, useState, ReactNode } from 'react';

interface GameContextType {
  currentBetAmount: number;
  setCurrentBetAmount: (amount: number) => void;
  onGameWin: (score: number, timeAlive: number) => void;
  onGameLoss: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

interface GameProviderProps {
  children: ReactNode;
}

export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const [currentBetAmount, setCurrentBetAmount] = useState<number>(0);

  const onGameWin = (score: number, timeAlive: number) => {
    // This will be set by the home page when starting a game
    console.log(`Game won! Score: ${score}, Time: ${timeAlive}s, Bet: $${currentBetAmount}`);
  };

  const onGameLoss = () => {
    // This will be set by the home page when starting a game
    console.log(`Game lost! Bet: $${currentBetAmount}`);
  };

  return (
    <GameContext.Provider value={{
      currentBetAmount,
      setCurrentBetAmount,
      onGameWin,
      onGameLoss
    }}>
      {children}
    </GameContext.Provider>
  );
};
