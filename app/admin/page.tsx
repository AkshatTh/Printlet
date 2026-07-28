'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
}

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<FinancialStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

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
  }, []);

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
    const { error } = await supabase
      .from('orders')
      .update({ status: 'DELIVERED' })
      .eq('id', orderId);

    if (!error) {
      // Remove from active delivery queue
      setOrders(orders.filter(o => o.id !== orderId));
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

  const getWhatsAppLink = (phoneNumber: string, name: string, pickupTime: string) => {
    const message = `Hi ${name}, your printout is ready for pickup ${getPickupMessage(new Date(pickupTime))}!`;
    return `https://wa.me/${phoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 px-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border border-rose-200">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            🚫
          </div>
          <h2 className="text-2xl font-black text-stone-900 mb-2">Access Denied (403)</h2>
          <p className="text-stone-600 mb-6 text-sm font-bold">
            You do not have admin permissions to access this page. Redirecting to your student dashboard...
          </p>
          <button
            onClick={() => router.replace('/dashboard')}
            className="px-6 py-3 text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-rose-500 rounded-xl hover:scale-105 transition-all shadow-md"
          >
            Go to Student Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100/90 via-orange-50 to-rose-100/80 text-stone-900 font-sans">
      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-orange-500/10 p-6 border border-orange-200 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600">
              Admin Control Center ⚡
            </h1>
            <p className="text-sm text-stone-600 mt-1 font-bold">
              Campus delivery queue, direct free printing, and net profit analytics
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-5 py-2.5 bg-orange-100 text-stone-800 rounded-xl hover:bg-orange-200 transition-all font-bold text-sm border border-orange-200"
          >
            Student Dashboard
          </button>
        </div>

        {/* Financial & Operations Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-orange-200">
            <p className="text-sm font-extrabold text-stone-500">Pending Deliveries</p>
            <p className="text-3xl font-black text-orange-600 mt-2">{orders.length}</p>
            <p className="text-xs text-stone-400 mt-1 font-bold">Active paid orders</p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-orange-200">
            <p className="text-sm font-extrabold text-stone-500">Gross Revenue (All Time)</p>
            <p className="text-3xl font-black text-stone-900 mt-2">₹{stats?.grossRevenue || '0.00'}</p>
            <p className="text-xs text-stone-400 mt-1 font-bold">{stats?.totalPages || 0} total pages printed</p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-orange-200">
            <p className="text-sm font-extrabold text-stone-500">Razorpay Fee & Print Cost</p>
            <p className="text-2xl font-black text-rose-500 mt-2">
              -₹{((parseFloat(stats?.razorpayFee || '0') + parseFloat(stats?.printCost || '0'))).toFixed(2)}
            </p>
            <p className="text-xs text-stone-400 mt-1 font-bold">2% Gateway + ₹1/pg paper</p>
          </div>

          {/* NET PROFIT CARD */}
          <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-emerald-300">
            <p className="text-sm font-extrabold text-emerald-900">🎉 Net Profit</p>
            <p className="text-3xl font-black text-emerald-700 mt-2">₹{stats?.netProfit || '0.00'}</p>
            <p className="text-xs text-emerald-800 mt-1 font-black">Clear earnings after expenses</p>
          </div>
        </div>

        {/* ADMIN DIRECT FREE PRINTING WIDGET */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 lg:p-8 shadow-xl shadow-orange-500/10 border border-orange-200 space-y-4">
          <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
            <span>🖨️ Direct Free Admin Printing (Bypass Payment)</span>
          </h2>
          <p className="text-sm text-stone-600 font-bold">
            Upload any documents directly to send them straight to your local dorm printer queue without paying.
          </p>

          {adminErr && <div className="p-3 bg-red-100 text-red-700 rounded-xl text-sm font-bold">{adminErr}</div>}
          {adminMsg && <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-bold">{adminMsg}</div>}

          <div
            onDragEnter={handleAdminDrag}
            onDragLeave={handleAdminDrag}
            onDragOver={handleAdminDrag}
            onDrop={handleAdminDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer ${
              dragActive ? 'border-orange-500 bg-orange-100/70' : 'border-orange-300 hover:border-orange-400 bg-amber-50/60'
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
            <label htmlFor="admin-file-input" className="cursor-pointer">
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

        {/* Orders Delivery Queue Table */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-orange-500/10 border border-orange-200 overflow-hidden">
          <div className="p-6">
            <h2 className="text-2xl font-black text-stone-900 mb-6">Active Campus Delivery Queue</h2>

            {orders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-stone-600 text-lg font-bold">All paid orders have been delivered! 🎉</p>
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
      </div>
    </div>
  );
}
