import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { fullUrl } from '@/lib/queryClient';

// Simple user type for our file-based auth
interface SimpleUser {
  id: string;
  username: string;
  balance: number;
  holdBalance: number;
  lastDailyRewardClaim?: string;
  gamesPlayedToday?: number; // Number of games played today
  lastGameDate?: string; // Date of last game played (ISO string)
  hasPlayedGame?: boolean; // Whether user has ever played a game (enables daily rewards)
  isClipper?: boolean; // Whether user is a clipper account (cannot withdraw)
}

interface AuthContextType {
  user: SimpleUser | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<SimpleUser>) => void;
  updateUsername: (newUsername: string) => Promise<void>;
  placeBet: (betAmount: number) => Promise<void>;
  winBet: (betAmount: number, winnings: number) => Promise<void>;
  loseBet: (betAmount: number) => Promise<void>;
  getWalletInfo: () => Promise<{ balance: number; holdBalance: number; availableBalance: number }>;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  isLoggingOut: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SimpleUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const hasInitialized = useRef(false);
  const hasLoggedOut = useRef(false);

  // Simplified setUser wrapper
  const setUserSafely = (newUser: SimpleUser | null) => {
    setUser(newUser);
  };

  // Debug user state changes
  useEffect(() => {
    console.log("🔍 User state changed:", user ? `Logged in as ${user.username}` : "No user");
  }, [user]);

  useEffect(() => {
    // Only run initialization once on component mount
    if (hasInitialized.current) {
      console.log("🚫 Skipping initialization - already done");
      return;
    }

    // Don't restore user if we've logged out
    if (hasLoggedOut.current) {
      console.log("🚫 Skipping user restoration - user was logged out");
      hasInitialized.current = true;
      setIsLoading(false);
      return;
    }

    console.log("🔄 Initializing AuthProvider...");
    
    // Check for stored user data on mount
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        console.log("🔄 Restoring user from localStorage:", parsedUser.username);
        setUserSafely(parsedUser);
      } catch (error) {
        console.error("❌ Failed to parse stored user data:", error);
        localStorage.removeItem("user");
      }
    } else {
      console.log("🚫 No user found in localStorage");
    }
    
    hasInitialized.current = true;
    setIsLoading(false);
  }, []); // Empty dependency array - only run once on mount

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch(fullUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      setUserSafely(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      // Clear logout flag on successful login
      hasLoggedOut.current = false;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (username: string, password: string) => {
    try {
      const response = await fetch(fullUrl('/api/auth/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }

      const data = await response.json();
      setUserSafely(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      // Clear logout flag on successful registration
      hasLoggedOut.current = false;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const logout = async () => {
    if (isLoggingOut) return; // Prevent multiple logout attempts
    
    setIsLoggingOut(true);
    
    try {
      // Set logout flag to prevent re-initialization
      hasLoggedOut.current = true;
      
      // Clear user state immediately
      setUserSafely(null);
      
      // Clear localStorage data
      localStorage.removeItem("user");
      localStorage.removeItem("cashOutCelebration");
      localStorage.removeItem("gameOverData");
      
      // Call server logout (fire and forget)
      fetch(fullUrl('/api/auth/logout'), { 
        method: 'POST',
        credentials: 'include'
      }).catch(() => {
        // Ignore server errors - we've cleared local state
      });
      
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const updateUser = (updates: Partial<SimpleUser>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      setUserSafely(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
    }
  };

  const updateUsername = async (newUsername: string) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      console.log('Updating username for user:', user.id, 'to:', newUsername);
      const response = await fetch(fullUrl('/api/auth/update-username'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id, newUsername }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Username update failed:', errorData);
        
        // If user not found, try to register a new user with the new username
        if (errorData.message === 'User not found') {
          console.log('User not found in backend, creating new user...');
          const registerResponse = await fetch(fullUrl('/api/auth/register'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: newUsername, password: 'temp123' }),
          });
          
          if (registerResponse.ok) {
            const registerData = await registerResponse.json();
            setUserSafely(registerData.user);
            localStorage.setItem('user', JSON.stringify(registerData.user));
            return;
          }
        }
        
        throw new Error(errorData.message || 'Username update failed');
      }

      const data = await response.json();
      setUserSafely(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (error) {
      console.error('Username update error:', error);
      throw error;
    }
  };

  const placeBet = async (betAmount: number) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      console.log('🎲 Auth context: Placing bet', { userId: user.id, betAmount });
      
      const response = await fetch(fullUrl('/api/game/place-bet'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id, betAmount }),
      });

      console.log('📡 Bet placement response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('❌ Bet placement failed:', errorData);
        throw new Error(errorData.message || 'Bet placement failed');
      }

      const data = await response.json();
      console.log('✅ Bet placement successful:', data);
      
      setUserSafely(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (error) {
      console.error('❌ Bet placement error:', error);
      throw error;
    }
  };

  const winBet = async (betAmount: number, winnings: number) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      const response = await fetch(fullUrl('/api/game/win-bet'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id, betAmount, winnings }),
      });

      if (!response.ok) {
        throw new Error('Bet win processing failed');
      }

      const data = await response.json();
      setUserSafely(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (error) {
      console.error('Bet win error:', error);
      throw error;
    }
  };

  const loseBet = async (betAmount: number) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      const response = await fetch(fullUrl('/api/game/lose-bet'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id, betAmount }),
      });

      if (!response.ok) {
        throw new Error('Bet loss processing failed');
      }

      const data = await response.json();
      setUserSafely(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (error) {
      console.error('Bet loss error:', error);
      throw error;
    }
  };


  const getWalletInfo = async () => {
    if (!user) throw new Error('No user logged in');
    
    try {
      const response = await fetch(fullUrl(`/api/wallet/${user.id}`), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get wallet info');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Get wallet info error:', error);
      throw error;
    }
  };

  const refreshUser = async () => {
    if (!user) return;
    
    try {
      console.log('🔄 Refreshing user data for:', user.id);
      
      const response = await fetch(fullUrl(`/api/wallet/${user.id}`), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.error('❌ User not found on server:', user.id);
          // Don't update user data if user doesn't exist on server
          return;
        }
        throw new Error('Failed to refresh user data');
      }

      const walletData = await response.json();
      console.log('💰 Wallet data received:', walletData);
      
      // Only update if we got valid data
      if (walletData.balance !== undefined && walletData.holdBalance !== undefined) {
        const updatedUser = {
          ...user,
          balance: walletData.balance,
          holdBalance: walletData.holdBalance
        };
        
        setUserSafely(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        console.log('✅ User data refreshed successfully');
      } else {
        console.error('❌ Invalid wallet data received:', walletData);
      }
    } catch (error) {
      console.error('❌ Refresh user error:', error);
      // Don't throw error to prevent breaking the flow
    }
  };

    return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      register, 
      logout, 
      updateUser,
      updateUsername,
      placeBet,
      winBet,
      loseBet,
      getWalletInfo,
      refreshUser,
      isLoading,
      isLoggingOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
