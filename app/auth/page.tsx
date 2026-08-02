'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        // Login
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // Check if profile exists
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user?.id)
          .single();

        if (!profile) {
          // Profile doesn't exist, logout and show error
          await supabase.auth.signOut();
          throw new Error('Profile not found. Please sign up first.');
        }

        router.replace('/dashboard');
      } else {
        // Sign up
        if (!fullName || !phoneNumber) {
          throw new Error('Please provide your full name and phone number');
        }

        // Format and validate phone number
        let formattedPhone = phoneNumber.trim();
        if (/^\d{10}$/.test(formattedPhone)) {
          formattedPhone = `+91${formattedPhone}`;
        }

        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(formattedPhone)) {
          throw new Error('Phone number must be in international format with country code (e.g., +919876543210 or 10 digits)');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone_number: formattedPhone,
            }
          }
        });

        if (error) throw error;

        if (data.user) {
          // Create profile record in profiles table
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              full_name: fullName,
              phone_number: formattedPhone,
              role: 'STUDENT',
            });

          if (profileError) {
            console.error('Profile creation error:', profileError);
            if (profileError.message?.includes('profiles') || profileError.code === 'PGRST204' || profileError.code === '42P01') {
              throw new Error('Database setup incomplete: Please run the migration_auth_delivery.sql script in your Supabase SQL Editor.');
            }
            throw new Error(`Profile setup failed: ${profileError.message}`);
          }

          router.replace('/dashboard');
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      let msg = err?.message || 'Authentication failed';
      if (msg.includes('rate limit')) {
        msg = 'Supabase email rate limit exceeded. Disable "Confirm email" in Supabase Auth -> Providers -> Email, or create user directly in Supabase Dashboard.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-orange-500/10 p-8 border border-orange-200">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-orange-500 via-rose-500 to-amber-500 rounded-2xl mb-4 shadow-lg shadow-orange-500/30 text-3xl transform hover:rotate-6 transition-transform">
              🖨️
            </Link>
            <h2 className="text-3xl font-black text-stone-900">
              {isLogin ? 'Welcome Back! 👋' : 'Join Printlet ✨'}
            </h2>
            <p className="text-sm text-stone-600 mt-1 font-bold">
              {isLogin ? 'Sign in to access your print dashboard' : 'Create an account to start printing on campus'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-200 text-red-700 rounded-2xl text-xs font-bold leading-relaxed">
              {error}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-xs font-black text-stone-700 mb-1">
                    FULL NAME
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Akshat"
                    className="w-full px-4 py-3 bg-amber-50/60 rounded-2xl border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-700 mb-1">
                    WHATSAPP PHONE NUMBER
                  </label>
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="7982239126 or +917982239126"
                    className="w-full px-4 py-3 bg-amber-50/60 rounded-2xl border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold text-stone-900"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-black text-stone-700 mb-1">
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-4 py-3 bg-amber-50/60 rounded-2xl border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold text-stone-900"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-stone-700 mb-1">
                PASSWORD
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-amber-50/60 rounded-2xl border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold text-stone-900"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 text-base font-black text-white bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 rounded-2xl shadow-xl shadow-orange-500/30 hover:shadow-2xl hover:scale-101 transition-all disabled:opacity-50 mt-2"
            >
              {loading ? 'Processing...' : (isLogin ? 'Sign In ✨' : 'Create Account ✨')}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <div>
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                className="text-xs font-black text-orange-600 hover:underline"
              >
                {isLogin
                  ? "Don't have an account? Sign up now"
                  : 'Already have an account? Sign in'}
              </button>
            </div>
            <div>
              <Link href="/privacy" className="text-xs font-bold text-stone-500 hover:text-stone-800 transition-colors">
                Privacy Policy & Delivery Terms
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
