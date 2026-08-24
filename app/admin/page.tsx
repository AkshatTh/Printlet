'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { getPickupMessage } from '@/lib/pickup-time';

interface Order {
  id: string;
  file_name: string;
  page_count: number;
  total_amount: number;
  amount_rupees?: string;
  status: string;
  pickup_time: string;
  created_at: string;
  updated_at?: string;
  requires_staple: boolean;
  user_id: string;
  profiles?: {
    full_name: string;
    phone_number: string;
  };
}

interface FinancialStats {
  grossRevenue: string;
  totalPages: number;
  razorpayFee: string;
  printCost: string;
  netProfit: string;
  pendingDeliveriesCount: number;
  readyDeliveriesCount: number;
  deliveredCount?: number;
}

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<FinancialStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Fulfillment & Outage Settings State
  const [siteIsClosed, setSiteIsClosed] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<'BATCH_7PM' | 'NORMAL_247'>('BATCH_7PM');
  const [siteMessage, setSiteMessage] = useState(
    'Printing service is temporarily paused due to maintenance or power outage. Your order can still be uploaded and paid for, but next-day delivery timeline will resume as soon as service reopens.'
  );
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusSuccessMsg, setStatusSuccessMsg] = useState<string | null>(null);
  const [downloadingBatch, setDownloadingBatch] = useState(false);

  // Admin Direct Free Print Upload states
  const [adminFiles, setAdminFiles] = useState<File[]>([]);
  const [adminStaple, setAdminStaple] = useState(false);
  const [adminUploading, setAdminUploading] = useState(false);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [adminErr, setAdminErr] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAdminAndLoadOrders();
    fetchSiteStatus();
  }, []);

  const fetchSiteStatus = async () => {
    try {
      const res = await fetch('/api/site-status');
      const data = await res.json();
      if (data) {
        setSiteIsClosed(Boolean(data.isClosed));
        if (data.mode) setFulfillmentMode(data.mode);
        if (data.message) setSiteMessage(data.message);
      }
    } catch (e) {}
  };

  const handleUpdateSiteSettings = async (
    newClosedState: boolean,
    newMode: 'BATCH_7PM' | 'NORMAL_247',
    newMessage?: string
  ) => {
    if (!sessionToken) return;
    setStatusUpdating(true);
    setStatusSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/site-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          isClosed: newClosedState,
          mode: newMode,
          message: newMessage || siteMessage
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSiteIsClosed(data.isClosed);
        setFulfillmentMode(data.mode);
        setStatusSuccessMsg('Settings updated successfully!');
        setTimeout(() => setStatusSuccessMsg(null), 3000);
      }
    } catch (e) {
      console.error('Failed to update site settings:', e);
    } finally {
      setStatusUpdating(false);
    }
  };

  const checkAdminAndLoadOrders = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session || !session.user) {
        setLoading(false);
        router.replace('/auth');
        return;
      }

      setSessionToken(session.access_token);

      const response = await fetch('/api/admin/orders', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setIsAdmin(false);
          setLoading(false);
          setTimeout(() => {
            router.replace('/dashboard');
          }, 1500);
          return;
        }
        throw new Error(data.error || 'Failed to load orders');
      }

      setIsAdmin(true);
      setOrders(data.orders || []);
      setDeliveredOrders(data.deliveredOrders || []);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBatchPdf = async () => {
    if (!sessionToken) return;
    setDownloadingBatch(true);
    try {
      const res = await fetch('/api/admin/batch-pdf', {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to download batch PDF');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Printlet_Batch_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert('Error downloading batch PDF');
    } finally {
      setDownloadingBatch(false);
    }
  };

  const markAsDelivered = async (orderId: string) => {
    if (!sessionToken) return;

    try {
      const response = await fetch('/api/admin/deliver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        await checkAdminAndLoadOrders();
      } else {
        alert(data.error || 'Failed to mark order as delivered');
      }
    } catch (err) {
      console.error('Failed to mark delivered:', err);
    }
  };

  const handleAdminDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleAdminDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setAdminFiles(prev => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleAdminFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAdminFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleAdminUpload = async () => {
    if (adminFiles.length === 0) {
      setAdminErr('Please select at least one document to upload');
      return;
    }

    if (!sessionToken) return;

    setAdminUploading(true);
    setAdminErr(null);
    setAdminMsg(null);

    try {
      const formData = new FormData();
      adminFiles.forEach(f => formData.append('files', f));
      formData.append('requiresStaple', String(adminStaple));

      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Admin upload failed');
      }

      setAdminMsg(`Success! ${data.fileCount} file(s) (${data.pageCount} pages) sent to queue.`);
      setAdminFiles([]);
      setAdminStaple(false);
      checkAdminAndLoadOrders();
    } catch (err) {
      setAdminErr(err instanceof Error ? err.message : 'Admin upload failed');
    } finally {
      setAdminUploading(false);
    }
  };

  const getWhatsAppLink = (phone: string, name: string, pickupTimeStr: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    const pickupMessage = getPickupMessage(new Date(pickupTimeStr));

    const text = encodeURIComponent(
      `Hi ${name}! 🖨️ Your print order from Printlet is printed and ready!\n\n📍 ${pickupMessage}\n\nSee you then!`
    );

    return `https://wa.me/${formattedPhone}?text=${text}`;
  };

  // Compute Page Mapping Ranges for Batch Printing Matrix
  let currentPageOffset = 1;
  const pageMappings = orders.map((order) => {
    const startPage = currentPageOffset;
    const endPage = currentPageOffset + (order.page_count || 1) - 1;
    currentPageOffset = endPage + 1;
    return {
      order,
      startPage,
      endPage,
    };
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900 px-4">
        <div className="bg-white/90 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-red-200 text-center max-w-md shadow-xl w-full">
          <div className="text-5xl mb-4">⛔</div>
          <h1 className="text-2xl font-black text-red-600 mb-2">Access Denied</h1>
          <p className="text-stone-600 text-sm font-bold">You need administrator privileges to view this page.</p>
          <p className="text-xs text-stone-400 mt-4 font-medium">Redirecting to student dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900 py-6 sm:py-8 px-3 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* Header Bar */}
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl shadow-orange-500/10 border border-orange-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600">
              Admin Delivery & Operations ⚡
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 mt-1 font-bold">Campus Dorm Printlet Network</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Link
              href="/privacy"
              className="px-3 py-2 text-xs sm:text-sm font-bold text-stone-700 hover:text-stone-900 transition-colors"
            >
              Terms & Privacy
            </Link>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-stone-800 bg-orange-100 rounded-xl hover:bg-orange-200 transition-colors border border-orange-200"
            >
              Student Dashboard
            </button>
            <button
              onClick={() => {
                supabase.auth.signOut();
                router.replace('/auth');
              }}
              className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-red-700 bg-red-100 rounded-xl hover:bg-red-200 transition-colors border border-red-200"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Mode Switcher & Service Control Panel */}
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl shadow-orange-500/10 border border-orange-200 space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-stone-900 flex flex-wrap items-center gap-2">
                <span>⚙️ Fulfillment Mode & Service Status</span>
                <span className={`px-3 py-1 rounded-full text-xs font-black ${
                  fulfillmentMode === 'BATCH_7PM'
                    ? 'bg-amber-200 text-amber-950 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {fulfillmentMode === 'BATCH_7PM' ? '📦 7 PM Batch Cutoff Mode (Testing)' : '🖨️ Normal Daemon Mode (24/7)'}
                </span>
              </h2>
              <p className="text-xs text-stone-600 font-bold mt-1">
                Toggle operational mode. In 7 PM Batch Mode, customer banners show orders cutoff at 7 PM for local shop printing.
              </p>
            </div>

            {/* Toggle Mode Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto">
              <button
                onClick={() => handleUpdateSiteSettings(siteIsClosed, fulfillmentMode === 'BATCH_7PM' ? 'NORMAL_247' : 'BATCH_7PM')}
                disabled={statusUpdating}
                className="w-full sm:w-auto px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-md text-center"
              >
                {statusUpdating ? 'Updating...' : `Switch to ${fulfillmentMode === 'BATCH_7PM' ? '🖨️ Normal 24/7 Mode' : '📦 7 PM Batch Mode'}`}
              </button>

              <button
                onClick={() => handleUpdateSiteSettings(!siteIsClosed, fulfillmentMode)}
                disabled={statusUpdating}
                className={`w-full sm:w-auto px-4 py-2.5 font-black text-xs sm:text-sm rounded-xl transition-all shadow-md text-center ${
                  siteIsClosed
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                {siteIsClosed ? '🟢 Re-Open Service' : '🔴 Outage / Close Site'}
              </button>
            </div>
          </div>

          {statusSuccessMsg && (
            <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200">
              {statusSuccessMsg}
            </div>
          )}
        </div>

        {/* Mobile Batch PDF Download & Zero-Cost Page Breakdown Box */}
        <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-rose-500/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-orange-300 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
                <span>📦 Today's 7 PM Batch PDF Compiler</span>
              </h2>
              <p className="text-xs text-stone-600 font-bold mt-0.5">
                Compiles all active paid documents into one master PDF for mobile download. No extra cover pages added!
              </p>
            </div>

            <button
              onClick={handleDownloadBatchPdf}
              disabled={downloadingBatch || orders.length === 0}
              className="w-full sm:w-auto px-6 py-3 font-black text-sm text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-xl shadow-lg transition-all disabled:opacity-50 text-center shrink-0"
            >
              {downloadingBatch ? 'Compiling PDF...' : `📥 Download 7 PM Batch PDF (${orders.length} orders)`}
            </button>
          </div>

          {/* Zero-Cost Page Mapping Breakdown Matrix */}
          {pageMappings.length > 0 && (
            <div className="bg-white/90 rounded-2xl p-4 border border-orange-200 space-y-3">
              <p className="text-xs font-black text-stone-800 uppercase tracking-wider flex items-center justify-between">
                <span>📋 Customer PDF Page Breakdown (Zero-Cost Sheet Mapping)</span>
                <span className="text-orange-600">Total Pages: {currentPageOffset - 1}</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                {pageMappings.map(({ order, startPage, endPage }, idx) => (
                  <div key={order.id} className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="px-2 py-0.5 bg-orange-600 text-white font-black rounded-md text-[10px]">
                        Pages {startPage} – {endPage}
                      </span>
                      {order.requires_staple ? (
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-950 font-black rounded-md text-[10px]">
                          📌 STAPLE
                        </span>
                      ) : (
                        <span className="text-stone-400 font-bold text-[10px]">No Staple</span>
                      )}
                    </div>
                    <p className="font-extrabold text-stone-900 truncate mt-1">
                      {idx + 1}. {order.profiles?.full_name || 'Customer'}
                    </p>
                    <p className="text-[11px] text-orange-700 font-mono font-bold">
                      {order.profiles?.phone_number || 'No phone'}
                    </p>
                    <p className="text-[10px] text-stone-500 font-medium truncate">
                      {order.file_name} ({order.page_count} pg)
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Financial & Operational Analytics Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-orange-200 shadow-md">
              <p className="text-[10px] sm:text-xs text-stone-500 font-bold uppercase tracking-wider">Gross Revenue</p>
              <p className="text-xl sm:text-2xl font-black text-stone-900 mt-1">₹{stats.grossRevenue}</p>
              <p className="text-[11px] text-stone-500 mt-1 font-medium">All Paid Orders</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-md">
              <p className="text-[10px] sm:text-xs text-emerald-700 font-bold uppercase tracking-wider">Net Profit 📈</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">₹{stats.netProfit}</p>
              <p className="text-[11px] text-emerald-800 mt-1 font-medium">After Fees & Paper</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-orange-200 shadow-md">
              <p className="text-[10px] sm:text-xs text-stone-500 font-bold uppercase tracking-wider">Total Pages</p>
              <p className="text-xl sm:text-2xl font-black text-orange-600 mt-1">{stats.totalPages}</p>
              <p className="text-[11px] text-stone-500 mt-1 font-medium">Paper Cost: ₹{stats.printCost}</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-orange-200 shadow-md">
              <p className="text-[10px] sm:text-xs text-stone-500 font-bold uppercase tracking-wider">Queue to Deliver</p>
              <p className="text-xl sm:text-2xl font-black text-rose-600 mt-1">{stats.pendingDeliveriesCount}</p>
              <p className="text-[11px] text-stone-500 mt-1 font-medium">{stats.readyDeliveriesCount} Printed</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 shadow-md col-span-2 sm:col-span-1">
              <p className="text-[10px] sm:text-xs text-purple-700 font-bold uppercase tracking-wider">Completed (10d) ✅</p>
              <p className="text-xl sm:text-2xl font-black text-purple-600 mt-1">{stats.deliveredCount || deliveredOrders.length}</p>
              <p className="text-[11px] text-purple-800 mt-1 font-medium">Delivered Orders</p>
            </div>
          </div>
        )}

        {/* Section 1: Active Campus Delivery Queue Table */}
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-xl shadow-orange-500/10 border border-orange-200 overflow-hidden">
          <div className="p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 mb-4 sm:mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>🚚 Active Queue</span>
              </span>
              <span className="text-xs sm:text-sm font-bold px-3 py-1 bg-orange-100 text-orange-800 rounded-full">
                {orders.length} Pending
              </span>
            </h2>

            {orders.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <p className="text-stone-600 text-base sm:text-lg font-bold">All active orders have been delivered! 🎉</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-orange-200">
                      <th className="text-left py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Customer</th>
                      <th className="text-left py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Document(s)</th>
                      <th className="text-center py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Pages</th>
                      <th className="text-center py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Staple</th>
                      <th className="text-right py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Amount Paid</th>
                      <th className="text-left py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Pickup Time</th>
                      <th className="text-center py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Status</th>
                      <th className="text-right py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-orange-100 hover:bg-amber-50/60 transition-colors">
                        <td className="py-3 px-3">
                          <div>
                            <p className="font-bold text-xs sm:text-sm text-stone-900">
                              {order.profiles?.full_name || 'Guest Order'}
                            </p>
                            <p className="text-xs text-orange-600 font-mono font-bold">
                              {order.profiles?.phone_number || 'No phone'}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <p className="text-xs sm:text-sm font-bold text-stone-900 truncate max-w-[150px]">
                            {order.file_name || 'Document'}
                          </p>
                          <p className="text-[10px] text-stone-500 font-mono">ID: {order.id.slice(0, 8)}</p>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-bold text-xs sm:text-sm text-stone-900">
                            {order.page_count}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {order.requires_staple ? (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[11px] font-black inline-flex items-center justify-center gap-1 shadow-sm whitespace-nowrap">
                              📌 Stapled (+₹1)
                            </span>
                          ) : (
                            <span className="text-stone-400 text-xs font-bold">
                              No Staple
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="font-black text-xs sm:text-sm text-emerald-600">
                            ₹{(order.total_amount / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <p className="text-xs sm:text-sm font-bold text-stone-900">
                            {new Date(order.pickup_time).toLocaleDateString('en-IN', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                          <p className="text-[10px] text-stone-500 font-bold">10:40 AM / 12:30 PM</p>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black whitespace-nowrap ${
                            order.status === 'PRINTED'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-orange-100 text-orange-800 border border-orange-200'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {order.profiles?.phone_number && (
                              <a
                                href={getWhatsAppLink(
                                  order.profiles.phone_number,
                                  order.profiles.full_name,
                                  order.pickup_time
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap"
                              >
                                WhatsApp
                              </a>
                            )}
                            <button
                              onClick={() => markAsDelivered(order.id)}
                              className="px-2.5 py-1 bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
                            >
                              Mark Delivered
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Delivered Order History Table (Last 10 Days) */}
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-xl shadow-orange-500/10 border border-orange-200 overflow-hidden">
          <div className="p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 mb-4 sm:mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>✅ Delivered Orders (Last 10 Days)</span>
              </span>
              <span className="text-xs sm:text-sm font-bold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full">
                {deliveredOrders.length} Completed
              </span>
            </h2>

            {deliveredOrders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-stone-500 text-xs sm:text-sm font-bold">No orders marked as delivered in the last 10 days.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-orange-200">
                      <th className="text-left py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Customer</th>
                      <th className="text-left py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Document(s)</th>
                      <th className="text-center py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Pages</th>
                      <th className="text-center py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Staple</th>
                      <th className="text-right py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Amount Paid</th>
                      <th className="text-left py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Delivered On</th>
                      <th className="text-center py-3 px-3 text-xs sm:text-sm font-bold text-stone-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveredOrders.map((order) => (
                      <tr key={order.id} className="border-b border-stone-100 hover:bg-emerald-50/40 transition-colors">
                        <td className="py-3 px-3">
                          <div>
                            <p className="font-bold text-xs sm:text-sm text-stone-900">
                              {order.profiles?.full_name || 'Student Order'}
                            </p>
                            <p className="text-xs text-stone-500 font-mono">
                              {order.profiles?.phone_number || 'No phone'}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <p className="text-xs sm:text-sm font-bold text-stone-900 truncate max-w-[150px]">
                            {order.file_name || 'Document'}
                          </p>
                          <p className="text-[10px] text-stone-400 font-mono">ID: {order.id.slice(0, 8)}</p>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-bold text-xs sm:text-sm text-stone-800">
                            {order.page_count}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {order.requires_staple ? (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[11px] font-black inline-flex items-center justify-center gap-1 shadow-sm whitespace-nowrap">
                              📌 Stapled (+₹1)
                            </span>
                          ) : (
                            <span className="text-stone-400 text-xs font-bold">
                              No Staple
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="font-black text-xs sm:text-sm text-emerald-600">
                            ₹{(order.total_amount / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <p className="text-xs sm:text-sm font-bold text-stone-800">
                            {new Date(order.updated_at || order.created_at).toLocaleDateString('en-IN', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                            DELIVERED
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
