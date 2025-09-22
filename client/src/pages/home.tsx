import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useGame } from "@/contexts/game-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Wallet } from "@/components/ui/wallet";
import FriendsModal from "@/components/FriendsModal";
import LoginModal from "@/components/LoginModal";
import BalanceWarningModal from "@/components/BalanceWarningModal";
import DailyRewardModal from "@/components/DailyRewardModal";
import TopUpModal from "@/components/TopUpModal";
import WithdrawModal from "@/components/WithdrawModal";
import Leaderboard from "@/components/Leaderboard";
import LeaderboardModal from "@/components/LeaderboardModal";

import { fullUrl } from "@/lib/queryClient";
import { 
  Settings, 
  Volume2, 
  LogOut, 
  Edit3, 
  Wallet as WalletIcon,
  Users,
  Gift,
  Trophy,
  X
} from "lucide-react";

// Decorative snake for background animation
class DecorativeSnake {
  head: { x: number; y: number };
  currentAngle: number;
  segmentTrail: Array<{ x: number; y: number }>;
  speed: number;
  turnSpeed: number;
  targetAngle: number;
  nextTurnTime: number;
  visibleSegments: Array<{ x: number; y: number }>;
  
  constructor(x: number, y: number) {
    this.head = { x, y };
    this.currentAngle = Math.random() * Math.PI * 2;
    this.segmentTrail = [{ x, y }];
    this.speed = 0.5;
    this.turnSpeed = 0.02;
    this.targetAngle = this.currentAngle;
    this.nextTurnTime = Date.now() + 2000;
    this.visibleSegments = [];
    
    // Create initial trail points for smooth following
    for (let i = 0; i < 100; i++) {
      this.segmentTrail.push({
        x: x - Math.cos(this.currentAngle) * i * 2,
        y: y - Math.sin(this.currentAngle) * i * 2
      });
    }
    
    this.updateVisibleSegments();
  }
  
  updateVisibleSegments() {
    this.visibleSegments = [];
    const segmentCount = 12;
    const segmentSpacing = 18; // Increased to 18 for proper spacing like in-game snakes
    
    for (let i = 0; i < segmentCount; i++) {
      const trailIndex = Math.floor(i * segmentSpacing);
      if (trailIndex < this.segmentTrail.length) {
        this.visibleSegments.push(this.segmentTrail[trailIndex]);
      }
    }
  }
  
  update(canvasWidth: number, canvasHeight: number, foods: Array<{ x: number; y: number; wobbleX: number; wobbleY: number }>) {
    const currentTime = Date.now();
    
    // Random direction changes
    if (currentTime > this.nextTurnTime) {
      this.targetAngle = Math.random() * Math.PI * 2;
      this.nextTurnTime = currentTime + 1000 + Math.random() * 3000;
    }
    
    // Look for nearby food
    const nearbyFood = foods.find(food => {
      const distance = Math.sqrt((food.x - this.head.x) ** 2 + (food.y - this.head.y) ** 2);
      return distance < 100;
    });
    
    if (nearbyFood) {
      this.targetAngle = Math.atan2(nearbyFood.y - this.head.y, nearbyFood.x - this.head.x);
    }
    
    // Smooth angle interpolation
    let angleDiff = this.targetAngle - this.currentAngle;
    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.currentAngle += angleDiff * this.turnSpeed;
    
    // Move forward
    this.head.x += Math.cos(this.currentAngle) * this.speed;
    this.head.y += Math.sin(this.currentAngle) * this.speed;
    
    // Wrap around screen edges
    if (this.head.x < 0) this.head.x = canvasWidth;
    if (this.head.x > canvasWidth) this.head.x = 0;
    if (this.head.y < 0) this.head.y = canvasHeight;
    if (this.head.y > canvasHeight) this.head.y = 0;
    
    // Add new trail point
    this.segmentTrail.unshift({ x: this.head.x, y: this.head.y });
    
    // Keep trail length manageable
    if (this.segmentTrail.length > 300) {
      this.segmentTrail.pop();
    }
    
    this.updateVisibleSegments();
  }
  
