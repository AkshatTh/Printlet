'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { createClient } from '@/lib/supabase-client';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Order {
  id: string;
  file_name: string;
  page_count: number;
  total_amount: number;
  status: string;
  payment_status: string;
  pickup_time: string;
  created_at: string;
  requires_staple: boolean;
}

interface UploadResponse {
  orderId: string;
  pageCount: number;
  fileCount: number;
  fileNames: string;
  requiresStaple: boolean;
  pricePerPage: number;
  totalAmount: number;
  totalAmountPaise: number;
  breakdown: {
    fileCount: number;
    pages: number;
    pricePerPage: number;
    staple: number;
    subtotal: number;
    total: number;
  };
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [siteStatus, setSiteStatus] = useState<{ isClosed: boolean; message: string; mode?: 'BATCH_7PM' | 'NORMAL_247' } | null>(null);

  // Multi-file upload states
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [requiresStaple, setRequiresStaple] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<{
    orderId: string;
    fileNames: string;
    pageCount: number;
    amount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const unlockBodyScroll = () => {
    document.body.style.overflow = 'unset';
    document.body.style.position = 'relative';
    document.documentElement.style.overflow = 'unset';
  };

  useEffect(() => {
    loadData();
    return () => unlockBodyScroll();
  }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
      router.replace('/auth');
      return;
    }

    setSessionToken(session.access_token);

    fetch('/api/site-status')
      .then(res => res.json())
      .then(data => setSiteStatus(data))
      .catch(() => {});

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profile) {
      setUserName(profile.full_name);
      setUserRole(profile.role);
    }

    const { data: ordersData } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (ordersData) {
      setOrders(ordersData);
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/auth');
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'];
      
      const validFiles = droppedFiles.filter(f => allowedTypes.includes(f.type));
      if (validFiles.length > 0) {
        setSelectedFiles(prev => [...prev, ...validFiles]);
        setError(null);
      } else {
        setError('Please upload PDF, DOCX, PNG, or JPG files.');
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one document to upload');
      return;
    }

    if (!sessionToken) {
      setError('Session expired. Please sign in again.');
      router.replace('/auth');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
      formData.append('requiresStaple', String(requiresStaple));

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`${data.error || 'Upload failed'}${data.details ? ': ' + data.details : ''}`);
      }

