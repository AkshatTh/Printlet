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

  // Site Outage / Closed Maintenance Toggle State
  const [siteIsClosed, setSiteIsClosed] = useState(false);
  const [siteMessage, setSiteMessage] = useState(
    'Printing service is temporarily paused due to maintenance or power outage. Your order can still be uploaded and paid for, but next-day delivery timeline will resume as soon as service reopens.'
  );
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusSuccessMsg, setStatusSuccessMsg] = useState<string | null>(null);

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
        if (data.message) setSiteMessage(data.message);
      }
    } catch (e) {}
  };

  const handleToggleSiteStatus = async (newClosedState: boolean) => {
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
          message: siteMessage
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSiteIsClosed(data.isClosed);
        setStatusSuccessMsg(
          data.isClosed
            ? 'Site marked as CLOSED (Outage Mode active for all users)'
            : 'Site marked as OPEN (Normal service active)'
        );
        setTimeout(() => setStatusSuccessMsg(null), 3000);
      }
    } catch (e) {
      console.error('Failed to toggle site status:', e);
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

      // Fetch admin orders & financial statistics via secure service-role API endpoint
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
        // Re-fetch all orders & stats from backend to update active & delivered queues cleanly
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

      setAdminMsg(`Success! ${data.fileCount} file(s) (${data.pageCount} pages) sent to local printer queue.`);
      setAdminFiles([]);
      setAdminStaple(false);
      checkAdminAndLoadOrders(); // Refresh table
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
      `Hi ${name}! 🖨️ Your print order from PrintHub is printed and ready!\n\n📍 ${pickupMessage}\n\nSee you then!`
    );

    return `https://wa.me/${formattedPhone}?text=${text}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900">
        <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl border border-red-200 text-center max-w-md shadow-xl">
          <div className="text-5xl mb-4">⛔</div>
          <h1 className="text-2xl font-black text-red-600 mb-2">Access Denied</h1>
          <p className="text-stone-600 text-sm font-bold">You need administrator privileges to view this page.</p>
          <p className="text-xs text-stone-400 mt-4 font-medium">Redirecting to student dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Bar */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-orange-500/10 border border-orange-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600">
              Admin Delivery & Operations ⚡
            </h1>
            <p className="text-sm text-stone-600 mt-1 font-bold">Campus Dorm Printlet Network</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/privacy"
              className="px-4 py-2 text-sm font-bold text-stone-700 hover:text-stone-900 transition-colors"
            >
              Terms & Privacy
            </Link>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-sm font-bold text-stone-800 bg-orange-100 rounded-xl hover:bg-orange-200 transition-colors border border-orange-200"
            >
              Student Dashboard
            </button>
            <button
              onClick={() => {
                supabase.auth.signOut();
                router.replace('/auth');
              }}
              className="px-4 py-2 text-sm font-bold text-red-700 bg-red-100 rounded-xl hover:bg-red-200 transition-colors border border-red-200"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Site Status / Service Outage Control Panel */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-orange-500/10 border border-orange-200 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
                <span>⚙️ Service Status & Outage Control</span>
                <span className={`px-3 py-1 rounded-full text-xs font-black ${
                  siteIsClosed
                    ? 'bg-amber-200 text-amber-950 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {siteIsClosed ? '🔴 CLOSED (Outage Mode)' : '🟢 OPEN (Normal Service)'}
                </span>
              </h2>
              <p className="text-xs text-stone-600 font-bold mt-1">
                Toggle site closed status during power/printer outages. Users can still upload & pay, but delivery promise will be paused.
              </p>
            </div>

            <div className="flex gap-3">
              {siteIsClosed ? (
                <button
                  onClick={() => handleToggleSiteStatus(false)}
                  disabled={statusUpdating}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl transition-all shadow-md"
                >
                  {statusUpdating ? 'Updating...' : '🟢 Re-Open Service (Normal Mode)'}
                </button>
              ) : (
                <button
                  onClick={() => handleToggleSiteStatus(true)}
                  disabled={statusUpdating}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-sm rounded-xl transition-all shadow-md"
                >
                  {statusUpdating ? 'Updating...' : '🔴 Mark Site as Closed (Outage Mode)'}
                </button>
              )}
            </div>
          </div>

          {statusSuccessMsg && (
            <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200">
              {statusSuccessMsg}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-extrabold text-stone-700 uppercase tracking-wider">
              Outage Notice Message displayed to Students:
            </label>
            <textarea
              value={siteMessage}
              onChange={(e) => setSiteMessage(e.target.value)}
              rows={2}
              className="w-full p-3 bg-stone-50 border border-orange-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Financial & Operational Analytics Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-orange-200 shadow-md">
              <p className="text-xs text-stone-500 font-bold uppercase tracking-wider">Gross Revenue</p>
              <p className="text-2xl font-black text-stone-900 mt-1">₹{stats.grossRevenue}</p>
              <p className="text-xs text-stone-500 mt-1 font-medium">All Paid Orders</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-md">
              <p className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Net Profit 📈</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">₹{stats.netProfit}</p>
              <p className="text-xs text-emerald-800 mt-1 font-medium">After Fees & Paper Cost</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-orange-200 shadow-md">
              <p className="text-xs text-stone-500 font-bold uppercase tracking-wider">Total Pages</p>
              <p className="text-2xl font-black text-orange-600 mt-1">{stats.totalPages}</p>
              <p className="text-xs text-stone-500 mt-1 font-medium">Paper Cost: ₹{stats.printCost}</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-orange-200 shadow-md">
              <p className="text-xs text-stone-500 font-bold uppercase tracking-wider">Queue to Deliver</p>
              <p className="text-2xl font-black text-rose-600 mt-1">{stats.pendingDeliveriesCount}</p>
              <p className="text-xs text-stone-500 mt-1 font-medium">{stats.readyDeliveriesCount} Printed & Ready</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 shadow-md">
              <p className="text-xs text-purple-700 font-bold uppercase tracking-wider">Completed (10d) ✅</p>
              <p className="text-2xl font-black text-purple-600 mt-1">{stats.deliveredCount || deliveredOrders.length}</p>
              <p className="text-xs text-purple-800 mt-1 font-medium">Delivered Orders</p>
            </div>
          </div>
        )}

        {/* Direct Admin Free Print Panel */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-orange-500/10 border border-orange-200 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
                <span>⚡ Admin Free Print Panel</span>
              </h2>
              <p className="text-xs text-stone-600 font-bold mt-0.5">Upload any document to print instantly on dorm printer without payment</p>
            </div>
          </div>

          {adminErr && (
            <div className="p-3 bg-red-100 text-red-800 rounded-xl text-xs font-bold border border-red-200">
              {adminErr}
            </div>
          )}

          {adminMsg && (
            <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200">
              {adminMsg}
            </div>
          )}

          <div
            onDragEnter={handleAdminDrag}
            onDragLeave={handleAdminDrag}
            onDragOver={handleAdminDrag}
            onDrop={handleAdminDrop}
            className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all cursor-pointer ${
              dragActive ? 'border-orange-500 bg-orange-100/70 scale-101' : 'border-orange-300 bg-amber-50/40 hover:border-orange-400'
            }`}
          >
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              onChange={handleAdminFileSelect}
              className="hidden"
              id="admin-file-input"
            />
            <label htmlFor="admin-file-input" className="cursor-pointer block">
              <p className="font-bold text-stone-900">Click or Drag Admin Files to Print Immediately</p>
              <p className="text-xs text-stone-500 mt-1 font-medium">PDF, DOCX, PNG, JPG (Multi-file supported)</p>
            </label>
          </div>

          {adminFiles.length > 0 && (
            <div className="flex justify-between items-center bg-amber-50 p-3 rounded-xl text-sm border border-amber-200">
              <span className="font-semibold">{adminFiles.length} file(s) selected: {adminFiles.map(f => f.name).join(', ')}</span>
              <button onClick={() => setAdminFiles([])} className="text-red-500 font-bold text-xs">Clear</button>
            </div>
          )}

          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={adminStaple}
                onChange={e => setAdminStaple(e.target.checked)}
                className="w-4 h-4 text-orange-500 rounded accent-orange-500"
              />
              Staple Document
            </label>

            <button
              onClick={handleAdminUpload}
              disabled={adminUploading || adminFiles.length === 0}
              className="px-6 py-2.5 font-black text-sm text-white bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 rounded-xl shadow-md hover:scale-105 transition-all disabled:opacity-50"
            >
              {adminUploading ? 'Sending to Queue...' : 'Print Free (Send to Queue) ✨'}
            </button>
          </div>
        </div>

        {/* Section 1: Active Campus Delivery Queue Table */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-orange-500/10 border border-orange-200 overflow-hidden">
          <div className="p-6">
            <h2 className="text-2xl font-black text-stone-900 mb-6 flex items-center gap-2">
              <span>🚚 Active Campus Delivery Queue</span>
              <span className="text-sm font-bold px-3 py-1 bg-orange-100 text-orange-800 rounded-full">
                {orders.length} Pending
              </span>
            </h2>

            {orders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-stone-600 text-lg font-bold">All active orders have been delivered! 🎉</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-orange-200">
                      <th className="text-left py-3 px-4 text-sm font-bold text-stone-700">Customer</th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-stone-700">Document(s)</th>
                      <th className="text-center py-3 px-4 text-sm font-bold text-stone-700">Pages</th>
                      <th className="text-right py-3 px-4 text-sm font-bold text-stone-700">Amount Paid</th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-stone-700">Pickup Time</th>
                      <th className="text-center py-3 px-4 text-sm font-bold text-stone-700">Status</th>
                      <th className="text-right py-3 px-4 text-sm font-bold text-stone-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-orange-100 hover:bg-amber-50/60 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-bold text-stone-900">
                              {order.profiles?.full_name || 'Guest / Pre-Auth Order'}
                            </p>
                            <p className="text-sm text-orange-600 font-mono font-bold">
                              {order.profiles?.phone_number || 'No phone recorded'}
                            </p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-sm font-bold text-stone-900">
                            {order.file_name || 'Document'}
                          </p>
                          <p className="text-xs text-stone-500 font-mono">ID: {order.id.slice(0, 8)}</p>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="font-bold text-stone-900">
                            {order.page_count}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="font-black text-emerald-600">
                            ₹{(order.total_amount / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-sm font-bold text-stone-900">
                            {new Date(order.pickup_time).toLocaleDateString('en-IN', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                          <p className="text-xs text-stone-500 font-bold">12:30 PM</p>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={`px-3.5 py-1 rounded-full text-xs font-black ${
                            order.status === 'PRINTED'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-orange-100 text-orange-800 border border-orange-200'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-end gap-2">
                            {order.profiles?.phone_number && (
                              <a
                                href={getWhatsAppLink(
                                  order.profiles.phone_number,
                                  order.profiles.full_name,
                                  order.pickup_time
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1 shadow-sm"
                              >
                                WhatsApp
                              </a>
                            )}
                            <button
                              onClick={() => markAsDelivered(order.id)}
                              className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
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
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-orange-500/10 border border-orange-200 overflow-hidden">
          <div className="p-6">
            <h2 className="text-2xl font-black text-stone-900 mb-6 flex items-center gap-2">
              <span>✅ Delivered Orders History (Last 10 Days)</span>
              <span className="text-sm font-bold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full">
                {deliveredOrders.length} Completed
              </span>
            </h2>

            {deliveredOrders.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-stone-500 text-sm font-bold">No orders marked as delivered in the last 10 days.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-orange-200">
                      <th className="text-left py-3 px-4 text-sm font-bold text-stone-700">Customer</th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-stone-700">Document(s)</th>
                      <th className="text-center py-3 px-4 text-sm font-bold text-stone-700">Pages</th>
                      <th className="text-right py-3 px-4 text-sm font-bold text-stone-700">Amount Paid</th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-stone-700">Delivered On</th>
                      <th className="text-center py-3 px-4 text-sm font-bold text-stone-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveredOrders.map((order) => (
                      <tr key={order.id} className="border-b border-stone-100 hover:bg-emerald-50/40 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-bold text-stone-900">
                              {order.profiles?.full_name || 'Student Order'}
                            </p>
                            <p className="text-sm text-stone-500 font-mono">
                              {order.profiles?.phone_number || 'No phone recorded'}
                            </p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-sm font-bold text-stone-900">
                            {order.file_name || 'Document'}
                          </p>
                          <p className="text-xs text-stone-400 font-mono">ID: {order.id.slice(0, 8)}</p>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="font-bold text-stone-800">
                            {order.page_count}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="font-black text-emerald-600">
                            ₹{(order.total_amount / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-sm font-bold text-stone-800">
                            {new Date(order.updated_at || order.created_at).toLocaleDateString('en-IN', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="px-3.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
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
