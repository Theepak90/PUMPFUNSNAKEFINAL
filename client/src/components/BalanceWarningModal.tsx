import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, X } from 'lucide-react';

interface BalanceWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  requiredBalance: number;
}

export default function BalanceWarningModal({ 
  isOpen, 
  onClose, 
  currentBalance, 
  requiredBalance 
}: BalanceWarningModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="bg-gray-800 border-2 border-red-600 text-white max-w-md w-full mx-4 rounded-xl shadow-2xl [&>button]:hidden"
      >
        {/* Header */}
        <DialogHeader className="pb-4 border-b border-red-700">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 font-retro text-xl text-red-400">
              <AlertTriangle className="w-6 h-6" />
              Insufficient Balance
            </DialogTitle>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors border-2 border-gray-600 hover:border-gray-500"
            >
              <X className="w-5 h-5 text-gray-400 hover:text-white" />
            </button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6 pt-2">
          {/* Warning Message */}
          <div className="text-center space-y-4">
            <div className="bg-red-900/30 border-2 border-red-600/50 rounded-lg p-4">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-red-400" />
              <h3 className="text-lg font-retro text-red-400 mb-2">
                Balance must be at least ${requiredBalance.toFixed(2)} to play
              </h3>
              <p className="text-gray-300 font-retro text-sm">
                Your current balance: ${currentBalance.toFixed(2)}
              </p>
            </div>
            
            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-gray-300 font-retro text-sm mb-3">
                You need ${(requiredBalance - currentBalance).toFixed(2)} more to start playing
              </p>
              <p className="text-gray-400 font-retro text-xs">
                Top up your balance to join the PumpGames.Fun action!
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-700">
            <Button
              onClick={onClose}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-retro py-3 rounded-lg border-2 border-gray-500"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                // TODO: Implement top up functionality
                onClose();
              }}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-retro py-3 rounded-lg border-2 border-green-500"
            >
              Top Up Balance
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}