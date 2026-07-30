'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Bar */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-orange-500/10 border border-orange-200 flex justify-between items-center">
          <Link href="/" className="font-black text-2xl tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-orange-500 via-amber-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-md shadow-orange-500/30">
              <span className="text-lg">🖨️</span>
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600 font-black">
              PrintHub
            </span>
          </Link>

          <Link
            href="/dashboard"
            className="px-5 py-2 text-sm font-bold text-stone-800 bg-orange-100 rounded-xl hover:bg-orange-200 transition-colors border border-orange-200"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Main Terms & Privacy Card */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 lg:p-10 shadow-xl shadow-orange-500/10 border border-orange-200 space-y-8">
          <div>
            <span className="px-4 py-1.5 bg-orange-100 text-orange-800 font-extrabold text-xs rounded-full uppercase tracking-wider border border-orange-200">
              Transparency & Policies
            </span>
            <h1 className="text-4xl font-black text-stone-900 mt-3">
              Privacy Policy & Terms of Service
            </h1>
            <p className="text-sm text-stone-600 font-medium mt-1">
              Last updated: July 2026 • Campus Printing Service
            </p>
          </div>

          <hr className="border-orange-100" />

          {/* Section 1: Delivery Timelines & Delays */}
          <div className="space-y-3">
            <h2 className="text-2xl font-black text-stone-900 flex items-center gap-2">
              <span>🚚 Delivery Timelines & Outage Policy</span>
            </h2>
            <div className="bg-amber-50/80 p-5 rounded-2xl border border-amber-200 space-y-2 text-sm text-stone-700 font-medium leading-relaxed">
              <p>
                • <strong>Standard Schedule:</strong> Orders placed before midnight are printed overnight and made available for campus pickup the <strong>next working day around 12:30 PM.</strong>
              </p>
              <p>
                • <strong>Service Outages & Delays:</strong> While we strive for 100% on-time delivery, print fulfillment may occasionally be delayed due to power outages, internet disconnections, physical printer hardware maintenance, paper restocks, or severe weather conditions.
              </p>
              <p>
                • <strong>Outage Mode:</strong> When the site is marked in Outage/Maintenance Mode by an Admin, you may still upload documents and place orders, but the next-day 12:30 PM delivery timeline is paused. Your document will be printed as soon as normal operations resume.
              </p>
            </div>
          </div>

          {/* Section 2: Privacy & Document Data Handling */}
          <div className="space-y-3">
            <h2 className="text-2xl font-black text-stone-900 flex items-center gap-2">
              <span>🔒 Document Privacy & Storage</span>
            </h2>
            <div className="bg-orange-50/60 p-5 rounded-2xl border border-orange-200 space-y-2 text-sm text-stone-700 font-medium leading-relaxed">
              <p>
                • <strong>Strict Confidentiality:</strong> Your uploaded PDFs, Word documents, and images are used solely for the physical printing process.
              </p>
              <p>
                • <strong>Automatic Purging:</strong> Once your print job is fetched, downloaded, and printed by our automated Python daemon, temporary files are purged from local printer storage. Cloud storage keys are deleted upon completion.
              </p>
            </div>
          </div>

          {/* Section 3: Payments & Refunds */}
          <div className="space-y-3">
            <h2 className="text-2xl font-black text-stone-900 flex items-center gap-2">
              <span>💳 Pricing, Payments & Refunds</span>
            </h2>
            <div className="bg-rose-50/60 p-5 rounded-2xl border border-rose-200 space-y-2 text-sm text-stone-700 font-medium leading-relaxed">
              <p>
                • <strong>Dynamic Pricing:</strong> Printing rates start at <strong>₹4.00/page</strong> and scale down to <strong>₹3.50/page</strong> for volume orders (30+ pages). Optional stapling is ₹1.00 per batch.
              </p>
              <p>
                • <strong>Secure Razorpay Processing:</strong> Payments are processed via UPI, Credit/Debit cards, or NetBanking through Razorpay's PCI-DSS compliant checkout.
              </p>
              <p>
                • <strong>Refunds:</strong> If a print job fails due to a machine error or corrupted upload, contact the Admin directly via WhatsApp for a immediate free re-print or refund.
              </p>
            </div>
          </div>

          {/* Section 4: Contact & Support */}
          <div className="bg-gradient-to-r from-orange-500 to-rose-500 text-white p-6 rounded-2xl space-y-2 shadow-lg shadow-orange-500/20">
            <h3 className="text-xl font-black">Need Help or Have Questions?</h3>
            <p className="text-sm font-medium text-orange-50">
              Reach out directly to the dorm print operator via WhatsApp or email if you need urgent order assistance!
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-stone-500 font-bold py-4">
          <p>© {new Date().getFullYear()} PrintHub — Campus Dorm Printing Network</p>
        </footer>
      </div>
    </div>
  );
}
