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
        <div className="absolute -top-32 -right-32 w-72 sm:w-96 h-72 sm:h-96 bg-amber-300/60 rounded-full mix-blend-multiply filter blur-3xl opacity-80 animate-pulse"></div>
        <div className="absolute top-1/3 -left-32 w-72 sm:w-96 h-72 sm:h-96 bg-rose-300/60 rounded-full mix-blend-multiply filter blur-3xl opacity-80 animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute -bottom-32 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-orange-300/60 rounded-full mix-blend-multiply filter blur-3xl opacity-80 animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Outage Banner Alert */}
        {siteStatus?.isClosed && (
          <div className="mb-6 p-4 bg-amber-200/90 border border-amber-400 text-amber-950 rounded-2xl sm:rounded-3xl shadow-lg flex items-start gap-3">
            <span className="text-2xl mt-0.5 shrink-0">⚠️</span>
            <div>
              <p className="font-extrabold text-sm sm:text-base">Service Notice: Maintenance / Outage Mode Active</p>
              <p className="text-xs sm:text-sm font-medium mt-0.5 leading-relaxed">{siteStatus.message}</p>
            </div>
          </div>
        )}

        {/* WhatsApp Community Invite Banner */}
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-300 backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-md flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0">💬</span>
            <div>
              <p className="font-extrabold text-sm sm:text-base text-emerald-950">Join our Official WhatsApp Community!</p>
              <p className="text-xs sm:text-sm font-medium text-emerald-800">Get live print status updates, operational notices, & instant support.</p>
            </div>
          </div>
          <a
            href="https://chat.whatsapp.com/IpaB1N8HSgyCs2UXdnv2AM"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-md shrink-0 flex items-center justify-center gap-1.5"
          >
            <span>Join WhatsApp Group</span>
            <span>→</span>
          </a>
        </div>

        {/* Responsive Navbar */}
        <header className="flex flex-col sm:flex-row justify-between items-center mb-8 sm:mb-12 bg-white/90 backdrop-blur-xl px-4 sm:px-6 py-4 rounded-2xl sm:rounded-3xl border border-orange-200 shadow-xl shadow-orange-500/10 gap-3 sm:gap-4">
          <Link href="/" className="font-black text-xl sm:text-2xl tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-tr from-orange-500 via-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-md shadow-orange-500/30 transform hover:rotate-6 transition-transform">
              <span className="text-lg sm:text-xl">🖨️</span>
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600 font-black">
              Printlet
            </span>
          </Link>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto">
            <a
              href="https://chat.whatsapp.com/IpaB1N8HSgyCs2UXdnv2AM"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs sm:text-sm font-bold text-emerald-700 hover:text-emerald-900 transition-colors flex items-center gap-1"
            >
              <span>💬 WhatsApp Group</span>
            </a>
            <Link
              href="/privacy"
              className="px-3 py-2 text-xs sm:text-sm font-bold text-stone-700 hover:text-stone-900 transition-colors"
            >
              Terms & Privacy
            </Link>
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 rounded-xl sm:rounded-2xl hover:shadow-lg hover:shadow-orange-500/30 hover:scale-105 transition-all duration-200"
                >
                  Dashboard & Upload
                </Link>
                {userRole === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-orange-800 bg-orange-100 rounded-xl sm:rounded-2xl hover:bg-orange-200 transition-all border border-orange-200"
                  >
                    Admin Panel ⚡
                  </Link>
                )}
              </>
            ) : (
              <Link
                href="/auth"
                className="px-5 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-black text-white bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 rounded-xl sm:rounded-2xl hover:shadow-xl hover:shadow-orange-500/35 hover:scale-105 transition-all duration-200 shadow-md"
              >
                Sign In / Register ✨
              </Link>
            )}
          </div>
        </header>

        {/* Responsive Hero Section */}
        <section className="text-center py-6 sm:py-10 lg:py-16 max-w-4xl mx-auto px-2">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-1.5 sm:py-2 rounded-full bg-amber-200/80 text-amber-900 text-xs sm:text-sm font-extrabold mb-4 sm:mb-6 border border-amber-300 shadow-sm max-w-full truncate">
            <span>🖨️ Black & White Campus Printing Service</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-black text-stone-900 tracking-tight leading-tight mb-4 sm:mb-6">
            Black & White Printing{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500">
              Made Simple.
            </span>
          </h1>

          <p className="text-base sm:text-xl text-stone-700 font-medium mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed">
            Upload your documents online, pay via UPI, and collect your <strong>Black & White</strong> printouts from <strong>Room 607</strong> during designated slots (10:40 AM – 10:50 AM or 12:30 PM – 1:20 PM)!
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4 w-full">
            <Link
              href={user ? "/dashboard" : "/auth"}
              className="w-full sm:w-auto px-8 sm:px-9 py-3.5 sm:py-4 text-base sm:text-lg font-black text-white bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 rounded-2xl shadow-xl shadow-orange-500/30 hover:shadow-2xl hover:shadow-orange-500/50 hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <span>{user ? "Go to Dashboard" : "Start Printing Now"}</span>
              <span className="text-xl">✨</span>
            </Link>

            <a
              href="#pricing"
              className="w-full sm:w-auto px-7 sm:px-8 py-3.5 sm:py-4 text-base sm:text-lg font-bold text-stone-800 bg-white/90 backdrop-blur-md rounded-2xl border border-orange-200 hover:bg-orange-50 transition-all duration-200 shadow-md shadow-orange-500/5 text-center"
            >
              Calculate Price 🧮
            </a>
          </div>
        </section>

        {/* Features Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 py-6 sm:py-8">
          <div className="bg-white/90 backdrop-blur-xl p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-orange-100 shadow-xl shadow-orange-500/10 hover:-translate-y-1.5 transition-all duration-300">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4 sm:mb-5 text-xl sm:text-2xl shadow-md shadow-amber-500/10">
              📄
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-stone-900 mb-2">Black & White Printouts</h3>
            <p className="text-stone-600 leading-relaxed text-xs sm:text-sm font-medium">
              Crisp black-n-white prints for notes, assignments, & lab manuals. Multi-file upload with aggregated pages!
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-orange-100 shadow-xl shadow-orange-500/10 hover:-translate-y-1.5 transition-all duration-300">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-4 sm:mb-5 text-xl sm:text-2xl shadow-md shadow-rose-500/10">
              🏷️
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-stone-900 mb-2">Volume Discounts</h3>
            <p className="text-stone-600 leading-relaxed text-xs sm:text-sm font-medium">
              Save big on large documents! Prices start at ₹4.00 and drop dynamically down to ₹3.50 per page.
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-orange-100 shadow-xl shadow-orange-500/10 hover:-translate-y-1.5 transition-all duration-300">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 sm:mb-5 text-xl sm:text-2xl shadow-md shadow-emerald-500/10">
              📍
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-stone-900 mb-2">Room 607 Collection</h3>
            <p className="text-stone-600 leading-relaxed text-xs sm:text-sm font-medium">
              Collect in Room 607 between 10:40–10:50 AM or 12:30–1:20 PM. Join our <a href="https://chat.whatsapp.com/IpaB1N8HSgyCs2UXdnv2AM" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline font-bold">WhatsApp Group</a> for updates!
            </p>
          </div>
        </section>

        {/* Live Pricing Estimator & Volume Tiers */}
        <section id="pricing" className="py-6 sm:py-8">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-5 sm:p-8 lg:p-12 border border-orange-200 shadow-2xl shadow-orange-500/10">
            <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
              <span className="px-3.5 py-1.5 bg-rose-100 text-rose-700 font-extrabold text-xs rounded-full uppercase tracking-wider border border-rose-200">
                Super Clear Pricing
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-stone-900 mt-3 mb-2">
                Live Pricing Calculator (B&W)
              </h2>
              <p className="text-stone-600 font-medium text-xs sm:text-sm">
                Move the slider to calculate instant costs for your documents.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-center">
              {/* Calculator Box */}
              <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-rose-500/10 p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-orange-200">
                <div className="flex justify-between items-center mb-6">
                  <span className="font-extrabold text-stone-900 text-base sm:text-lg">Total Pages</span>
                  <span className="text-xl sm:text-2xl font-black text-orange-600 bg-white px-3 sm:px-4 py-1 rounded-xl shadow-sm border border-orange-100">
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

                <div className="flex items-center gap-3 mb-6 bg-white/90 p-3.5 sm:p-4 rounded-2xl border border-orange-100">
                  <input
                    type="checkbox"
                    id="calcStaple"
                    checked={calcStaple}
                    onChange={(e) => setCalcStaple(e.target.checked)}
                    className="w-5 h-5 text-orange-500 rounded cursor-pointer accent-orange-500 shrink-0"
                  />
                  <label htmlFor="calcStaple" className="text-xs sm:text-sm font-bold text-stone-800 cursor-pointer">
                    Staple all pages together (+₹1.00)
                  </label>
                </div>

                <div className="border-t border-orange-200 pt-4 space-y-2">
                  <div className="flex justify-between text-xs sm:text-sm font-medium text-stone-600">
                    <span>Current B&W Tier Rate:</span>
                    <span className="font-bold text-stone-900">₹{currentRate.toFixed(2)} / page</span>
                  </div>
                  <div className="flex justify-between text-xl sm:text-2xl font-black text-orange-600 pt-2">
                    <span>Total Cost:</span>
                    <span>₹{calculatedTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Pricing Tiers */}
              <div className="space-y-3">
                <h3 className="text-base sm:text-lg font-black text-stone-900 mb-3">Volume Discount Schedule (B&W)</h3>

                <div className="flex justify-between items-center p-3.5 sm:p-4 bg-amber-50 rounded-2xl border border-amber-200">
                  <div>
                    <p className="font-extrabold text-stone-900 text-xs sm:text-sm">1 – 9 Pages</p>
                    <p className="text-[11px] sm:text-xs text-stone-500 font-medium">Standard single & short printouts</p>
                  </div>
                  <span className="px-3 sm:px-3.5 py-1 sm:py-1.5 bg-amber-200 font-black text-amber-900 rounded-xl text-xs sm:text-sm shrink-0">
                    ₹4.00 / pg
                  </span>
                </div>

                <div className="flex justify-between items-center p-3.5 sm:p-4 bg-orange-50 rounded-2xl border border-orange-200">
                  <div>
                    <p className="font-extrabold text-stone-900 text-xs sm:text-sm">10 – 29 Pages</p>
                    <p className="text-[11px] sm:text-xs text-stone-500 font-medium">Medium documents & lecture slides</p>
                  </div>
                  <span className="px-3 sm:px-3.5 py-1 sm:py-1.5 bg-orange-200 font-black text-orange-900 rounded-xl text-xs sm:text-sm shrink-0">
                    ₹3.75 / pg
                  </span>
                </div>

                <div className="flex justify-between items-center p-3.5 sm:p-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-2xl shadow-lg shadow-orange-500/20">
                  <div>
                    <p className="font-black text-xs sm:text-sm">30+ Pages (Best Value! 🔥)</p>
                    <p className="text-[11px] sm:text-xs text-orange-100 font-medium">Lab manuals, thesis & large packs</p>
                  </div>
                  <span className="px-3 sm:px-3.5 py-1 sm:py-1.5 bg-white text-orange-600 font-black rounded-xl text-xs sm:text-sm shrink-0">
                    ₹3.50 / pg
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row justify-between items-center py-6 sm:py-8 text-xs text-stone-500 font-bold border-t border-orange-200/60 gap-3 text-center sm:text-left">
          <p>© {new Date().getFullYear()} Printlet — Black & White Campus Printing Service. Contact: <a href="mailto:at6710@srmist.edu.in" className="underline hover:text-stone-800">at6710@srmist.edu.in</a></p>
          <div className="flex flex-wrap gap-4 justify-center sm:justify-end">
            <a href="https://chat.whatsapp.com/IpaB1N8HSgyCs2UXdnv2AM" target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:text-emerald-900 transition-colors">
              💬 WhatsApp Updates Group
            </a>
            <Link href="/privacy" className="hover:text-stone-900 transition-colors">
              Privacy Policy & Delivery Terms
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