  draw(ctx: CanvasRenderingContext2D) {
    // Draw snake segments exactly like the multiplayer game
    ctx.save();
    
    // Add subtle drop shadow (not boosting)
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    const segmentRadius = 10;
    ctx.fillStyle = '#d55400'; // Orange snake color
    
    // Draw all segments with shadow
    for (let i = this.visibleSegments.length - 1; i >= 0; i--) {
      const segment = this.visibleSegments[i];
      ctx.beginPath();
      ctx.arc(segment.x, segment.y, segmentRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
    
    // Draw rotated square eyes exactly like multiplayer game
    if (this.visibleSegments.length > 0) {
      const head = this.visibleSegments[0];
      const eyeDistance = 5;
      const eyeSize = 3;
      const pupilSize = 1.5;
      
      // Eye positions perpendicular to movement direction
      const eye1X = head.x + Math.cos(this.currentAngle + Math.PI/2) * eyeDistance;
      const eye1Y = head.y + Math.sin(this.currentAngle + Math.PI/2) * eyeDistance;
      const eye2X = head.x + Math.cos(this.currentAngle - Math.PI/2) * eyeDistance;
      const eye2Y = head.y + Math.sin(this.currentAngle - Math.PI/2) * eyeDistance;
      
      // Draw first eye with rotation (exact copy from multiplayer)
      ctx.save();
      ctx.translate(eye1X, eye1Y);
      ctx.rotate(this.currentAngle);
      ctx.fillStyle = 'white';
      ctx.fillRect(-eyeSize, -eyeSize, eyeSize * 2, eyeSize * 2);
      
      // Draw first pupil looking forward
      const pupilOffset = 1.2;
      ctx.fillStyle = 'black';
      ctx.fillRect(
        pupilOffset - pupilSize,
        0 - pupilSize,
        pupilSize * 2, 
        pupilSize * 2
      );
      ctx.restore();
      
      // Draw second eye with rotation
      ctx.save();
      ctx.translate(eye2X, eye2Y);
      ctx.rotate(this.currentAngle);
      ctx.fillStyle = 'white';
      ctx.fillRect(-eyeSize, -eyeSize, eyeSize * 2, eyeSize * 2);
      
      // Draw second pupil looking forward
      ctx.fillStyle = 'black';
      ctx.fillRect(
        pupilOffset - pupilSize,
        0 - pupilSize,
        pupilSize * 2, 
        pupilSize * 2
      );
      ctx.restore();
    }
  }
  
  eatFood(foods: Array<{ x: number; y: number; wobbleX: number; wobbleY: number }>) {
    return foods.filter(food => {
      const distance = Math.sqrt((food.x - this.head.x) ** 2 + (food.y - this.head.y) ** 2);
      if (distance < 15) {
        // Grow snake by extending trail
        for (let i = 0; i < 20; i++) {
          const lastSegment = this.segmentTrail[this.segmentTrail.length - 1];
          this.segmentTrail.push({ x: lastSegment.x, y: lastSegment.y });
        }
        this.updateVisibleSegments();
        return false; // Remove this food
      }
      return true; // Keep this food
    });
  }
}

export default function Home() {
  const { user, login, register, logout, updateUser, updateUsername, placeBet, winBet, loseBet, refreshUser, getWalletInfo, isLoggingOut } = useAuth();
  const [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Local state for bet management
  const [selectedBetAmount, setSelectedBetAmount] = useState(1);
  const [customBetAmount, setCustomBetAmount] = useState("");
  const [isCustomBet, setIsCustomBet] = useState(false);
  
  const { setCurrentBetAmount, onGameWin, onGameLoss } = useGame();
  const { toast } = useToast();

  // Decorative snake animation state
  const [decorativeSnake, setDecorativeSnake] = useState<DecorativeSnake | null>(null);
  const [foods, setFoods] = useState<Array<{ x: number; y: number }>>([]);

  // Animated player count effect - fluctuates realistically
  useEffect(() => {
    let currentCount = 150;
    let upCount = 0; // Track consecutive ups to implement up-up-down pattern
    let hasReached600Today = false;
    
    const interval = setInterval(() => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const timeToday = now.getTime() - todayStart.getTime();
      const dayProgress = timeToday / (24 * 60 * 60 * 1000); // 0-1 through the day
      
      // Reset 600 flag at midnight
      if (dayProgress < 0.01) {
        hasReached600Today = false;
      }
      
      // Determine direction based on pattern and daily goal
      let shouldGoUp = false;
      
      if (!hasReached600Today && dayProgress > 0.8 && Math.random() < 0.3) {
        // Late in day, chance to reach 600
        shouldGoUp = currentCount < 600;
        if (currentCount >= 600) hasReached600Today = true;
      } else if (upCount < 2) {
        // Up twice pattern
        shouldGoUp = Math.random() < 0.7;
        if (shouldGoUp) upCount++;
      } else {
        // Down once after two ups
        shouldGoUp = false;
        upCount = 0;
      }
      
      // Apply bounds
      if (currentCount <= 150) shouldGoUp = true;
      if (currentCount >= 600 && hasReached600Today) shouldGoUp = false;
      
      // Update count
      if (shouldGoUp) {
        currentCount += Math.floor(Math.random() * 3) + 1; // 1-3 increase
      } else {
        currentCount -= Math.floor(Math.random() * 2) + 1; // 1-2 decrease
      }
      
      // Ensure bounds
      currentCount = Math.max(150, Math.min(600, currentCount));
      setAnimatedPlayerCount(currentCount);
    }, 3000 + Math.random() * 4000); // 3-7 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  // Daily winnings counter - $1 per second, 20k-30k target
  useEffect(() => {
    const updateWinnings = () => {
      const now = new Date();
      const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
      const todayStart = new Date(easternTime.getFullYear(), easternTime.getMonth(), easternTime.getDate());
      const timeToday = easternTime.getTime() - todayStart.getTime();
      const secondsToday = Math.floor(timeToday / 1000);
      
      // Random daily target between 20k-30k
      const seed = todayStart.getTime();
      const dailyTarget = 20000 + (Math.sin(seed) * 0.5 + 0.5) * 10000;
      
      // $1 per second, but cap at daily target
      const currentWinnings = Math.min(secondsToday, Math.floor(dailyTarget));
      setDailyWinnings(currentWinnings);
    };
    
    updateWinnings();
    const interval = setInterval(updateWinnings, 1000); // Update every second
    
    return () => clearInterval(interval);
  }, []);

  // State variables
  const [animatedPlayerCount, setAnimatedPlayerCount] = useState(150);
  const [dailyWinnings, setDailyWinnings] = useState(0);
  
  // Celebration popup state
  const [showCelebration, setShowCelebration] = useState(false);
  const [cashOutAmount, setCashOutAmount] = useState(0);
  
  // Game over popup state
  const [showGameOver, setShowGameOver] = useState(false);
  const [gameOverData, setGameOverData] = useState({ finalMass: 0, timeAlive: 0 });

  // Check for celebration data from localStorage (set by cash-out completion)
  useEffect(() => {
    const celebrationData = localStorage.getItem('cashOutCelebration');
    if (celebrationData) {
      const { amount } = JSON.parse(celebrationData);
      setCashOutAmount(amount);
      // setShowCelebration(true); // Commented out to hide cash out celebration popup
      localStorage.removeItem('cashOutCelebration'); // Clean up
    }
    
    // Check for game over data from localStorage (set by death)
    const gameOverData = localStorage.getItem('gameOverData');
    if (gameOverData) {
      const data = JSON.parse(gameOverData);
      setGameOverData(data);
      setShowGameOver(true);
      localStorage.removeItem('gameOverData'); // Clean up
    }
  }, []);

  // Refresh user balance when component mounts to ensure UI shows correct balance
  useEffect(() => {
    if (user && !isLoggingOut) {
      const refreshBalance = async () => {
        try {
          const walletInfo = await getWalletInfo();
          updateUser({
            balance: walletInfo.balance,
            holdBalance: walletInfo.holdBalance
          });
        } catch (error) {
          console.error('Failed to refresh balance on page load:', error);
        }
      };
      
      refreshBalance();
    }
  }, [user?.id]); // Only depend on user.id to prevent unnecessary re-runs



  // Region selection state
  const [selectedRegion, setSelectedRegion] = useState<'us' | 'eu' | null>(null);
  const [isDetectingRegion, setIsDetectingRegion] = useState(false);
  
  // Friends modal state
  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
  
  // Login modal state
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  
  // Balance warning modal state
  const [isBalanceWarningOpen, setIsBalanceWarningOpen] = useState(false);
  
  // Daily reward modal state
  const [isDailyRewardOpen, setIsDailyRewardOpen] = useState(false);
  const [isDailyRewardTakenOpen, setIsDailyRewardTakenOpen] = useState(false);
  
  // Wallet modal states
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isLeaderboardModalOpen, setIsLeaderboardModalOpen] = useState(false);

  // Username editing states
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  // Start game handler with automatic random region selection
  const handleStartGameWithRegion = async (region: string) => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }

    const betAmount = getEffectiveBetAmount();
    
    try {
      console.log('🎯 Starting game with bet:', { betAmount, userId: user.id, region });
      
      // Get fresh balance from server before placing bet
      console.log('🔄 Getting fresh balance from server...');
      const walletInfo = await getWalletInfo();
      const userBalance = walletInfo.balance;
      
      console.log('💰 Fresh user balance from server:', { userBalance, betAmount });
      
      // Update the user context with fresh data
      if (user) {
        updateUser({
          balance: walletInfo.balance,
          holdBalance: walletInfo.holdBalance
        });
      }
      
      // Check balance after getting fresh data
      if (userBalance < betAmount) {
        toast({
          title: "Insufficient Balance",
          description: `You have $${userBalance.toFixed(2)} but need $${betAmount.toFixed(2)}`,
          variant: "destructive"
        });
        return;
      }
      
      // Place the bet first
      console.log('🎲 Placing bet...');
      await placeBet(betAmount);
      console.log('✅ Bet placed successfully!');
      
      // Small delay to ensure state updates are processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Set the bet amount in game context
      setCurrentBetAmount(betAmount);
      console.log('🎮 Set current bet amount:', betAmount);
      
      // Set the win/loss handlers that will be called by the game
      // We'll use a different approach - pass these as URL parameters
      const gameParams = new URLSearchParams({
        region,
        betAmount: betAmount.toString(),
        userId: user.id
      });

      console.log('🚀 Navigating to game with params:', gameParams.toString());

      toast({
        title: "Bet placed!",
        description: `$${betAmount} moved to hold wallet. Good luck!`,
      });

      // Navigate to game with parameters
      const gameUrl = `/game?${gameParams.toString()}`;
      console.log('🚀 Navigating to:', gameUrl);
      
      // Try multiple navigation methods to ensure it works
      try {
        setLocation(gameUrl);
        console.log('✅ setLocation completed');
        
        // Fallback: Use window.location if setLocation fails
        setTimeout(() => {
          if (window.location.pathname !== '/game') {
            console.log('🔄 Fallback navigation using window.location');
            window.location.href = gameUrl;
          }
        }, 100);
      } catch (navError) {
        console.error('❌ Navigation error:', navError);
        // Fallback navigation
        window.location.href = gameUrl;
      }
      
      console.log('🎯 Navigation completed!');
    } catch (error) {
      console.error('❌ Failed to place bet:', error);
      const errorMessage = error instanceof Error ? error.message : "Could not place bet. Please try again.";
      toast({
        title: "Bet failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  // Handle daily crate claim
  const handleClaimDailyCrate = async () => {
    if (!user) return;

    try {
      const response = await fetch(fullUrl(`/api/users/${user.id}/claim-daily-crate`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        throw new Error('Failed to claim daily crate');
      }
      
      const crate = await response.json();
      
      const reward = parseFloat(crate.reward);
      const newBalance = user.balance + reward;
      updateUser({ balance: newBalance });

      toast({
        title: "Daily Crate Claimed!",
        description: `You received $${reward.toFixed(2)}!`,
      });
    } catch (error) {
      toast({
        title: "Crate Already Claimed",
        description: "You've already claimed your daily crate today.",
        variant: "destructive",
      });
    }
  };


  // Check if user is completely new (never played any game)
  const isNewUser = () => {
    if (!user) return true;
    return !user.hasPlayedGame;
  };

  // Check if user has already claimed daily reward today
  const hasClaimedToday = () => {
    if (!user || !user.lastDailyRewardClaim) return false;
    const lastClaim = new Date(user.lastDailyRewardClaim);
    const now = new Date();
    const hoursSinceLastClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastClaim < 24;
  };

  // Check if daily reward is available
  const canClaimDailyReward = () => {
    if (!user || isLoggingOut) return false;
    return user.hasPlayedGame && !hasClaimedToday();
  };

  // Get hours until next reward is available
  const getHoursUntilNextReward = () => {
    if (!user || isLoggingOut || !user.lastDailyRewardClaim || canClaimDailyReward()) return 0;
    
    const lastClaim = new Date(user.lastDailyRewardClaim);
    const now = new Date();
    const hoursSinceLastClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
    
    return Math.ceil(24 - hoursSinceLastClaim);
  };

  // Handle daily reward claim
  const handleClaimDailyReward = async (rewardAmount: number = 0.10) => {
    if (!user) return;

    try {
      const response = await fetch(fullUrl('/api/auth/claim-daily-reward'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: user.username, rewardAmount }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to claim daily reward');
      }
      
      const data = await response.json();
      
      if (data.user) {
        updateUser(data.user);
      }

      toast({
        title: "Daily Reward Claimed!",
        description: data.message || "You received $0.20 (100% bonus included)!",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to claim daily reward.";
      toast({
        title: "Reward Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Handle top-up completion
  const handleTopUpComplete = async (amount: number) => {
    if (!user) return;
    
    try {
      console.log('💰 Refreshing user data after top-up:', { userId: user.id, amount });
      
      // Refresh user data to get the updated balance from server
      // The balance was already updated by the payment verification endpoint
      await refreshUser();
      
      toast({
        title: "Top-up Successful!",
        description: `Successfully added $${amount.toFixed(2)} to your wallet`,
      });
    } catch (error) {
      console.error('❌ Top-up refresh failed:', error);
      toast({
        title: "Top-up Successful",
        description: `Added $${amount.toFixed(2)} to your wallet, but failed to refresh balance display. Please refresh the page.`,
      });
    }
  };

  // Handle withdrawal completion
  const handleWithdrawComplete = async (amount: number) => {
    if (!user) return;
    
    try {
      console.log('💸 Processing withdrawal completion:', { userId: user.id, amount });
      
      // Refresh user data to get the updated balance from server
      // The balance was already updated by the withdrawal endpoint
      await refreshUser();
      
      toast({
        title: "Withdrawal Successful!",
        description: `Successfully withdrew $${amount.toFixed(2)} from your wallet`,
      });
    } catch (error) {
      console.error('❌ Withdrawal completion failed:', error);
      toast({
        title: "Withdrawal Successful",
        description: `Withdrew $${amount.toFixed(2)} from your wallet, but failed to refresh balance display. Please refresh the page.`,
      });
    }
  };

  // Handle username editing
  const handleStartEditUsername = () => {
    if (user) {
      setNewUsername(user.username);
      setIsEditingUsername(true);
    }
  };

  const handleSaveUsername = async () => {
    if (!user || !newUsername.trim()) return;
    
    try {
      console.log('Current user:', user);
      await updateUsername(newUsername.trim());
      setIsEditingUsername(false);
      toast({
        title: "Username Updated!",
        description: `Your username has been changed to "${newUsername.trim()}"`,
      });
    } catch (error) {
      console.error('Username update error in home:', error);
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update username",
        variant: "destructive",
      });
    }
  };

  const handleCancelEditUsername = () => {
    setIsEditingUsername(false);
    setNewUsername('');
  };

  // Get effective bet amount (either preset or custom)
  const getEffectiveBetAmount = () => {
    if (isCustomBet && customBetAmount && customBetAmount.trim() !== '') {
      const amount = parseFloat(customBetAmount);
      return isNaN(amount) || amount <= 0 ? 1 : amount;
    }
    return selectedBetAmount;
  };

  // Validate bet amount
  const isValidBetAmount = () => {
    const amount = getEffectiveBetAmount();
    return amount > 0 && amount <= 1000;
  };

  // Handle game win - move hold balance + winnings to main balance
  const handleGameWin = async (score: number, timeAlive: number) => {
    if (!user) return;
    
    const betAmount = getEffectiveBetAmount();
    
    // Fixed winnings - no multiplier system
    const winnings = betAmount; // Return bet amount only
    
    try {
      await winBet(betAmount, winnings);
      
      toast({
        title: "🎉 You Won!",
        description: `Won $${winnings.toFixed(2)} + bet back!`,
      });
    } catch (error) {
      console.error('Failed to process win:', error);
      toast({
        title: "Win Processing Error",
        description: "Your win couldn't be processed. Contact support.",
        variant: "destructive",
      });
    }
  };

  // Handle game loss - remove money from hold balance
  const handleGameLoss = async () => {
    if (!user) return;
    
    const betAmount = getEffectiveBetAmount();
    
    try {
      await loseBet(betAmount);
      
      toast({
        title: "💀 Game Over",
        description: `Lost $${betAmount.toFixed(2)} bet. Better luck next time!`,
        variant: "destructive",
      });
    } catch (error) {
      console.error('Failed to process loss:', error);
      toast({
        title: "Loss Processing Error",
        description: "Your loss couldn't be processed. Contact support.",
        variant: "destructive",
      });
    }
  };

  // Mouse controls are now handled in the SnakeGame component

  // Skip authentication for now - show homepage directly

  // Initialize decorative snake and food
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Create snake at random position
    const snake = new DecorativeSnake(
      Math.random() * canvas.width,
      Math.random() * canvas.height
    );
    setDecorativeSnake(snake);
    
    // Create initial food with wobble properties
    let currentFoods: Array<{ x: number; y: number; wobbleX: number; wobbleY: number }> = [];
    for (let i = 0; i < 20; i++) {
      currentFoods.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        wobbleX: Math.random() * Math.PI * 2,
        wobbleY: Math.random() * Math.PI * 2
      });
    }
    setFoods(currentFoods);
    
    // Animation loop
    const animate = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx || !snake) return;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update snake
      snake.update(canvas.width, canvas.height, currentFoods);
      
      // Check for food consumption
      currentFoods = snake.eatFood(currentFoods);
      
      // Update food wobble and attraction
      const time = Date.now() * 0.003;
      currentFoods.forEach(food => {
        // Update wobble - 50% slower
        food.wobbleX += 0.025;
        food.wobbleY += 0.015;
        
        // Check distance to snake
        const distanceToSnake = Math.sqrt((food.x - snake.head.x) ** 2 + (food.y - snake.head.y) ** 2);
        
        // Move towards snake if close (6x stronger gravitational pull)
        if (distanceToSnake < 80) {
          const attraction = 1.8; // Increased from 0.9 to 1.8 (2x stronger than before, 6x stronger than original)
          const angle = Math.atan2(snake.head.y - food.y, snake.head.x - food.x);
          food.x += Math.cos(angle) * attraction;
          food.y += Math.sin(angle) * attraction;
        }
      });
      
      // Add new food if some were eaten
      while (currentFoods.length < 20) {
        currentFoods.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          wobbleX: Math.random() * Math.PI * 2,
          wobbleY: Math.random() * Math.PI * 2
        });
      }
      
      // Draw food with wobble and glow effect
      currentFoods.forEach(food => {
        // Calculate wobble position
        const wobbleStrength = 2;
        const wobbleX = Math.sin(food.wobbleX) * wobbleStrength;
        const wobbleY = Math.cos(food.wobbleY) * wobbleStrength;
        const displayX = food.x + wobbleX;
        const displayY = food.y + wobbleY;
        
        // Create subtle glow effect
        const glowGradient = ctx.createRadialGradient(
          displayX, displayY, 0,
          displayX, displayY, 8
        );
        glowGradient.addColorStop(0, '#53d493');
        glowGradient.addColorStop(0.5, 'rgba(83, 212, 147, 0.4)');
        glowGradient.addColorStop(1, 'rgba(83, 212, 147, 0)');
        
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(displayX, displayY, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw solid food center
        ctx.fillStyle = '#53d493';
        ctx.beginPath();
        ctx.arc(displayX, displayY, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      
      // Draw snake
      snake.draw(ctx);
      
      requestAnimationFrame(animate);
    };
    
    animate();
    
    // Handle window resize
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white font-retro relative overflow-hidden" style={{backgroundColor: '#15161b'}}>
      {/* Background canvas for decorative snake */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 0 }}
      />
      
      {/* Content wrapper with higher z-index */}
      <div className="relative" style={{ zIndex: 10 }}>
        {/* Top Bar - Welcome with gaming controller icon */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center">
          <span className="text-white text-lg">Welcome, </span>
          {isEditingUsername ? (
            <div className="flex items-center gap-2">
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="text-lg font-bold bg-gray-800 border-green-500 text-white font-retro px-2 py-1 h-8 w-32"
                placeholder="Enter username"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveUsername();
                  } else if (e.key === 'Escape') {
                    handleCancelEditUsername();
                  }
                }}
                autoFocus
              />
              <button
                onClick={handleSaveUsername}
                className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 text-xs border border-green-500 font-retro"
              >
                ✓
              </button>
              <button
                onClick={handleCancelEditUsername}
                className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 text-xs border border-red-500 font-retro"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold" style={{color: '#53d493'}}>
                {user ? user.username : 'Guest'}
              </span>
              {user && (
                <button
                  onClick={handleStartEditUsername}
                  className="text-gray-400 hover:text-green-400 transition-colors p-1"
                  title="Edit username"
                >
                  <Edit3 size={16} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex flex-col gap-2">
              <button 
                onClick={async () => {
                  try {
                    await logout();
                    toast({
                      title: "See You Later!",
                      description: "Successfully logged out from PumpGames.Fun",
                    });
                  } catch (error) {
                    toast({
                      title: "Logout Error",
                      description: "Failed to logout properly, but you've been logged out locally.",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={isLoggingOut}
                className={`px-3 py-1 text-sm border-2 font-retro transition-all duration-200 ${
                  isLoggingOut 
                    ? 'bg-gray-600 text-gray-300 border-gray-500 cursor-not-allowed' 
                    : 'bg-red-600 text-white hover:bg-red-700 border-red-500 hover:border-red-400'
                }`}
              >
                {isLoggingOut ? 'Logging out...' : 'Logout'}
              </button>
              <button 
                onClick={() => {
                  if (isLoggingOut) return; // Don't allow clicks during logout
                  if (canClaimDailyReward()) {
                    setIsDailyRewardOpen(true);
                  } else if (isNewUser()) {
                    // Show the daily reward modal with play game message (for new users)
                    setIsDailyRewardOpen(true);
                  } else {
                    // User has played but already claimed today - show timer modal
                    setIsDailyRewardTakenOpen(true);
                  }
                }}
                disabled={isLoggingOut}
                className={`px-3 py-1 text-sm border-2 font-retro flex items-center gap-1 ${
                  isLoggingOut 
                    ? 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed'
                    : canClaimDailyReward() 
                      ? 'bg-yellow-600 text-white hover:bg-yellow-700 border-yellow-500' 
                      : isNewUser()
                        ? 'bg-blue-600 text-blue-200 border-blue-500 cursor-pointer hover:bg-blue-500'
                        : 'bg-gray-600 text-gray-300 border-gray-500 cursor-pointer hover:bg-gray-500'
                }`}
              >
                <Gift className="w-4 h-4" />
                {(() => {
                  if (canClaimDailyReward()) {
                    return 'Spin & Collect';
                  } else if (isNewUser()) {
                    return 'Play 1 Game';
                  } else {
                    return `${getHoursUntilNextReward()}h left`;
                  }
                })()}
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsLoginModalOpen(true)}
              className="bg-green-600 text-white px-3 py-1 text-sm hover:bg-green-700 border-2 border-green-500 font-retro"
            >
              Login
            </button>
          )}
        </div>
      </div>

      {/* Main Content Container */}
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <div className="w-full max-w-4xl px-4">
          
          {/* Title Section */}
          <div className="text-center mb-8">
            <h1 className="text-white text-4xl font-bold mb-2 font-retro tracking-wider">
              PumpGames<span style={{color: '#53d493'}}>.fun</span>
            </h1>
            <p className="text-gray-300 text-lg font-retro">Play,Earn,Have Fun!</p>
          </div>

          {/* Main Game Area - Three Column Layout */}
          <div className="grid grid-cols-3 gap-6 max-w-5xl mx-auto">
            
            {/* Left Panel - Leaderboard */}
            <Leaderboard onViewFull={() => setIsLeaderboardModalOpen(true)} />

            {/* Center Panel - Game Controls */}
            <div className="bg-gray-800 p-3 border-2 border-gray-600">
              
              {/* Username with edit icon */}
              <div className="flex items-center justify-between mb-3 bg-gray-700 px-3 py-2 border-2 border-gray-600">
                {isEditingUsername ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="text-xs font-retro bg-gray-800 border-green-500 text-white px-2 py-1 h-6 flex-1"
                      placeholder="Enter username"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveUsername();
                        } else if (e.key === 'Escape') {
                          handleCancelEditUsername();
                        }
                      }}
                      autoFocus
                    />
                    <button
                      onClick={handleSaveUsername}
                      className="bg-green-600 hover:bg-green-700 text-white px-1 py-1 text-xs border border-green-500 font-retro"
                    >
                      ✓
                    </button>
                    <button
                      onClick={handleCancelEditUsername}
                      className="bg-red-600 hover:bg-red-700 text-white px-1 py-1 text-xs border border-red-500 font-retro"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-gray-300 font-retro text-xs">
                      {user ? user.username : '〈Username〉'}
                    </span>
                    <button
                      onClick={handleStartEditUsername}
                      className="text-gray-400 hover:text-white cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
              
              {/* Bet Amount Selection */}
              <div className="grid grid-cols-3 gap-1 mb-3">
                <button 
                  onClick={() => {
                    setSelectedBetAmount(1);
                    setIsCustomBet(false);
                    setCustomBetAmount('');
                  }}
                  className={`py-2 px-3 text-sm border-2 font-retro ${
                    selectedBetAmount === 1 && !isCustomBet
                      ? 'text-white border-2' 
                      : 'bg-gray-700 text-white border-gray-600 hover:bg-gray-600'
                  }`}
                  style={selectedBetAmount === 1 && !isCustomBet ? {backgroundColor: '#53d493', borderColor: '#53d493'} : {}}
                >
                  $1
                </button>
                <button 
                  onClick={() => {
                    // Locked - do nothing
                  }}
                  disabled={true}
                  className="py-2 px-3 text-sm border-2 font-retro bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed opacity-50"
                >
                  $5 🔒
                </button>
                <button 
                  onClick={() => {
                    // Locked - do nothing
                  }}
                  disabled={true}
                  className="py-2 px-3 text-sm border-2 font-retro bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed opacity-50"
                >
                  $20 🔒
                </button>
              </div>
              
              {/* Custom Bet Amount */}
              {/* <div className="mb-3">
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      setIsCustomBet(true);
                      // If there's already a custom amount, use it; otherwise keep current selected amount
                      if (customBetAmount && customBetAmount.trim() !== '') {
                        const amount = parseFloat(customBetAmount);
                        if (!isNaN(amount) && amount > 0) {
                          setSelectedBetAmount(amount);
                        }
                      }
                    }}
                    className={`py-2 px-3 text-sm border-2 font-retro flex-shrink-0 ${
                      isCustomBet
                        ? 'text-white border-2' 
                        : 'bg-gray-700 text-white border-gray-600 hover:bg-gray-600'
                    }`}
                    style={isCustomBet ? {backgroundColor: '#53d493', borderColor: '#53d493'} : {}}
                  >
                    Custom
                  </button>
                  <Input
                    type="number"
                    value={customBetAmount}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomBetAmount(value);
                      console.log('📝 Custom bet input changed:', { value, isCustomBet });
                      
                      // Automatically set custom bet mode when user types
                      if (value.trim() !== '') {
                        setIsCustomBet(true);
                        const amount = parseFloat(value);
                        console.log('💰 Parsed amount:', { amount, isValid: !isNaN(amount) && amount > 0 });
                        if (!isNaN(amount) && amount > 0) {
                          setSelectedBetAmount(amount);
                        }
                      } else {
                        // If input is cleared, reset to default bet amount
                        setIsCustomBet(false);
                        setSelectedBetAmount(1);
                      }
                    }}
                    onFocus={() => setIsCustomBet(true)}
                    placeholder="Enter $"
                    min="1"
                    max="1000"
                    step="0.01"
                    className="px-2 py-2 bg-gray-800 border-2 border-gray-600 focus:border-green-500 text-white font-retro text-sm flex-1 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                  />
                </div>
                {isCustomBet && customBetAmount && customBetAmount.trim() !== '' && parseFloat(customBetAmount) > 0 && (
                  <p className="text-green-400 text-xs mt-1 font-retro">
                    Bet Amount: ${parseFloat(customBetAmount).toFixed(2)}
                  </p>
                )}
              </div> */}
              
              {/* Auto Region and Friends */}
              <div className="mb-3">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => {
                      if (user) {
                        handleStartGameWithRegion('us');
                      } else {
                        setIsLoginModalOpen(true);
                      }
                    }}
                    className={`py-2 px-2 text-xs border-2 font-retro transition-colors flex flex-col items-center justify-center ${
                      user 
                        ? 'border-gray-600 hover:bg-gray-600' 
                        : 'border-gray-700 cursor-not-allowed opacity-60'
                    }`}
                    style={{
                      backgroundColor: user ? '#53d493' : '#666', 
                      borderColor: user ? '#53d493' : '#666', 
                      color: 'white'
                    }}
                    disabled={isDetectingRegion || !user}
                  >
                    <span className="text-sm">🌍</span>
                    <span>{user ? 'Auto' : 'Login Required'}</span>
                  </button>
                  <button 
                    onClick={() => {
                      if (user) {
                        setIsFriendsModalOpen(true);
                      } else {
                        setIsLoginModalOpen(true);
                      }
                    }}
                    className={`py-2 px-2 text-xs border-2 font-retro transition-colors flex flex-col items-center justify-center relative ${
                      user 
                        ? 'bg-gray-700 text-white border-gray-600 hover:bg-gray-600' 
                        : 'bg-gray-800 text-gray-400 border-gray-700 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <span className="text-sm">👥</span>
                    <span>{user ? 'Friends' : 'Login Required'}</span>
                  </button>
                </div>
              </div>

              {/* Play Button */}
              <button 
                onClick={() => {
                  console.log('🎮 Play button clicked - Debug info:', {
                    user: !!user,
                    userId: user?.id,
                    isCustomBet,
                    customBetAmount,
                    selectedBetAmount,
                    effectiveBetAmount: getEffectiveBetAmount(),
                    userBalance: user ? Number(user.balance) : 0,
                    isValid: isValidBetAmount()
                  });
                  
                  if (user) {
                    // Validate bet amount first
                    if (!isValidBetAmount()) {
                      console.log('❌ Invalid bet amount');
                      toast({
                        title: "Invalid Bet Amount",
                        description: "Please enter a valid bet amount between $1 and $1000",
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    // Check if user has sufficient balance for the bet amount
                    const effectiveBetAmount = getEffectiveBetAmount();
                    const userBalance = Number(user.balance);
                    
                    console.log('💰 Balance check:', { userBalance, effectiveBetAmount, sufficient: userBalance >= effectiveBetAmount });
                    
                    if (userBalance < effectiveBetAmount) {
                      console.log('⚠️ Insufficient balance, showing warning modal');
                      setIsBalanceWarningOpen(true);
                    } else {
                      console.log('✅ Sufficient balance, starting game...');
                      handleStartGameWithRegion('us');
                    }
                  } else {
                    console.log('❌ No user, showing login modal');
                    setIsLoginModalOpen(true);
                  }
                }}
                className={`font-bold text-lg py-3 w-full mb-3 font-retro transition-colors border-2 ${
                  user && isValidBetAmount()
                    ? 'text-white' 
                    : 'text-gray-300 cursor-pointer'
                }`}
                style={{
                  backgroundColor: user && isValidBetAmount() ? '#53d493' : '#666', 
                  borderColor: user && isValidBetAmount() ? '#53d493' : '#666'
                }}
                onMouseEnter={(e) => {
                  if (user && isValidBetAmount()) {
                    (e.target as HTMLButtonElement).style.backgroundColor = '#4ac785';
                  }
                }}
                onMouseLeave={(e) => {
                  if (user && isValidBetAmount()) {
                    (e.target as HTMLButtonElement).style.backgroundColor = '#53d493';
                  }
                }}
                disabled={isDetectingRegion || (user && !isValidBetAmount())}
              >
                {isDetectingRegion ? 'DETECTING...' : 
                 !user ? 'LOGIN TO PLAY' :
                 !isValidBetAmount() ? 'INVALID BET' :
                 'PLAY'}
              </button>
              

              
              {/* Stats at bottom */}
              <div className="grid grid-cols-2 gap-2 text-center border-t border-gray-600 pt-2">
                <div>
                  <div className="text-white font-bold text-sm font-retro">{animatedPlayerCount}</div>
                  <div className="text-gray-400 text-xs font-retro">Players Online</div>
                </div>
                <div>
                  <div className="text-white font-bold text-sm font-retro">+${dailyWinnings.toLocaleString()}</div>
                  <div className="text-gray-400 text-xs font-retro">Global Winnings (24hr)</div>
                </div>
              </div>
            </div>

            {/* Right Panel - Wallet */}
            <div className="bg-gray-800 p-3 border-2 border-gray-600 flex flex-col self-start">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white text-sm font-retro">Wallet</h3>
                {user && (
                  <button
                    onClick={async () => {
                      try {
                        await refreshUser();
                        toast({
                          title: "Balance Refreshed",
                          description: "Wallet balance updated from server",
                        });
                      } catch (error) {
                        toast({
                          title: "Refresh Failed",
                          description: "Failed to refresh balance",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
                    title="Refresh balance"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
              </div>
              
              {/* Balance Display */}
              <div className="font-bold text-lg mb-3 text-center bg-gray-900 py-3 border-2 border-gray-600 font-retro" style={{color: '#53d493'}}>
                {user ? `$${Number(user.balance).toFixed(2)}` : '$0.00'}
              </div>
              
              {/* Wallet buttons */}
              <div className={`grid ${user?.isClipper ? 'grid-cols-1' : 'grid-cols-2'} gap-1`}>
                <button 
                  onClick={() => {
                    if (user) {
                      setIsTopUpModalOpen(true);
                    } else {
                      setIsLoginModalOpen(true);
                    }
                  }}
                  className="bg-gray-700 text-white py-1 px-1 text-xs border-2 border-gray-600 hover:bg-gray-600 font-retro"
                >
                  Top Up
                </button>
                {!user?.isClipper && (
                  <button 
                    onClick={() => {
                      if (user) {
                        setIsWithdrawModalOpen(true);
                      } else {
                        setIsLoginModalOpen(true);
                      }
                    }}
                    className="bg-gray-700 text-white py-1 px-1 text-xs border-2 border-gray-600 hover:bg-gray-600 font-retro"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
      
      {/* Discord Join Button - Bottom Left */}
      <div className="fixed bottom-4 left-4 z-50">
        <a
          href="https://discord.gg/Bf9jCDycnC"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg border-2 border-indigo-500 hover:border-indigo-400 font-retro text-sm flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-indigo-500/25"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Join Discord
        </a>
      </div>
      
      </div> {/* End content wrapper */}
      {/* Celebration Popup */}
      {showCelebration && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center">
          {/* Confetti Animation */}
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="absolute animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `confetti-fall ${2 + Math.random() * 3}s linear infinite`,
                  animationDelay: `${Math.random() * 2}s`
                }}
              >
                <div
                  className="w-2 h-2 rotate-45"
                  style={{
                    backgroundColor: ['#ffd700', '#ff6b6b', '#4ecdc4', '#95e1d3', '#f38ba8'][Math.floor(Math.random() * 5)]
                  }}
                />
              </div>
            ))}
          </div>
          
          {/* Celebration Content */}
          <div className="relative bg-gray-900/95 border border-yellow-400/30 rounded-2xl p-8 text-center max-w-md mx-4 shadow-2xl">
            {/* Trophy Background */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <Trophy className="w-64 h-64 text-yellow-400" />
            </div>
            
            {/* Content */}
            <div className="relative z-10">
              <div className="mb-6">
                <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4 animate-bounce" />
                <h2 className="text-3xl font-bold text-yellow-400 mb-2">
                  Cash Out Complete!
                </h2>
                <p className="text-gray-300 text-lg">
                  Congratulations on your profit!
                </p>
              </div>
              
              <div className="mb-8">
                <div className="text-5xl font-bold text-green-400 mb-2">
                  ${cashOutAmount.toFixed(2)}
                </div>
                <div className="text-gray-400">
                  Successfully cashed out
                </div>
              </div>
              
              <Button
                onClick={() => setShowCelebration(false)}
                className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8 py-3 rounded-lg"
                data-testid="button-close-celebration"
              >
                <X className="w-4 h-4 mr-2" />
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Popup */}
      {showGameOver && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center">
          {/* Game Over Content */}
          <div className="relative bg-gray-900/95 border border-red-400/30 rounded-2xl p-8 text-center max-w-md mx-4 shadow-2xl">
            {/* Content */}
            <div className="relative z-10">
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                  <div className="text-4xl">💀</div>
                </div>
                <h2 className="text-3xl font-bold text-red-400 mb-2">
                  Game Over
                </h2>
                <p className="text-gray-300 text-lg">
                  Better luck next time!
                </p>
              </div>
              
              <div className="mb-8">
                <div className="bg-gray-800/50 rounded-lg p-6">
                  <div className="text-sm text-gray-400 mb-2">Time Survived</div>
                  <div className="text-4xl font-bold text-white">
                    {Math.floor(gameOverData.timeAlive / 60)}:{String(gameOverData.timeAlive % 60).padStart(2, '0')}
                  </div>
                </div>
              </div>
              
              <Button
                onClick={() => setShowGameOver(false)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-lg"
                data-testid="button-close-game-over"
              >
                <X className="w-4 h-4 mr-2" />
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Friends Modal */}
      <FriendsModal
        isOpen={isFriendsModalOpen}
        onClose={() => setIsFriendsModalOpen(false)}
      />
      
      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
      
      {/* Balance Warning Modal */}
      <BalanceWarningModal
        isOpen={isBalanceWarningOpen}
        onClose={() => setIsBalanceWarningOpen(false)}
        currentBalance={user ? Number(user.balance) : 0}
        requiredBalance={getEffectiveBetAmount()}
      />
      
      {/* Daily Reward Modal */}
      <DailyRewardModal
        isOpen={isDailyRewardOpen}
        onClose={() => setIsDailyRewardOpen(false)}
        onClaim={handleClaimDailyReward}
        canClaim={canClaimDailyReward()}
        hoursUntilNext={getHoursUntilNextReward()}
        hasPlayedToday={user?.hasPlayedGame || false}
        isNewUser={isNewUser()}
      />
      
      {/* Daily Reward Already Taken Modal */}
      <Dialog open={isDailyRewardTakenOpen} onOpenChange={setIsDailyRewardTakenOpen}>
        <DialogContent className="bg-gradient-to-br from-gray-800 to-gray-900 border-4 border-yellow-400 text-white max-w-lg w-full mx-4 rounded-2xl shadow-2xl [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-retro text-yellow-300 mb-4">
              Daily Reward Already Claimed! 🎁
            </DialogTitle>
          </DialogHeader>
          
          <div className="text-center space-y-4">
            <div className="bg-gradient-to-br from-yellow-800/40 to-yellow-900/60 border-4 border-yellow-400 rounded-2xl p-6 shadow-2xl">
              <div className="text-yellow-300 text-lg mb-4 tracking-wider text-center font-retro-fixed">
                ⏰ Come Back Later!
              </div>
              <div className="text-white text-xl mb-3 tracking-wide text-center font-retro-fixed">
                You've already claimed your daily reward today
              </div>
              <p className="text-gray-200 text-sm tracking-wide text-center font-retro-fixed">
                Next reward available in: <span className="text-yellow-300 font-bold">{getHoursUntilNextReward()} hours</span>
              </p>
            </div>
            
            <Button
              onClick={() => setIsDailyRewardTakenOpen(false)}
              className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 font-retro-fixed py-3 text-white rounded-xl border-4 border-yellow-400 text-lg font-bold tracking-wide shadow-lg hover:shadow-yellow-500/25 transition-all duration-200"
            >
              Got It!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Top Up Modal */}
      <TopUpModal
        isOpen={isTopUpModalOpen}
        onClose={() => setIsTopUpModalOpen(false)}
        currentBalance={user ? Number(user.balance) : 0}
        onTopUpComplete={handleTopUpComplete}
      />
      
      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        currentBalance={user ? Number(user.balance) : 0}
        onWithdrawComplete={handleWithdrawComplete}
      />
      
      <LeaderboardModal
        isOpen={isLeaderboardModalOpen}
        onClose={() => setIsLeaderboardModalOpen(false)}
      />
    </div>
  );
}
