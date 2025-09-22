import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { fullUrl } from "@/lib/queryClient";
import { Copy, RefreshCw, Plus, DollarSign } from "lucide-react";

export function Wallet() {
  const { user, updateUser, refreshUser } = useAuth();
  const { toast } = useToast();
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [isCashOutOpen, setIsCashOutOpen] = useState(false);
  const [addFundsAmount, setAddFundsAmount] = useState("");
  const [cashOutAmount, setCashOutAmount] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!user) return null;

  const handleCopyAddress = () => {
    const mockAddress = `${user.id.slice(0, 8)}...${user.id.slice(-8)}`;
    navigator.clipboard.writeText(mockAddress);
    toast({
      title: "Address Copied",
      description: "Wallet address copied to clipboard",
    });
  };

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    try {
      await refreshUser();
      toast({
        title: "Balance Refreshed",
        description: "Wallet balance has been updated from server",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh balance from server",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddFunds = async () => {
    const amount = parseFloat(addFundsAmount);
    
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(fullUrl(`/api/users/${user.id}/update-balance`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: amount }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const updatedUser = await response.json();
      updateUser(updatedUser);
      
      setIsAddFundsOpen(false);
      setAddFundsAmount("");
      
      toast({
        title: "Funds Added Successfully",
        description: `Successfully added $${amount.toFixed(2)} to your wallet`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add funds",
        variant: "destructive",
      });
    }
  };

  const handleCashOut = async () => {
    const amount = parseFloat(cashOutAmount);
    const userBalance = user.balance;
    
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (amount > userBalance) {
      toast({
        title: "Insufficient Balance",
        description: "You don't have enough funds to cash out this amount",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(fullUrl(`/api/users/${user.id}/update-balance`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: -amount }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const updatedUser = await response.json();
      updateUser(updatedUser);
      
      setIsCashOutOpen(false);
      setCashOutAmount("");
      
      toast({
        title: "Cash Out Successful",
        description: `Successfully withdrew $${amount.toFixed(2)} from your wallet`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cash out",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Card className="bg-dark-card border-dark-border border-l-4 border-l-neon-green">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-white">Wallet</CardTitle>
            <div className="flex space-x-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyAddress}
                className="text-gray-400 hover:text-white transition-colors"
                title="Copy wallet address"
              >
                <Copy className="w-5 h-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefreshBalance}
                disabled={isRefreshing}
                className="text-gray-400 hover:text-white transition-colors"
                title="Refresh balance"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Balance display */}
          <div className="text-center">
            <div className="neon-yellow text-4xl font-bold mb-1">
              ${user.balance.toFixed(2)}
            </div>
            <div className="text-gray-400 text-sm">
              {user.balance.toFixed(2)} USD
            </div>
          </div>

          {/* Action buttons */}
          <div className={`grid ${user.isClipper ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
            <Dialog open={isAddFundsOpen} onOpenChange={setIsAddFundsOpen}>
              <DialogTrigger asChild>
                <Button className="bg-neon-green text-black font-semibold hover:bg-green-400 transition-colors">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Funds
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-dark-card border-dark-border text-white">
                <DialogHeader>
                  <DialogTitle>Add Funds</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    type="number"
                    placeholder="Amount in USD"
                    value={addFundsAmount}
                    onChange={(e) => setAddFundsAmount(e.target.value)}
                    className="bg-dark-bg border-dark-border"
                    min="0"
                    step="0.01"
                  />
                  <div className="text-sm text-gray-400">
                    Minimum: $1.00 • Maximum: $500.00
                  </div>
                  <Button 
                    onClick={handleAddFunds}
                    className="w-full bg-neon-green text-black hover:bg-green-400"
                  >
                    Add Funds
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {!user.isClipper && (
              <Dialog open={isCashOutOpen} onOpenChange={setIsCashOutOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-neon-blue text-white font-semibold hover:bg-blue-600 transition-colors">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Cash Out
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-dark-card border-dark-border text-white">
                  <DialogHeader>
                    <DialogTitle>Cash Out</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      type="number"
                      placeholder="Enter amount"
                      value={cashOutAmount}
                      onChange={(e) => setCashOutAmount(e.target.value)}
                      min="1"
                      step="0.01"
                      max={user.balance}
                      className="bg-dark-input border-dark-border text-white"
                    />
                    <div className="text-gray-400 text-xs">
                      Available: ${user.balance.toFixed(2)} • Minimum: $1.00
                    </div>
                    <Button 
                      onClick={handleCashOut}
                      className="w-full bg-neon-blue text-white hover:bg-blue-600"
                    >
                      Cash Out
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
