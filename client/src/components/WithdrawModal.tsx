import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Copy, CheckCircle, DollarSign, ArrowLeft, X, Loader2, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { fullUrl } from '@/lib/queryClient';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  onWithdrawComplete: (amount: number) => void;
}

export default function WithdrawModal({ isOpen, onClose, currentBalance, onWithdrawComplete }: WithdrawModalProps) {
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [solPrice, setSolPrice] = useState<number>(0);
  const [mainWalletBalance, setMainWalletBalance] = useState<{ balance: number; balanceUSD: number } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch SOL price and main wallet balance when modal opens
  React.useEffect(() => {
    if (isOpen) {
      fetchSOLPrice();
      fetchMainWalletBalance();
    }
  }, [isOpen]);

  const fetchSOLPrice = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await response.json();
      setSolPrice(data.solana?.usd || 100);
    } catch (error) {
      console.error('Error fetching SOL price:', error);
      setSolPrice(100); // Fallback price
    }
  };

  const fetchMainWalletBalance = async () => {
    try {
      const response = await fetch(fullUrl('/api/wallet/main/balance'));
      const data = await response.json();
      if (data.success) {
        setMainWalletBalance({
          balance: data.balance,
          balanceUSD: data.balanceUSD
        });
      }
    } catch (error) {
      console.error('Error fetching main wallet balance:', error);
    }
  };

  const handleAmountChange = (value: string) => {
    // Allow only numbers and one decimal point
    const regex = /^\d*\.?\d*$/;
    if (regex.test(value)) {
      setWithdrawAmount(value);
    }
  };

  // Validate Solana wallet address
  const isValidSolanaAddress = (address: string): boolean => {
    // Solana addresses are base58 encoded and typically 32-44 characters long
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || !walletAddress || !user?.id) {
      toast({
        title: "Missing Information",
        description: "Please fill in both amount and wallet address",
        variant: "destructive",
      });
      return;
    }

    // Validate wallet address
    if (!isValidSolanaAddress(walletAddress.trim())) {
      toast({
        title: "Invalid Wallet Address",
        description: "Please enter a valid Solana wallet address",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (amount < 0.01) {
      toast({
        title: "Minimum Withdrawal",
        description: "Minimum withdrawal amount is 0.01 SOL",
        variant: "destructive",
      });
      return;
    }

    // Check user balance
    const userBalanceInSOL = currentBalance / solPrice;
    if (userBalanceInSOL < amount) {
      toast({
        title: "Insufficient Balance",
        description: `Available: ${userBalanceInSOL.toFixed(6)} SOL ($${currentBalance.toFixed(2)})`,
        variant: "destructive",
      });
      return;
    }

    // Check main wallet balance
    if (mainWalletBalance && mainWalletBalance.balance < amount) {
      toast({
        title: "Insufficient Main Wallet Balance",
        description: `Available: ${mainWalletBalance.balance.toFixed(6)} SOL`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch(fullUrl('/api/withdraw'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          walletAddress: walletAddress.trim(),
          amount: amount
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Withdrawal Successful! 🎉",
          description: `Sent ${amount} SOL to ${walletAddress.substring(0, 8)}...`,
        });

        // Call the completion callback
        onWithdrawComplete(data.withdrawnAmountUSD);

        // Reset form
        setWithdrawAmount('');
        setWalletAddress('');
        
        // Close modal
        onClose();
      } else {
        toast({
          title: "Withdrawal Failed",
          description: data.message || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Withdrawal error:', error);
      toast({
        title: "Network Error",
        description: "Failed to process withdrawal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Address copied to clipboard",
    });
  };

  const openInExplorer = () => {
    window.open(`https://explorer.solana.com/address/3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv`, '_blank');
  };

  const userBalanceInSOL = solPrice > 0 ? currentBalance / solPrice : 0;
  const withdrawalAmountUSD = parseFloat(withdrawAmount) * solPrice;

  // Show message for clipper accounts
  if (user?.isClipper) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-2 border-gray-600 text-white max-w-md w-full mx-4 rounded-xl shadow-2xl [&>button]:hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-4 border-b border-red-500/30">
            <DialogTitle className="text-xl font-retro text-red-400 flex items-center gap-2">
              <DollarSign size={20} />
              Withdraw SOL
            </DialogTitle>
            <Button
              onClick={onClose}
              className="absolute right-4 top-4 text-gray-400 hover:text-white p-1 h-auto"
            >
              <X size={20} />
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 scrollbar-thin scrollbar-thumb-red-500 scrollbar-track-gray-800">
            <div className="space-y-4 pt-2">
              <div className="bg-red-900/30 border-2 border-red-600/50 rounded-lg p-6 text-center">
                <div className="text-red-400 text-4xl mb-4">🚫</div>
                <h3 className="text-red-400 font-retro text-lg mb-2">Withdrawals Not Allowed</h3>
                <p className="text-red-200 font-retro text-sm">
                  This account type does not support withdrawals. You can still play games and use your balance for betting.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-2 border-gray-600 text-white max-w-md w-full mx-4 rounded-xl shadow-2xl [&>button]:hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="pb-4 border-b border-red-500/30">
          <DialogTitle className="text-xl font-retro text-red-400 flex items-center gap-2">
            <DollarSign size={20} />
            Withdraw SOL
          </DialogTitle>
          <Button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-white p-1 h-auto"
          >
            <X size={20} />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 scrollbar-thin scrollbar-thumb-red-500 scrollbar-track-gray-800">
          <div className="space-y-4 pt-2">
            {/* Current Balance */}
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-retro text-sm">Your Balance:</span>
                <div className="text-right">
                  <div className="text-green-400 font-retro text-sm">
                    ${currentBalance.toFixed(2)} USD
                  </div>
                  <div className="text-gray-400 font-retro text-xs">
                    {userBalanceInSOL.toFixed(6)} SOL
                  </div>
                </div>
              </div>
            </div>

            {/* Main Wallet Balance */}
            {/*{mainWalletBalance && (
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-retro text-sm">Main Wallet:</span>
                  <div className="text-right">
                    <div className="text-blue-400 font-retro text-sm">
                      ${mainWalletBalance.balanceUSD.toFixed(2)} USD
                    </div>
                    <div className="text-gray-400 font-retro text-xs">
                      {mainWalletBalance.balance.toFixed(6)} SOL
                    </div>
                  </div>
                </div>
                <Button
                  onClick={openInExplorer}
                  className="mt-2 w-full bg-blue-600 hover:bg-blue-700 font-retro py-1 text-white rounded-lg border border-blue-500 text-xs flex items-center justify-center gap-2"
                >
                  <ExternalLink size={12} />
                  <span className="font-retro">View on Explorer</span>
                </Button>
              </div>
            )} */}

            {/* Amount Input */}
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
              <label className="text-gray-300 font-retro text-sm mb-2 block">
                Amount (SOL)
              </label>
              <Input
                type="text"
                value={withdrawAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.01"
                className="bg-gray-900 border-gray-600 text-white font-retro text-sm"
              />
              {withdrawAmount && (
                <div className="mt-2 text-xs text-gray-400 font-retro">
                  ≈ ${withdrawalAmountUSD.toFixed(2)} USD
                </div>
              )}
            </div>

            {/* Wallet Address Input */}
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
              <label className="text-gray-300 font-retro text-sm mb-2 block">
                Your SOL Wallet Address
              </label>
              <Input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Enter your Solana wallet address..."
                className={`bg-gray-900 text-white font-retro text-sm ${
                  walletAddress && !isValidSolanaAddress(walletAddress.trim())
                    ? 'border-red-500 focus:border-red-500'
                    : walletAddress && isValidSolanaAddress(walletAddress.trim())
                    ? 'border-green-500 focus:border-green-500'
                    : 'border-gray-600'
                }`}
              />
              <div className="mt-2 text-xs font-retro">
                {walletAddress ? (
                  isValidSolanaAddress(walletAddress.trim()) ? (
                    <span className="text-green-400">✓ Valid Solana address</span>
                  ) : (
                    <span className="text-red-400">✗ Invalid Solana address format</span>
                  )
                ) : (
                  <span className="text-gray-400">Make sure this is your correct Solana wallet address</span>
                )}
              </div>
            </div>

            {/* Instructions */}
            {/* <div className="bg-red-900/30 border-2 border-red-600/50 rounded-lg p-3">
              <h4 className="text-red-400 font-retro text-xs mb-2">⚠️ Important:</h4>
              <ul className="text-red-200 font-retro text-xs space-y-1">
                <li>• Minimum withdrawal: 0.01 SOL</li>
                <li>• Double-check your wallet address</li>
                <li>• Withdrawal is processed immediately</li>
                <li>• Transaction fees are included</li>
                <li>• Balance will be updated after confirmation</li>
              </ul>
            </div> */}

            {/* Withdraw Button */}
            <Button
              onClick={handleWithdraw}
              disabled={isProcessing || !withdrawAmount || !walletAddress || !isValidSolanaAddress(walletAddress.trim())}
              className="w-full bg-red-600 hover:bg-red-700 font-retro py-3 text-white rounded-lg border-2 border-red-500 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span className="font-retro">Processing Withdrawal...</span>
                </>
              ) : (
                <>
                  <DollarSign size={16} />
                  <span className="font-retro">Withdraw {withdrawAmount || '0'} SOL</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}