import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Lock, UserPlus, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login, register } = useAuth();
  const { toast } = useToast();
  
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', password: '', confirmPassword: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData.username || !loginData.password) {
      toast({
        title: "Missing Information",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }

    setIsLoggingIn(true);
    try {
      await login(loginData.username, loginData.password);
      toast({
        title: "Welcome back!",
        description: "Successfully logged in.",
      });
      onClose();
      setLoginData({ username: '', password: '' });
    } catch (error) {
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerData.username || !registerData.password) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (registerData.password !== registerData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    setIsRegistering(true);
    try {
      await register(registerData.username, registerData.password);
      toast({
        title: "Welcome to PumpGames!",
        description: "Account created successfully.",
      });
      onClose();
      setRegisterData({ username: '', password: '', confirmPassword: '' });
    } catch (error) {
      toast({
        title: "Registration Failed",
        description: error instanceof Error ? error.message : "Failed to create account",
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-2 border-green-500 text-white max-w-xl w-full mx-4 rounded-xl shadow-2xl p-6 [&>button]:hidden">
        <DialogHeader className="pb-4 border-b border-green-500/30">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 font-retro text-xl text-green-400">
              <User className="w-6 h-6" />
              <div className="text-2xl font-bold">
                <span className="text-white">PumpGames</span>
                <span className="text-green-400">.Fun</span>
              </div>
            </DialogTitle>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors border-2 border-gray-600 hover:border-green-500"
            >
              <X className="w-5 h-5 text-gray-400 hover:text-green-400" />
            </button>
          </div>
        </DialogHeader>
        
        <Tabs defaultValue="login" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2 bg-gray-800 border border-gray-600 rounded-lg p-1">
            <TabsTrigger 
              value="login" 
              className="font-retro text-sm py-2 px-2 data-[state=active]:bg-green-600 data-[state=active]:text-white transition-all text-gray-300 hover:text-white rounded-md flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              Login
            </TabsTrigger>
            <TabsTrigger 
              value="register" 
              className="font-retro text-sm py-2 px-2 data-[state=active]:bg-green-600 data-[state=active]:text-white transition-all text-gray-300 hover:text-white rounded-md flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Register
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="login" className="relative mt-4 px-2">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-3">
                <label className="text-sm font-retro text-green-300 font-semibold flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Username
                </label>
                <Input
                  type="text"
                  value={loginData.username}
                  onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Enter your username"
                  className="px-4 py-3 bg-gray-800 border-2 border-gray-600 text-white placeholder-gray-400 font-retro rounded-lg focus:border-green-500 focus:ring-0"
                  disabled={isLoggingIn}
                />
              </div>
              
              <div className="space-y-3">
                <label className="text-sm font-retro text-green-300 font-semibold flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Password
                </label>
                <Input
                  type="password"
                  value={loginData.password}
                  onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter your password"
                  className="px-4 py-3 bg-gray-800 border-2 border-gray-600 text-white placeholder-gray-400 font-retro rounded-lg focus:border-green-500 focus:ring-0"
                  disabled={isLoggingIn}
                />
              </div>
              
              <Button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-green-600 hover:bg-green-700 font-retro py-3 text-white rounded-lg border-2 border-green-500 mt-6"
              >
                {isLoggingIn ? 'Logging in...' : 'Login to PumpGames'}
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="register" className="relative mt-4 px-2">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-3">
                <label className="text-sm font-retro text-green-300 font-semibold flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Username
                </label>
                <Input
                  type="text"
                  value={registerData.username}
                  onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Choose a username"
                  className="px-4 py-3 bg-gray-800 border-2 border-gray-600 text-white placeholder-gray-400 font-retro rounded-lg focus:border-green-500 focus:ring-0"
                  disabled={isRegistering}
                />
              </div>
              
              <div className="space-y-3">
                <label className="text-sm font-retro text-green-300 font-semibold flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Password
                </label>
                <Input
                  type="password"
                  value={registerData.password}
                  onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Create a password (6+ characters)"
                  className="px-4 py-3 bg-gray-800 border-2 border-gray-600 text-white placeholder-gray-400 font-retro rounded-lg focus:border-green-500 focus:ring-0"
                  disabled={isRegistering}
                />
              </div>
              
              <div className="space-y-3">
                <label className="text-sm font-retro text-green-300 font-semibold flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Confirm Password
                </label>
                <Input
                  type="password"
                  value={registerData.confirmPassword}
                  onChange={(e) => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm your password"
                  className="px-4 py-3 bg-gray-800 border-2 border-gray-600 text-white placeholder-gray-400 font-retro rounded-lg focus:border-green-500 focus:ring-0"
                  disabled={isRegistering}
                />
              </div>
              
              <Button
                type="submit"
                disabled={isRegistering}
                className="w-full bg-green-600 hover:bg-green-700 font-retro py-3 text-white rounded-lg border-2 border-green-500 mt-6"
              >
                {isRegistering ? 'Creating Account...' : 'Create PumpGames Account'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}