      setUploadResponse(data);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      if (msg.includes('Session expired') || msg.includes('sign in again')) {
        setTimeout(() => {
          supabase.auth.signOut();
          router.replace('/auth');
        }, 2000);
      }
    } finally {
      setUploading(false);
    }
  };

  const handlePayment = async () => {
    if (!uploadResponse || !sessionToken) return;

    try {
      setError(null);

      const checkoutResponse = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ orderId: uploadResponse.orderId }),
      });

      const checkoutData = await checkoutResponse.json();

      if (!checkoutResponse.ok) {
        throw new Error(checkoutData.error || 'Checkout failed');
      }

      const options = {
        key: checkoutData.keyId,
        amount: checkoutData.amount,
        currency: checkoutData.currency,
        name: 'Printlet',
        description: `B&W Print ${uploadResponse.pageCount} total page(s) (${uploadResponse.fileCount} file(s))`,
        order_id: checkoutData.razorpayOrderId,
        modal: {
          ondismiss: function () {
            unlockBodyScroll();
          }
        },
        handler: async function (response: any) {
          unlockBodyScroll();
          try {
            const verifyResponse = await fetch('/api/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                order_id: uploadResponse.orderId,
              }),
            });

            const verifyData = await verifyResponse.json();

            if (verifyData.success) {
              setPaymentSuccess({
                orderId: uploadResponse.orderId,
                fileNames: uploadResponse.fileNames,
                pageCount: uploadResponse.pageCount,
                amount: uploadResponse.totalAmount,
              });
              setSelectedFiles([]);
              setUploadResponse(null);
              setRequiresStaple(false);
              loadData();
            } else {
              setError('Payment verification failed');
            }
          } catch (err) {
            setError('Payment verification failed');
          } finally {
            unlockBodyScroll();
          }
        },
        theme: {
          color: '#f97316',
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err) {
      unlockBodyScroll();
      setError(err instanceof Error ? err.message : 'Payment failed');
    }
  };

  const resetForm = () => {
    unlockBodyScroll();
    setPaymentSuccess(null);
    setUploadResponse(null);
    setSelectedFiles([]);
    setRequiresStaple(false);
    setError(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'PAID': return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'PRINTED': return 'bg-rose-100 text-rose-800 border border-rose-200';
      case 'DELIVERED': return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      default: return 'bg-stone-100 text-stone-800 border border-stone-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="min-h-screen bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900 py-6 sm:py-8 px-3 sm:px-6 lg:px-8 font-sans">
        <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
          {/* Service Outage Banner Notice */}
          {siteStatus?.isClosed && (
            <div className="p-4 bg-amber-200/90 border border-amber-400 text-amber-950 rounded-2xl sm:rounded-3xl shadow-lg flex items-start gap-3">
              <span className="text-2xl mt-0.5 shrink-0">⚠️</span>
              <div>
                <p className="font-extrabold text-sm sm:text-base">Service Notice: Maintenance / Outage Mode Active</p>
                <p className="text-xs sm:text-sm font-medium mt-0.5 leading-relaxed">{siteStatus.message}</p>
              </div>
            </div>
          )}

          {/* Responsive Header Bar */}
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl shadow-orange-500/10 border border-orange-200 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
            <div className="text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600">
                Welcome, {userName}! 👋
              </h1>
              <p className="text-xs sm:text-sm text-stone-600 mt-0.5 font-bold">Black & White Campus Print Dashboard</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full sm:w-auto">
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
              <button
                onClick={() => router.push('/')}
                className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-stone-800 bg-orange-100 rounded-xl hover:bg-orange-200 transition-colors border border-orange-200"
              >
                Home Page
              </button>
              {userRole === 'ADMIN' && (
                <button
                  onClick={() => router.push('/admin')}
                  className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-orange-900 bg-orange-200 rounded-xl hover:bg-orange-300 transition-colors border border-orange-300"
                >
                  Admin Panel ⚡
                </button>
              )}
              <button
                onClick={handleLogout}
                className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-red-700 bg-red-100 rounded-xl hover:bg-red-200 transition-colors border border-red-200"
              >
                Logout
              </button>
            </div>
          </div>

          {/* 7 PM Order Cutoff Banner (When Batch Mode is Active) */}
          {siteStatus?.mode === 'BATCH_7PM' && (
            <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-300 text-orange-950 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-3 shadow-sm">
              <span className="text-xl shrink-0">🕒</span>
              <div>
                <span className="font-black text-orange-900 uppercase">Daily 7 PM Order Cutoff: </span>
                Upload & pay before <strong>7:00 PM</strong> for next-morning pickup! Orders placed after 7:00 PM will be included in tomorrow's morning batch.
              </div>
            </div>
          )}

          {/* Permanent Collection & Location Card */}
          <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-orange-200 shadow-lg shadow-orange-500/5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-orange-800 font-black text-base sm:text-lg">
                <span>📍</span>
                <span>Pickup Information & Slots</span>
              </div>
              <a
                href="https://chat.whatsapp.com/IpaB1N8HSgyCs2UXdnv2AM"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition-all shadow-sm w-fit"
              >
                <span>💬 Join WhatsApp Group for Updates</span>
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm font-medium text-stone-700">
              <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200">
                <p className="text-[10px] sm:text-xs font-black text-stone-500 uppercase">Order Cutoff</p>
                <p className="font-extrabold text-stone-900 mt-0.5 text-sm sm:text-base">
                  {siteStatus?.mode === 'BATCH_7PM' ? 'Everyday 7:00 PM' : '24/7 Night Uploads'}
                </p>
              </div>

              <div className="bg-orange-50 p-3.5 rounded-2xl border border-orange-200">
                <p className="text-[10px] sm:text-xs font-black text-stone-500 uppercase">Daily Pickup Slots</p>
                <p className="font-extrabold text-orange-900 mt-0.5 text-xs">
                  • 10:40 AM – 10:50 AM<br />• 12:30 PM – 1:20 PM
                </p>
              </div>

              <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200">
                <p className="text-[10px] sm:text-xs font-black text-stone-500 uppercase">Inquiries & Discussions</p>
                <p className="font-bold text-rose-900 mt-0.5 text-xs">
                  <a href="mailto:at6710@srmist.edu.in" className="underline font-black">at6710@srmist.edu.in</a>
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-100/70 border border-amber-300 text-amber-950 rounded-xl sm:rounded-2xl text-xs font-bold leading-relaxed">
              ⚠️ <strong>Important Notice:</strong> Pickup location is <strong>Room 607</strong>. If you fail to collect your printouts during the designated slots (10:40–10:50 AM or 12:30–1:20 PM) or do not contact <a href="mailto:at6710@srmist.edu.in" className="underline">at6710@srmist.edu.in</a>, pickup of your printout will be delayed to the next working day.
            </div>
          </div>

          {/* Multi-File Upload Section */}
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 shadow-xl shadow-orange-500/10 border border-orange-200 space-y-5 sm:space-y-6">
            {error && (
              <div className="p-4 bg-red-100 text-red-800 rounded-2xl text-xs sm:text-sm border border-red-200 font-bold">
                {error}
              </div>
            )}

            {/* SUCCESS SCREEN STATE AFTER PAYMENT */}
            {paymentSuccess ? (
              <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-amber-500/10 p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-emerald-300 text-center space-y-5 sm:space-y-6">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500 text-white rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto text-3xl sm:text-4xl shadow-xl shadow-emerald-500/30 animate-bounce">
                  🎉
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-stone-900">Payment Successful & Order Placed!</h2>
                  <p className="text-stone-600 font-bold text-xs sm:text-sm mt-1">
                    Your Black & White document has been sent to the batch print queue.
                  </p>
                </div>

                <div className="bg-white/90 p-4 sm:p-5 rounded-2xl border border-emerald-200 text-left max-w-lg mx-auto space-y-2.5 sm:space-y-3 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-stone-500 font-medium">Document(s):</span>
                    <span className="font-bold text-stone-900 truncate max-w-[180px]">{paymentSuccess.fileNames}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500 font-medium">Total B&W Pages:</span>
                    <span className="font-bold text-stone-900">{paymentSuccess.pageCount} pages</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500 font-medium">Amount Paid:</span>
                    <span className="font-black text-emerald-600 text-sm sm:text-base">₹{paymentSuccess.amount.toFixed(2)}</span>
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs font-bold text-stone-800 space-y-1.5">
                    <p className="text-emerald-800 text-xs sm:text-sm font-black flex items-center gap-1.5">
                      <span>📍</span>
                      <span>Collection Instructions</span>
                    </p>
                    <p>• <strong>Pickup Location:</strong> <span className="text-orange-600 font-black text-xs sm:text-sm">Room 607</span></p>
                    <p>• <strong>Daily Pickup Slots:</strong> 10:40 AM – 10:50 AM or 12:30 PM – 1:20 PM</p>
                    <p>• <strong>Contact Email:</strong> <a href="mailto:at6710@srmist.edu.in" className="text-orange-600 underline">at6710@srmist.edu.in</a></p>
                    <p className="pt-1">
                      💬 <a href="https://chat.whatsapp.com/IpaB1N8HSgyCs2UXdnv2AM" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline font-black">Join WhatsApp Community Group for Live Order Updates</a>
                    </p>
                  </div>

                  <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs font-bold">
                    ⚠️ <strong>Disclaimer:</strong> If you do not come during designated pickup slots or fail to contact us, pickup of your printout will be delayed to the next working day.
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-2">
                  <button
                    onClick={resetForm}
                    className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base font-black text-white bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 rounded-2xl shadow-lg shadow-orange-500/30 hover:scale-105 transition-all text-center"
                  >
                    Print Another Document ✨
                  </button>
                  <button
                    onClick={() => {
                      resetForm();
                      document.getElementById('order-history')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 text-xs sm:text-base font-bold text-stone-800 bg-white rounded-2xl hover:bg-stone-100 transition-colors border border-stone-300 text-center"
                  >
                    View Order History ↓
                  </button>
                </div>
              </div>
            ) : !uploadResponse ? (
              <div className="space-y-5 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-black text-stone-900 flex items-center gap-2">
                  <span>📂 Upload Documents (B&W Only)</span>
                </h2>

                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-3 border-dashed rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-center transition-all cursor-pointer ${
                    dragActive
                      ? 'border-orange-500 bg-orange-100/70 scale-102'
                      : 'border-orange-300 hover:border-orange-400 bg-amber-50/60'
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="multi-file-input"
                  />
                  <label htmlFor="multi-file-input" className="cursor-pointer block">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-tr from-orange-500 via-rose-500 to-amber-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-lg shadow-orange-500/30 text-2xl sm:text-3xl">
                      📄
                    </div>
                    <p className="text-base sm:text-xl font-black text-stone-900">
                      Tap or Drag Files to Upload
                    </p>
                    <p className="text-xs sm:text-sm text-stone-600 mt-1 font-medium">
                      PDF, DOCX, PNG, JPG (Multi-file batch upload)
                    </p>
                  </label>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="space-y-3 bg-orange-50/60 p-3.5 sm:p-4 rounded-2xl border border-orange-200">
                    <p className="font-extrabold text-xs sm:text-sm text-stone-800">
                      Selected Documents ({selectedFiles.length}):
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl border border-orange-100 text-xs sm:text-sm shadow-sm gap-2">
                          <div className="truncate">
                            <p className="font-bold text-stone-900 truncate">{file.name}</p>
                            <p className="text-[11px] text-stone-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                          </div>
                          <button
                            onClick={() => removeFile(idx)}
                            className="text-red-500 hover:text-red-700 p-1 rounded-lg font-black text-base shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 bg-amber-100/60 p-3.5 sm:p-4 rounded-2xl border border-amber-200">
                  <input
                    type="checkbox"
                    id="requiresStaple"
                    checked={requiresStaple}
                    onChange={(e) => setRequiresStaple(e.target.checked)}
                    className="w-5 h-5 text-orange-500 rounded cursor-pointer accent-orange-500 shrink-0"
                  />
                  <label htmlFor="requiresStaple" className="text-xs sm:text-sm font-bold text-stone-800 cursor-pointer">
                    Staple all documents together (+₹1.00)
                  </label>
                </div>

                <button
                  onClick={handleUpload}
                  disabled={uploading || selectedFiles.length === 0}
                  className="w-full py-3.5 sm:py-4 text-base sm:text-lg font-black text-white bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 rounded-2xl shadow-xl shadow-orange-500/30 hover:shadow-2xl hover:scale-101 transition-all disabled:opacity-50 text-center"
                >
                  {uploading ? 'Calculating Pages...' : `Upload & Calculate Price (${selectedFiles.length} file(s)) ✨`}
                </button>
              </div>
            ) : (
              <div className="space-y-5 sm:space-y-6 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-rose-500/10 p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-orange-200">
                <h3 className="text-lg sm:text-xl font-black text-stone-900">
                  Order Summary (B&W Printout)
                </h3>

                <div className="space-y-3 text-xs sm:text-sm">
                  <div className="flex justify-between py-2 border-b border-orange-200">
                    <span className="text-stone-600 font-medium">Documents:</span>
                    <span className="font-bold text-stone-900 truncate max-w-[180px]">{uploadResponse.fileNames}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-orange-200">
                    <span className="text-stone-600 font-medium">Total B&W Page Count:</span>
                    <span className="font-black text-orange-600">{uploadResponse.pageCount} page(s)</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-orange-200">
                    <span className="text-stone-600 font-medium">Tier Rate Applied:</span>
                    <span className="font-bold text-stone-900">₹{uploadResponse.pricePerPage.toFixed(2)} / page</span>
                  </div>
                  {uploadResponse.requiresStaple && (
                    <div className="flex justify-between py-2 border-b border-orange-200">
                      <span className="text-stone-600 font-medium">Staple Fee:</span>
                      <span className="font-bold text-stone-900">₹1.00</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 text-xl sm:text-2xl font-black text-orange-600 pt-4">
                    <span>Total Amount:</span>
                    <span>₹{uploadResponse.totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <button
                    onClick={handlePayment}
                    className="w-full sm:flex-1 py-3.5 sm:py-4 text-base sm:text-lg font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/30 hover:shadow-xl transition-all text-center"
                  >
                    Pay ₹{uploadResponse.totalAmount.toFixed(2)} via UPI / Card ✨
                  </button>
                  <button
                    onClick={resetForm}
                    className="w-full sm:w-auto px-6 py-3.5 sm:py-4 text-xs sm:text-sm font-bold text-stone-700 bg-white rounded-2xl hover:bg-stone-100 transition-colors border border-stone-200 text-center"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Past Orders Section */}
          <div id="order-history" className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 shadow-xl shadow-orange-500/10 border border-orange-200">
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 mb-4 sm:mb-6">
              Your Order History
            </h2>

            {orders.length === 0 ? (
              <p className="text-stone-500 text-center py-6 sm:py-8 font-bold text-xs sm:text-sm">
                No orders yet. Upload documents above to place your first print job!
              </p>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {orders.map((ord) => {
                  const currentStatus = ord.status || ord.payment_status || 'PENDING';
                  return (
                    <div key={ord.id} className="p-4 sm:p-5 bg-amber-50/60 rounded-2xl border border-orange-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-stone-900 text-xs sm:text-sm truncate max-w-xs">{ord.file_name || 'Document Print'}</p>
                          <p className="text-[11px] sm:text-xs text-stone-600 font-bold mt-0.5">
                            {ord.page_count} B&W pages • ₹{(ord.total_amount / 100).toFixed(2)} • {new Date(ord.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`self-start sm:self-center px-3 py-1 rounded-full text-[11px] sm:text-xs font-black ${getStatusBadge(currentStatus)}`}>
                          {currentStatus}
                        </span>
                      </div>

                      {ord.pickup_time && (currentStatus === 'PAID' || currentStatus === 'PRINTED') && (
                        <div className="p-3 bg-orange-100 text-orange-900 rounded-xl text-xs font-bold border border-orange-300 flex items-center gap-2">
                          <span className="shrink-0">📍</span>
                          <span>
                            {siteStatus?.isClosed
                              ? 'Outage Notice: Order received. Delivery timeline will resume when service reopens.'
                              : `Collect in Room 607 (10:40–10:50 AM or 12:30–1:20 PM). Contact: at6710@srmist.edu.in`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
