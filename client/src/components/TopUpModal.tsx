import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Copy, CheckCircle, DollarSign, ArrowLeft, X, Loader2, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { fullUrl } from '@/lib/queryClient';
import * as QRCode from 'qrcode';

// Crypto icon component using real logos from the web with reliable fallbacks
const CryptoIcon = ({ type, size = 16 }: { type: string; size?: number }) => {
  const [imageError, setImageError] = React.useState(false);

  const logoUrls = {
    SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
    ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png'
  };

  const logoUrl = logoUrls[type as keyof typeof logoUrls];

  // If image failed to load or no URL, show gradient fallback
  if (!logoUrl || imageError) {
    const gradients = {
      SOL: 'from-purple-500 to-blue-500',
      ETH: 'from-blue-400 to-blue-600'
    };

    return (
      <div
        className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${gradients[type as keyof typeof gradients] || 'from-gray-500 to-gray-600'}`}
        style={{ width: size, height: size }}
      >
        <span className="text-white font-bold" style={{ fontSize: size * 0.3 }}>
          {type}
        </span>
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={`${type} logo`}
      width={size}
      height={size}
      className="rounded-full"
      style={{ objectFit: 'contain' }}
      onError={() => setImageError(true)}
    />
  );
};

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  onTopUpComplete: (amount: number) => void;
}

export default function TopUpModal({ isOpen, onClose, currentBalance, onTopUpComplete }: TopUpModalProps) {
  const [topUpAmount, setTopUpAmount] = useState<string>('');
  const [step, setStep] = useState<'amount' | 'currency' | 'payment'>('amount');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [solPrice, setSolPrice] = useState<number>(0);
  const [selectedCurrency, setSelectedCurrency] = useState<'SOL' | 'ETH'>('SOL');
  const [paymentSession, setPaymentSession] = useState<any>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [sessionCompleted, setSessionCompleted] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Development mode removed - payment verification is now strict

  // RPC calls removed - now using backend verification endpoint

  // Fetch SOL price when modal opens
  React.useEffect(() => {
    if (isOpen && solPrice === 0) {
      fetchSOLPrice();
    }
  }, [isOpen, solPrice]);

  const fetchSOLPrice = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await response.json();
      setSolPrice(data.solana?.usd || 0);
    } catch (error) {
      console.error('Failed to fetch SOL price:', error);
      setSolPrice(0);
    }
  };

  // Wallet balance fetching removed - not needed for payment verification

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${type} address copied to clipboard`,
    });
  };

  const handleAmountSubmit = () => {
    const amount = parseFloat(topUpAmount);

    if (!topUpAmount || isNaN(amount)) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount.",
        variant: "destructive"
      });
      return;
    }

    if (amount < 1) {
      toast({
        title: "Minimum Amount",
        description: "Minimum top-up amount is $1.00",
        variant: "destructive"
      });
      return;
    }

    if (amount > 10000) {
      toast({
        title: "Maximum Amount",
        description: "Maximum top-up amount is $10,000.00",
        variant: "destructive"
      });
      return;
    }

    setStep('currency');
  };

  const handleCurrencySelect = () => {
    setStep('payment');
    generatePaymentAddress();
  };

  const generatePaymentAddress = async () => {
    setIsGenerating(true);
    try {
      const amount = parseFloat(topUpAmount);
      
      // Create a payment session on the server
      const response = await fetch(fullUrl('/api/payment/generate-address'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          amount: amount,
          currency: selectedCurrency
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create payment session');
      }

      const data = await response.json();
      setPaymentSession(data);

      // Use static wallet address for all payments
      const staticWalletAddress = '3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv';
      
      // Generate QR code for the static payment address
      // Use Solana URI scheme that opens Phantom wallet
      const solAmount = (amount / solPrice).toFixed(8);
      const qrData = `solana:${staticWalletAddress}?amount=${solAmount}&label=TopUp Payment&message=Payment for $${amount.toFixed(2)} USD`;
      
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        width: 128,
        margin: 1,
        color: {
          dark: '#10b981', // green-500
          light: '#1f2937'  // gray-800
        }
      });
      setQrCodeUrl(qrCodeDataUrl);

    } catch (error) {
      console.error('Failed to generate payment address:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate payment address. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePaymentConfirm = async () => {
    if (!paymentSession) {
      toast({
        title: "Error",
        description: "No payment session found. Please try again.",
        variant: "destructive"
      });
      return;
    }

    setIsVerifying(true);

    try {
      toast({
        title: "Verifying Payment...",
        description: "Checking if payment received on your wallet address",
      });

      // Use the payment verification endpoint with session ID
      const verificationResponse = await fetch(fullUrl('/api/verify-payment'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          paymentSessionId: paymentSession.paymentSessionId
        }),
      });

      const verificationResult = await verificationResponse.json();

      if (!verificationResponse.ok) {
        // Handle specific error cases
        if (verificationResult.message?.includes('already been processed')) {
          setSessionCompleted(true);
          toast({
            title: "⚠️ Payment Already Processed",
            description: verificationResult.message,
            variant: "destructive",
          });
          // Don't reset modal immediately, let user see the completed state
          return;
        } else if (verificationResult.message?.includes('expired')) {
          toast({
            title: "⏰ Session Expired",
            description: verificationResult.message + " Please create a new payment request.",
            variant: "destructive",
          });
          resetModal();
          return;
        } else {
          throw new Error(verificationResult.message || 'Verification request failed');
        }
      }

      if (verificationResult.verified) {
        // Payment verified successfully, balance should already be updated by the backend
        // Call onTopUpComplete to trigger UI refresh
        onTopUpComplete(verificationResult.amount);
        toast({
          title: "✅ Payment Verified",
          description: `Payment of $${verificationResult.amount?.toFixed(2)} verified! New balance: $${verificationResult.newBalance?.toFixed(2)}`,
        });
        resetModal();
        onClose();
      } else {
        // No payment detected - show error message
        toast({
          title: "No Payment Received",
          description: verificationResult.message || `No payment was detected. Please ensure your transaction is confirmed and try again.`,
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error("Payment verification failed:", error);
      toast({
        title: "Verification Failed",
        description: `Unable to verify payment. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };


  const resetModal = () => {
    setStep('amount');
    setTopUpAmount('');
    setSelectedCurrency('SOL');
    setPaymentSession(null);
    setQrCodeUrl('');
    setSessionCompleted(false);
    setIsClosing(false);
  };

  const handleClose = async () => {
    // Prevent multiple close attempts
    if (isClosing) return;
    
    setIsClosing(true);

    // If there's an active payment session, check for payment before closing
    if (paymentSession && !sessionCompleted) {
      try {
        // Show a brief loading state while checking
        toast({
          title: "Checking for payment...",
          description: "Verifying if payment was received before closing",
        });

        // Check for payment using the existing verification logic
        const verificationResponse = await fetch(fullUrl('/api/verify-payment'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user?.id,
            paymentSessionId: paymentSession.paymentSessionId
          }),
        });

        const verificationResult = await verificationResponse.json();

        if (verificationResponse.ok && verificationResult.verified) {
          // Payment was found! Update the balance and show success
          onTopUpComplete(verificationResult.amount);
          toast({
            title: "✅ Payment Found!",
            description: `Payment of $${verificationResult.amount?.toFixed(2)} was verified! New balance: $${verificationResult.newBalance?.toFixed(2)}`,
          });
        } else if (verificationResult.message?.includes('already been processed')) {
          // Payment was already processed
          toast({
            title: "⚠️ Payment Already Processed",
            description: "This payment was already verified and credited to your account.",
          });
        } else {
          // No payment found, but that's okay - user can try again later
          toast({
            title: "No Payment Detected",
            description: "No payment was found. You can try again later if you made a payment.",
          });
        }
      } catch (error) {
        console.error("Error checking payment on close:", error);
        // Don't show error toast for background check - just log it
      }
    }

    // Always reset and close the modal
    resetModal();
    setIsClosing(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-900 border-2 border-gray-600 text-white max-w-lg w-full mx-4 rounded-xl shadow-2xl [&>button]:hidden max-h-[95vh] flex flex-col overflow-hidden">
        <DialogHeader className="pb-4 border-b border-green-500/30">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 font-retro text-lg text-green-400">
              {(step === 'currency' || step === 'payment') && (
                <button
                  onClick={() => setStep(step === 'currency' ? 'amount' : 'currency')}
                  className="p-1 hover:bg-gray-800 rounded-lg transition-colors border border-gray-600 hover:border-green-500 mr-2"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-400 hover:text-green-400" />
                </button>
              )}
              <DollarSign className="w-5 h-5" />
              {step === 'amount' && 'Top Up Balance'}
              {step === 'currency' && 'Select Currency'}
              {step === 'payment' && 'Payment Instructions'}
            </DialogTitle>
            <button
              onClick={handleClose}
              disabled={isClosing}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors border-2 border-gray-600 hover:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isClosing ? (
                <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
              ) : (
                <X className="w-4 h-4 text-gray-400 hover:text-green-400" />
              )}
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin scrollbar-thumb-green-500 scrollbar-track-gray-800">
        {step === 'amount' ? (
          <div className="space-y-4 pt-2">
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
              <p className="text-gray-300 text-xs mb-2 font-retro">Current Balance</p>
              <p className="text-green-400 text-lg font-retro">${currentBalance.toFixed(2)}</p>
            </div>

            <div>
              <label className="text-green-400 font-retro text-xs mb-2 block">
                Top-Up Amount (USD)
              </label>
              <Input
                type="number"
                placeholder="Enter amount..."
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="px-3 py-2 bg-gray-800 border-2 border-gray-600 focus:border-green-500 text-white font-retro text-xs"
                min="1"
                max="10000"
                step="0.01"
              />
              <p className="text-gray-500 font-retro text-xs mt-1">
                Min: $1.00 • Max: $10,000.00
              </p>
              {topUpAmount && solPrice > 0 && (
                <p className="text-blue-400 font-retro text-xs mt-1">
                  ≈ {(parseFloat(topUpAmount) / solPrice).toFixed(4)} SOL
                </p>
              )}
            </div>

            <Button
              onClick={handleAmountSubmit}
              disabled={!topUpAmount}
              className="w-full bg-green-600 hover:bg-green-700 font-retro py-2 text-white rounded-lg border-2 border-green-500 text-xs disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              <span className="font-retro">Select Currency</span>
            </Button>
          </div>
        ) : step === 'currency' ? (
          <div className="space-y-4 pt-2">
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600 text-center">
              <p className="text-gray-300 text-xs mb-1 font-retro">Amount to Pay</p>
              <p className="text-green-400 text-xl font-retro">${parseFloat(topUpAmount).toFixed(2)}</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-green-400 font-retro text-xs">Choose Payment Method:</h3>
              
              <div 
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCurrency === 'SOL' 
                    ? 'border-green-500 bg-green-500/10' 
                    : 'border-gray-600 bg-gray-800 hover:border-green-500/50'
                }`}
                onClick={() => setSelectedCurrency('SOL')}
              >
                <div className="flex items-center gap-3">
                  <CryptoIcon type="SOL" size={24} />
                  <div className="flex-1">
                    <h4 className="font-retro text-sm text-white">Solana (SOL)</h4>
                    <p className="text-xs text-gray-400">
                      ≈ {(parseFloat(topUpAmount) / solPrice).toFixed(4)} SOL
                    </p>
                  </div>
                  {selectedCurrency === 'SOL' && (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  )}
                </div>
              </div>

              <div 
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCurrency === 'ETH' 
                    ? 'border-green-500 bg-green-500/10' 
                    : 'border-gray-600 bg-gray-800 hover:border-green-500/50'
                }`}
                onClick={() => setSelectedCurrency('ETH')}
              >
                <div className="flex items-center gap-3">
                  <CryptoIcon type="ETH" size={24} />
                  <div className="flex-1">
                    <h4 className="font-retro text-sm text-white">Ethereum (ETH)</h4>
                    <p className="text-xs text-gray-400">
                      ≈ {(parseFloat(topUpAmount) / 2000).toFixed(6)} ETH (est.)
                    </p>
                  </div>
                  {selectedCurrency === 'ETH' && (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  )}
                </div>
              </div>
            </div>

            <Button
              onClick={handleCurrencySelect}
              disabled={!selectedCurrency}
              className="w-full bg-green-600 hover:bg-green-700 font-retro py-2 text-white rounded-lg border-2 border-green-500 text-xs disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              <span className="font-retro">Generate Payment Address</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600 text-center">
              <p className="text-gray-300 text-xs mb-1 font-retro">Amount to Pay</p>
              <p className="text-green-400 text-xl font-retro">${parseFloat(topUpAmount).toFixed(2)}</p>
              {selectedCurrency === 'SOL' && solPrice > 0 && (
                <div className="flex items-center justify-center gap-2 mt-1">
                  <p className="text-blue-400 text-sm font-retro">
                    ≈ {(parseFloat(topUpAmount) / solPrice).toFixed(4)} SOL
                  </p>
                  <Button
                    onClick={() => copyToClipboard((parseFloat(topUpAmount) / solPrice).toFixed(4), 'SOL Amount')}
                    className="bg-blue-600 hover:bg-blue-700 border border-blue-500 hover:border-blue-400 font-retro text-xs px-2 py-1 h-auto flex items-center gap-1"
                  >
                    <Copy size={10} />
                    Copy
                  </Button>
                </div>
              )}
              {selectedCurrency === 'ETH' && (
                <p className="text-blue-400 text-sm font-retro mt-1">
                  ≈ {(parseFloat(topUpAmount) / 2000).toFixed(6)} ETH (est.)
                </p>
              )}
            </div>

            {isGenerating ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-green-400" />
                <span className="ml-2 text-green-400 font-retro">Generating payment address...</span>
              </div>
            ) : paymentSession && qrCodeUrl ? (
              <div className="space-y-3 pb-2">
                {/* QR Code Display */}
                <div className="bg-gray-800 rounded-lg p-3 border border-gray-600 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <CryptoIcon type={selectedCurrency} size={18} />
                    <h3 className="font-retro text-xs text-white">
                      {selectedCurrency === 'SOL' && 'Solana Payment'}
                      {selectedCurrency === 'ETH' && 'Ethereum Payment'}
                    </h3>
                  </div>
                  
                  <div className="bg-white p-2 rounded-lg inline-block mb-2">
                    <img src={qrCodeUrl} alt="Payment QR Code" className="w-32 h-32" />
                  </div>
                  
                  <p className="text-xs text-gray-400 font-retro">
                    Scan QR code to open Phantom wallet
                  </p>
                </div>

                {/* Payment Address */}
                <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-retro text-sm text-white">Payment Address:</h3>
                    <Button
                      onClick={() => copyToClipboard('3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv', 'Solana Address')}
                      className="bg-green-600 hover:bg-green-700 border border-green-500 hover:border-green-400 font-retro text-xs px-3 py-1.5 h-auto flex items-center gap-1"
                    >
                      <Copy size={12} />
                      Copy
                    </Button>
                  </div>
                  <div className="bg-gray-900 p-2 rounded border border-gray-700">
                    <p className="text-xs text-gray-300 font-mono break-all">
                      3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv
                    </p>
                  </div>
                </div>

                {/* Payment Link for Testing */}
                {/* <div className="bg-gray-800 rounded-lg p-2 border border-gray-600">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-retro text-xs text-white">Phantom Payment Link:</h3>
                    <Button
                      onClick={() => {
                        const solAmount = (parseFloat(topUpAmount) / solPrice).toFixed(8);
                        const staticWalletAddress = '3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv';
                        const phantomLink = `solana:${staticWalletAddress}?amount=${solAmount}&label=TopUp Payment&message=Payment for $${parseFloat(topUpAmount).toFixed(2)} USD`;
                        copyToClipboard(phantomLink, 'Payment Link');
                      }}
                      className="bg-blue-700 hover:bg-blue-600 border border-blue-600 hover:border-blue-500 font-retro text-xs px-2 py-1 h-auto"
                    >
                      <Copy size={10} className="mr-1" />
                      Copy Link
                    </Button>
                  </div>
                  <p className="text-xs text-blue-400 font-mono break-all bg-gray-900 p-1 rounded border border-gray-700">
                    solana:3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv?amount=...
                  </p>
                </div> */}

                {/* Payment Info */}
                {/* <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-blue-400 font-retro text-xs">
                      Payment Session ID:
                    </p>
                    <Button
                      onClick={() => copyToClipboard(paymentSession.paymentSessionId, 'Session ID')}
                      className="bg-blue-700 hover:bg-blue-600 border border-blue-600 hover:border-blue-500 font-retro text-xs px-2 py-1 h-auto"
                    >
                      <Copy size={10} className="mr-1" />
                      Copy
                    </Button>
                  </div>
                  <p className="text-blue-300 font-mono text-xs break-all bg-blue-900/50 p-1 rounded border border-blue-700 mb-1">
                    {paymentSession.paymentSessionId}
                  </p>
                  {/* <p className="text-blue-300 font-retro text-xs mt-1">
                    All payments go to: 3XVzfnAsvCPjTm4LJKaVWJVMWMY<br/>AbNRra3twrzBaokJv
                  </p>
                  <p className="text-blue-300 font-retro text-xs">
                    This payment session expires in 60 minutes.
                  </p>
                </div> */}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400 font-retro text-xs">Loading payment information...</p>
            </div>
            )}

            {/* <div className="bg-yellow-900/30 border-2 border-yellow-600/50 rounded-lg p-2">
              <h4 className="text-yellow-400 font-retro text-xs mb-1">📋 Instructions:</h4>
              <ul className="text-yellow-200 font-retro text-xs space-y-0.5">
                <li>• Scan the QR code to open Phantom wallet automatically</li>
                <li>• Payment will be sent to our main wallet address above</li>
                <li>• Send <strong>${parseFloat(topUpAmount).toFixed(2)}</strong> USD equivalent in {selectedCurrency}</li>
                <li>• Wait for transaction confirmation on blockchain</li>
                <li>• Click "I Have Paid" when transaction is complete</li>
                <li>• <strong>Note:</strong> Each payment can only be verified once</li>
              </ul>
            </div> */}

            {sessionCompleted ? (
              <div className="w-full bg-green-600/20 border-2 border-green-500 rounded-lg p-3 text-center mb-4">
                <div className="flex items-center justify-center gap-2 text-green-400">
                  <CheckCircle size={16} />
                  <span className="font-retro text-sm">Payment Already Processed</span>
                </div>
                <p className="text-green-300 font-retro text-xs mt-1">
                  This payment has been verified and credited to your account.
                </p>
                <Button
                  onClick={handleClose}
                  className="mt-2 bg-green-600 hover:bg-green-700 font-retro py-1 px-4 text-white rounded border border-green-500 text-xs"
                >
                  Close
                </Button>
              </div>
            ) : (
              <Button
                onClick={handlePaymentConfirm}
                disabled={isVerifying || !paymentSession}
                className="w-full bg-green-600 hover:bg-green-700 font-retro py-2 text-white rounded-lg border-2 border-green-500 text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
              >
                {isVerifying ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span className="font-retro">Verifying Payment...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    <span className="font-retro">I Have Paid</span>
                  </>
                )}
              </Button>
            )}
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}