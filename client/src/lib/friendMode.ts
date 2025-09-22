// Friend mode utilities for the game

export interface FriendModeConfig {
  isEnabled: boolean;
  disableBots: boolean;
  maxPlayers: number;
  gameTitle: string;
}

export function getFriendModeConfig(urlParams: URLSearchParams): FriendModeConfig {
  const mode = urlParams.get('mode');
  const isFriendMode = mode === 'friends';
  
  return {
    isEnabled: isFriendMode,
    disableBots: isFriendMode,
    maxPlayers: isFriendMode ? 2 : 20, // Only 2 players in friend mode
    gameTitle: isFriendMode ? 'Friend Battle' : 'Snake Game'
  };
}

export function shouldSpawnBots(config: FriendModeConfig): boolean {
  return !config.disableBots;
}

export function getInitialBotCount(config: FriendModeConfig): number {
  return config.disableBots ? 0 : 8; // No bots in friend mode, 8 bots in normal mode
}

export function getGameModeDisplayText(config: FriendModeConfig): string {
  return config.isEnabled ? 'Friend Mode' : 'Normal Mode';
}
