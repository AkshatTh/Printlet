'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { getPricePerPage } from '@/lib/pricing';

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [calcPages, setCalcPages] = useState<number>(10);
  const [calcStaple, setCalcStaple] = useState<boolean>(false);
  const [siteStatus, setSiteStatus] = useState<{ isClosed: boolean; message: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const fetchUserRole = async (userId: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (profile) {
        setUserRole(profile.role);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchUserRole(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setUserRole(null);
      }
    });

    // Check site maintenance / outage status
    fetch('/api/site-status')
      .then(res => res.json())
      .then(data => setSiteStatus(data))
      .catch(() => {});

    return () => subscription.unsubscribe();
  }, []);

  const currentRate = getPricePerPage(calcPages);
  const calculatedTotal = (calcPages * currentRate) + (calcStaple ? 1 : 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900 relative overflow-hidden font-sans">
      {/* Playful Floating Glow Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-300/60 rounded-full mix-blend-multiply filter blur-3xl opacity-80 animate-pulse"></div>
        <div className="absolute top-1/3 -left-32 w-96 h-96 bg-rose-300/60 rounded-full mix-blend-multiply filter blur-3xl opacity-80 animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute -bottom-32 right-1/4 w-96 h-96 bg-orange-300/60 rounded-full mix-blend-multiply filter blur-3xl opacity-80 animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Outage Banner Alert */}
        {siteStatus?.isClosed && (
          <div className="mb-6 p-4 bg-amber-200/90 border border-amber-400 text-amber-950 rounded-3xl shadow-lg flex items-start gap-3">
            <span className="text-2xl mt-0.5">⚠️</span>
            <div>
              <p className="font-extrabold text-base">Service Notice: Maintenance / Outage Mode Active</p>
              <p className="text-sm font-medium mt-0.5">{siteStatus.message}</p>
            </div>
          </div>
        )}

        {/* Navbar */}
        <header className="flex justify-between items-center mb-12 bg-white/90 backdrop-blur-xl px-6 py-4 rounded-3xl border border-orange-200 shadow-xl shadow-orange-500/10">
          <Link href="/" className="font-black text-2xl tracking-tight flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-orange-500 via-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-md shadow-orange-500/30 transform hover:rotate-6 transition-transform">
              <span className="text-xl">🖨️</span>
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600 font-black">
              PrintHub
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/privacy"
              className="px-4 py-2.5 text-sm font-bold text-stone-700 hover:text-stone-900 transition-colors"
            >
              Terms & Privacy
            </Link>
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 rounded-2xl hover:shadow-lg hover:shadow-orange-500/30 hover:scale-105 transition-all duration-200"
                >
                  Dashboard & Upload
                </Link>
                {userRole === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="px-4 py-2.5 text-sm font-bold text-orange-800 bg-orange-100 rounded-2xl hover:bg-orange-200 transition-all border border-orange-200"
                  >
                    Admin Panel ⚡
                  </Link>
                )}
              </>
            ) : (
              <Link
                href="/auth"
                className="px-6 py-2.5 text-sm font-black text-white bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 rounded-2xl hover:shadow-xl hover:shadow-orange-500/35 hover:scale-105 transition-all duration-200 shadow-md"
              >
                Sign In / Register ✨
              </Link>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <section className="text-center py-10 lg:py-16 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-amber-200/80 text-amber-900 text-sm font-extrabold mb-6 border border-amber-300 shadow-sm">
            <span>🚀 Black-n-White Campus Printing Platform</span>
          </div>

          <h1 className="text-5xl lg:text-7xl font-black text-stone-900 tracking-tight leading-tight mb-6">
            Printing Made{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500">
              Simple.
            </span>
          </h1>

          <p className="text-xl text-stone-700 font-medium mb-10 max-w-2xl mx-auto leading-relaxed">
            Upload your documents right from your phone or laptop, pay via UPI, and pick up your fresh <strong>black-n-white</strong> printouts on campus the next working day!
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link
              href={user ? "/dashboard" : "/auth"}
              className="w-full sm:w-auto px-9 py-4 text-lg font-black text-white bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 rounded-2xl shadow-xl shadow-orange-500/30 hover:shadow-2xl hover:shadow-orange-500/50 hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <span>{user ? "Go to Dashboard" : "Start Printing Now"}</span>
              <span className="text-xl">✨</span>
            </Link>

            <a
              href="#pricing"
              className="w-full sm:w-auto px-8 py-4 text-lg font-bold text-stone-800 bg-white/90 backdrop-blur-md rounded-2xl border border-orange-200 hover:bg-orange-50 transition-all duration-200 shadow-md shadow-orange-500/5"
            >
              Calculate Price 🧮
            </a>
          </div>
        </section>

        {/* Features Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 py-8">
          <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl border border-orange-100 shadow-xl shadow-orange-500/10 hover:-translate-y-1.5 transition-all duration-300">
            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-5 text-2xl shadow-md shadow-amber-500/10">
              📂
            </div>
            <h3 className="text-2xl font-black text-stone-900 mb-2">Multi-File Upload</h3>
            <p className="text-stone-600 leading-relaxed text-sm font-medium">
              Select multiple PDFs, DOCX files, or images in a single batch. We automatically aggregate your total pages!
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl border border-orange-100 shadow-xl shadow-orange-500/10 hover:-translate-y-1.5 transition-all duration-300">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-5 text-2xl shadow-md shadow-rose-500/10">
              🏷️
            </div>
            <h3 className="text-2xl font-black text-stone-900 mb-2">Volume Discounts</h3>
            <p className="text-stone-600 leading-relaxed text-sm font-medium">
              Save big on large assignments & lab manuals! Prices start at ₹4.00 and drop dynamically down to ₹3.50 per page.
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl border border-orange-100 shadow-xl shadow-orange-500/10 hover:-translate-y-1.5 transition-all duration-300">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-5 text-2xl shadow-md shadow-emerald-500/10">
              📍
            </div>
            <h3 className="text-2xl font-black text-stone-900 mb-2">Campus Pickup</h3>
            <p className="text-stone-600 leading-relaxed text-sm font-medium">
              Printed overnight and delivered by the next working day.
            </p>
          </div>
        </section>

        {/* Live Pricing Estimator & Volume Tiers */}
        <section id="pricing" className="py-8">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 lg:p-12 border border-orange-200 shadow-2xl shadow-orange-500/10">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="px-4 py-1.5 bg-rose-100 text-rose-700 font-extrabold text-xs rounded-full uppercase tracking-wider border border-rose-200">
                Super Clear Pricing
              </span>
              <h2 className="text-4xl font-black text-stone-900 mt-3 mb-2">
                Live Pricing Calculator
              </h2>
              <p className="text-stone-600 font-medium text-sm">
                Move the slider to calculate instant costs for your documents.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              {/* Calculator Box */}
              <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-rose-500/10 p-8 rounded-3xl border border-orange-200">
                <div className="flex justify-between items-center mb-6">
                  <span className="font-extrabold text-stone-900 text-lg">Total Pages</span>
                  <span className="text-2xl font-black text-orange-600 bg-white px-4 py-1 rounded-xl shadow-sm border border-orange-100">
                    {calcPages} pages
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="100"
                  value={calcPages}
                  onChange={(e) => setCalcPages(parseInt(e.target.value))}
                  className="w-full h-3 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-500 mb-6"
                />

                <div className="flex items-center gap-3 mb-6 bg-white/90 p-4 rounded-2xl border border-orange-100">
                  <input
                    type="checkbox"
                    id="calcStaple"
                    checked={calcStaple}
                    onChange={(e) => setCalcStaple(e.target.checked)}
                    className="w-5 h-5 text-orange-500 rounded cursor-pointer accent-orange-500"
                  />
                  <label htmlFor="calcStaple" className="text-sm font-bold text-stone-800 cursor-pointer">
                    Staple all pages together (+₹1.00)
                  </label>
                </div>

                <div className="border-t border-orange-200 pt-4 space-y-2">
                  <div className="flex justify-between text-sm font-medium text-stone-600">
                    <span>Current Tier Rate:</span>
                    <span className="font-bold text-stone-900">₹{currentRate.toFixed(2)} / page</span>
                  </div>
                  <div className="flex justify-between text-2xl font-black text-orange-600 pt-2">
                    <span>Total Cost:</span>
                    <span>₹{calculatedTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Pricing Tiers */}
              <div className="space-y-3">
                <h3 className="text-lg font-black text-stone-900 mb-3">Volume Discount Schedule</h3>

                <div className="flex justify-between items-center p-4 bg-amber-50 rounded-2xl border border-amber-200">
                  <div>
                    <p className="font-extrabold text-stone-900 text-sm">1 – 9 Pages</p>
                    <p className="text-xs text-stone-500 font-medium">Standard single & short printouts</p>
                  </div>
                  <span className="px-3.5 py-1.5 bg-amber-200 font-black text-amber-900 rounded-xl text-sm">
                    ₹4.00 / pg
                  </span>
                </div>

                <div className="flex justify-between items-center p-4 bg-orange-50 rounded-2xl border border-orange-200">
                  <div>
                    <p className="font-extrabold text-stone-900 text-sm">10 – 29 Pages</p>
                    <p className="text-xs text-stone-500 font-medium">Medium documents & lecture slides</p>
                  </div>
                  <span className="px-3.5 py-1.5 bg-orange-200 font-black text-orange-900 rounded-xl text-sm">
                    ₹3.75 / pg
                  </span>
                </div>

                <div className="flex justify-between items-center p-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-2xl shadow-lg shadow-orange-500/20">
                  <div>
                    <p className="font-black text-sm">30+ Pages (Best Value! 🔥)</p>
                    <p className="text-xs text-orange-100 font-medium">Lab manuals, thesis & large packs</p>
                  </div>
                  <span className="px-3.5 py-1.5 bg-white text-orange-600 font-black rounded-xl text-sm">
                    ₹3.50 / pg
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row justify-between items-center py-8 text-xs text-stone-500 font-bold border-t border-orange-200/60 gap-4">
          <p>© {new Date().getFullYear()} PrintHub — Light, Fast & Automated Campus Printing Micro-SaaS.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-stone-900 transition-colors">
              Privacy Policy & Delivery Terms
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
