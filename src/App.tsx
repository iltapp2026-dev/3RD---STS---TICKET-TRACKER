/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { db, auth } from './lib/firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const CORRECT_PIN = '7324';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Initialize anonymous auth to satisfy Firebase rules requiring isSignedIn()
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch(console.error);
      }
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;

    // Seed vendors if none exist
    const seedVendors = async () => {
      try {
        const vendorSnapshot = await getDocs(collection(db, 'vendors'));
        if (vendorSnapshot.empty) {
          const initialVendors = [
            { name: 'Global Network Solutions', category: 'IT/Network' },
            { name: 'Precision HVAC', category: 'Maintenance' },
            { name: 'SafeGuard Security', category: 'Security' },
            { name: 'Office Depot Services', category: 'Supplies' }
          ];
          
          for (const vendor of initialVendors) {
            await addDoc(collection(db, 'vendors'), vendor);
          }
        }
      } catch (error) {
        console.error('Seeding error:', error);
      }
    };
    
    seedVendors();
  }, [authReady]);

  const handleLogin = (pin: string) => {
    if (pin === CORRECT_PIN) {
      setIsLoggedIn(true);
      setLoginError(null);
    } else {
      setLoginError('Invalid PIN. Please try again.');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return (
      <>
        <Login onLogin={handleLogin} error={loginError} />
        <Toaster theme="dark" position="top-center" />
      </>
    );
  }

  return (
    <>
      <Dashboard onLogout={handleLogout} />
      <Toaster theme="dark" position="bottom-right" />
    </>
  );
}

