import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Gift, X } from 'lucide-react';

interface DailyRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClaim: (rewardAmount: number) => void;
  canClaim: boolean;
  hoursUntilNext: number;
  hasPlayedToday?: boolean;
  isNewUser?: boolean;
}

const spinRewards = [
  { label: '$0.10', value: 0.10, color: '#10b981' },
  { label: '$0.50', value: 0.50, color: '#ef4444' },
  { label: '$1', value: 1.00, color: '#3b82f6' },
  { label: '$5', value: 5.00, color: '#8b5cf6' },
  { label: '$10', value: 10.00, color: '#f59e0b' },
  { label: '$100', value: 100.00, color: '#06b6d4' },
  { label: '$500', value: 500.00, color: '#f97316' },
  { label: '$1000', value: 1000.00, color: '#eab308' },
];

export default function DailyRewardModal({ isOpen, onClose, onClaim, canClaim, hoursUntilNext, hasPlayedToday, isNewUser }: DailyRewardModalProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);
  const [wonReward, setWonReward] = useState<typeof spinRewards[0] | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  const handleSpin = async () => {
    if (!canClaim || isSpinning || hasSpun) return;
    
    setIsSpinning(true);
    
    // Prize probabilities as specified
    const weights = [100, 0, 0, 0, 0, 0, 0, 0]; // $0.10 = 100%, all others = 0%
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);  
    let random = Math.random() * totalWeight;
    
    let selectedIndex = 0;
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }
    
    const selectedReward = spinRewards[selectedIndex];
    const segmentAngle = 360 / spinRewards.length;
    const targetAngle = selectedIndex * segmentAngle + (segmentAngle / 2);
    const spins = 5; // Number of full rotations
    const finalRotation = spins * 360 + (360 - targetAngle); // Spin to the selected segment
    
    // Apply rotation to wheel
    if (wheelRef.current) {
      wheelRef.current.style.transform = `rotate(${finalRotation}deg)`;
    }
    
    // Wait for spin animation to complete
    setTimeout(async () => {
      setWonReward(selectedReward);
      setHasSpun(true);
      setIsSpinning(false);
      
      // Don't call onClaim immediately - let user see the congratulations first
      // onClaim will be called when user clicks "Awesome!" button
    }, 3000); // 3 seconds for spin animation
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gradient-to-br from-gray-800 to-gray-900 border-4 border-green-400 text-white max-w-md w-full mx-4 rounded-2xl shadow-2xl [&>button]:hidden">
        {/* Header */}
        <DialogHeader className="pb-4 border-b-2 border-green-400/50">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 font-retro text-lg text-green-300 tracking-wide">
              <Gift className="w-5 h-5" />
              Daily Spin Wheel
            </DialogTitle>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors border-2 border-gray-500 hover:border-green-400 bg-gray-800"
            >
              <X className="w-5 h-5 text-gray-300 hover:text-green-300" />
            </button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6 pt-2">
          {!hasPlayedToday ? (
            <div className="text-center space-y-4">
              <div className="bg-blue-900/30 border-2 border-blue-600/50 rounded-lg p-4">
                <p className="text-blue-400 font-retro text-lg mb-2">
                  🎮 Play 1 Game to Collect Reward!
                </p>
                <p className="text-gray-300 font-retro text-sm">
                  Play at least 1 game to unlock daily rewards and spin the wheel!
                </p>
              </div>
            </div>
          ) : !canClaim ? (
            <div className="text-center space-y-4">
              <div className="bg-red-900/30 border-2 border-red-600/50 rounded-lg p-4">
                <p className="text-red-400 font-retro text-lg mb-2">
                  ⏰ Already Spun Today!
                </p>
                <p className="text-gray-300 font-retro text-sm">
                  Next spin available in: <span className="text-yellow-400 font-bold">{hoursUntilNext} hours</span>
                </p>
              </div>
            </div>
          ) : hasSpun ? (
            <div className="text-center space-y-4">
              <div className="bg-gradient-to-br from-green-800/40 to-green-900/60 border-4 border-green-400 rounded-2xl p-6 shadow-2xl max-w-sm mx-auto">
                <div className="text-green-300 text-lg mb-4 tracking-wider text-center font-retro-fixed">
                  🎉 Congratulations!
                </div>
                <div className="text-white text-xl mb-3 tracking-wide text-center font-retro-fixed">
                  You won: <span className="text-yellow-300 font-bold text-2xl">{wonReward?.label}</span>
                </div>
                <p className="text-gray-200 text-sm tracking-wide text-center font-retro-fixed">
                  Added to your balance!
                </p>
              </div>
              <Button
                onClick={async () => {
                  try {
                    if (wonReward) {
                      await onClaim(wonReward.value);
                    }
                  } catch (error) {
                    console.error('Failed to claim reward:', error);
                  }
                  onClose();
                }}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 font-retro-fixed py-3 text-white rounded-xl border-4 border-green-400 text-lg font-bold tracking-wide shadow-lg hover:shadow-green-500/25 transition-all duration-200"
              >
                Awesome!
              </Button>
            </div>
          ) : (
            <>
              {/* Spinning Wheel */}
              <div className="flex justify-center relative">
                <div className="relative">
                  {/* Pointer */}
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2 z-10">
                    <div className="w-0 h-0 border-l-[15px] border-r-[15px] border-t-[25px] border-l-transparent border-r-transparent border-t-white"></div>
                  </div>
                  
                  {/* Wheel */}
                  <div 
                    ref={wheelRef}
                    className="w-80 h-80 rounded-full relative overflow-hidden"
                    style={{
                      transition: isSpinning ? 'transform 3s cubic-bezier(0.23, 1, 0.32, 1)' : 'none',
                    }}
                  >
                    {spinRewards.map((reward, index) => {
                      const segmentAngle = 360 / spinRewards.length;
                      const rotation = index * segmentAngle;
                      
                      return (
                        <div
                          key={index}
                          className="absolute inset-0 flex items-center justify-center"
                          style={{
                            clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.cos((segmentAngle * Math.PI) / 180)}% ${50 - 50 * Math.sin((segmentAngle * Math.PI) / 180)}%)`,
                            transform: `rotate(${rotation}deg)`,
                            backgroundColor: reward.color,
                          }}
                        >
                          <div 
                            className="text-white font-retro text-sm font-bold absolute"
                            style={{
                              transform: `rotate(${segmentAngle / 2}deg) translateY(-120px)`,
                            }}
                          >
                            {reward.label}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Center circle */}
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-gray-800 rounded-full border-4 border-white flex items-center justify-center">
                      <Gift className="w-6 h-6 text-green-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Spin Button */}
              <Button
                onClick={handleSpin}
                disabled={isSpinning || !canClaim}
                className="w-full bg-green-600 hover:bg-green-700 font-retro py-3 text-white rounded-lg border-2 border-green-500 text-lg disabled:bg-gray-600 disabled:border-gray-500"
              >
                {isSpinning ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Spinning...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Gift className="w-5 h-5" />
                    Spin the Wheel!
                  </div>
                )}
              </Button>
              
              <p className="text-center text-gray-400 font-retro text-xs">
                Spin once per day for your chance to win rewards!
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}