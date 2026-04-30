import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { KeyRound, ShieldAlert } from 'lucide-react';

interface LoginProps {
  onLogin: (pin: string) => void;
  error?: string | null;
}

export default function Login({ onLogin, error }: LoginProps) {
  const [pin, setPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(pin);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-zinc-900 rounded-full blur-[120px] opacity-20" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-900 rounded-full blur-[120px] opacity-20" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl text-zinc-100">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-zinc-800 rounded-2xl border border-zinc-700">
                <KeyRound className="w-8 h-8 text-zinc-100" />
              </div>
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Vendor Ticket Tracker</CardTitle>
            <CardDescription className="text-zinc-400">
              Enter your access PIN to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="bg-zinc-800/50 border-zinc-700 text-center text-2xl tracking-[1em] focus:ring-zinc-700 focus:border-zinc-600 font-mono h-14"
                  maxLength={4}
                  autoFocus
                  required
                />
              </div>
              {error && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}
              <Button 
                type="submit" 
                className="w-full h-12 bg-zinc-100 text-zinc-950 hover:bg-zinc-200 transition-colors text-base font-medium"
              >
                Access Dashboard
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-zinc-800/50 pt-6">
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium">
              Secured Access
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
