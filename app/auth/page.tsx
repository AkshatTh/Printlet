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
          throw new Error('Full name and WhatsApp phone number are required');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data.user) {
          // Check if profile already exists (e.g. created by triggers)
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

          if (existingProfile) {
            // Profile exists, update it with name and phone
            const { error: updateError } = await supabase
              .from('profiles')
              .update({
                full_name: fullName,
                phone_number: phoneNumber,
              })
              .eq('id', data.user.id);

            if (updateError) {
              console.error('Error updating profile:', updateError);
            }
          } else {
            // Profile doesn't exist, create it
            const { error: profileError } = await supabase
              .from('profiles')
              .insert([
                {
                  id: data.user.id,
                  email: email,
                  full_name: fullName,
                  phone_number: phoneNumber,
                  role: 'STUDENT',
                },
              ]);

            if (profileError) {
              console.error('Error creating profile:', profileError);
            }
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
    <div className="min-h-screen bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900 flex items-center justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full">
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl shadow-orange-500/10 p-6 sm:p-8 border border-orange-200">
          <div className="text-center mb-6 sm:mb-8">
            <Link href="/" className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-tr from-orange-500 via-rose-500 to-amber-500 rounded-2xl mb-3 sm:mb-4 shadow-lg shadow-orange-500/30 text-2xl sm:text-3xl transform hover:rotate-6 transition-transform">
              🖨️
            </Link>
            <h2 className="text-2xl sm:text-3xl font-black text-stone-900">
              {isLogin ? 'Welcome Back! 👋' : 'Join Printlet ✨'}
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 mt-1 font-bold">
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
                  <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
                    FULL NAME
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Akshat"
                    className="w-full px-4 py-3 bg-amber-50/60 rounded-2xl border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-base font-bold text-stone-900 placeholder:text-stone-400 placeholder:font-normal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
                    WHATSAPP PHONE NUMBER
                  </label>
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="7982239126 or +917982239126"
                    className="w-full px-4 py-3 bg-amber-50/60 rounded-2xl border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-base font-bold text-stone-900 placeholder:text-stone-400 placeholder:font-normal"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-4 py-3 bg-amber-50/60 rounded-2xl border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-base font-bold text-stone-900 placeholder:text-stone-400 placeholder:font-normal"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
                PASSWORD
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-amber-50/60 rounded-2xl border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-base font-bold text-stone-900 placeholder:text-stone-400 placeholder:font-normal"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 sm:py-4 text-base font-black text-white bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 rounded-2xl shadow-xl shadow-orange-500/30 hover:shadow-2xl hover:scale-101 transition-all disabled:opacity-50 mt-2"
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
