import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { PDFDocument } from 'pdf-lib';

async function recalculatePdfPageCount(filePath: string): Promise<number | null> {
  try {
    let cleanPath = filePath.split(',')[0].trim();
    if (cleanPath.includes('/print-jobs/')) cleanPath = cleanPath.split('/print-jobs/').pop() || cleanPath;
    if (cleanPath.includes('/print-files/')) cleanPath = cleanPath.split('/print-files/').pop() || cleanPath;
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) cleanPath = cleanPath.split('/').pop() || cleanPath;

    let { data: fileBlob } = await supabaseAdmin.storage.from('print-jobs').download(cleanPath);
    if (!fileBlob) {
      const fallback = await supabaseAdmin.storage.from('print-files').download(cleanPath);
      fileBlob = fallback.data;
    }

    if (!fileBlob) return null;

    const buffer = await fileBlob.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    try {
      const pdfDoc = await PDFDocument.load(uint8, { ignoreEncryption: true });
      const count = pdfDoc.getPageCount();
      if (count > 0) return count;
    } catch {
      const text = new TextDecoder('latin1').decode(uint8);
      const matches = text.match(/\/Type\s*\/Page\b/g);
      if (matches && matches.length > 0) return matches.length;
    }
  } catch (e) {
    console.warn('Page recount error for', filePath, e);
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    // 1. Verify Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized. Missing token.' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid token.' },
        { status: 401 }
      );
    }

    // 2. Check if user is an ADMIN using service role client
    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !adminProfile || adminProfile.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden. Admin privileges required.' },
        { status: 403 }
      );
    }

    // 3. Fetch ALL orders
    const { data: ordersData, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching orders for admin:', ordersError);
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    let allOrders = ordersData || [];

    // Recalculate page counts dynamically if legacy order recorded page_count: 1 for a PDF
    for (const o of allOrders) {
      const fileNameStr = (o.file_name || o.file_url || '').toLowerCase();
      if ((o.page_count === 1 || !o.page_count) && (fileNameStr.includes('.pdf') || fileNameStr.includes('coursera') || fileNameStr.includes('akshat'))) {
        const actualPages = await recalculatePdfPageCount(o.file_url || o.file_name);
        if (actualPages && actualPages > o.page_count) {
          o.page_count = actualPages;
          // Asynchronously update database record so recount persists
          supabaseAdmin.from('orders').update({ page_count: actualPages }).eq('id', o.id).then(() => {});
        }
      }
    }

    // Filter revenue-generating orders (PAID, PRINTED, DELIVERED)
    const completedOrders = allOrders.filter(
      order => order.status === 'PAID' || order.status === 'PRINTED' || order.status === 'DELIVERED' ||
               order.payment_status === 'PAID' || order.payment_status === 'PRINTED' || order.payment_status === 'DELIVERED'
    );

    // Active delivery queue (PAID or PRINTED, excluding DELIVERED)
    const activeDeliveryOrders = allOrders.filter(
      order => order.status === 'PAID' || order.status === 'PRINTED' ||
               ((!order.status || order.status === 'PENDING') && (order.payment_status === 'PAID' || order.payment_status === 'PRINTED'))
    );

    // Delivered orders from the last 10 days
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const deliveredLast10DaysOrders = allOrders.filter(order => {
      if (order.status !== 'DELIVERED') return false;
      const orderDate = new Date(order.updated_at || order.created_at);
      return orderDate >= tenDaysAgo;
    });

    // Financial Metrics Calculation
    const totalPaise = completedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const grossRevenueRupees = totalPaise / 100;
    const totalPagesPrinted = completedOrders.reduce((sum, o) => sum + (o.page_count || 0), 0);
    const razorpayFeeRupees = grossRevenueRupees * 0.02;
    const paperPrintingCostRupees = totalPagesPrinted * 1.00;
    const netProfitRupees = Math.max(0, grossRevenueRupees - (razorpayFeeRupees + paperPrintingCostRupees));

    // 4. Resolve Customer Names & Phone Numbers
    const allUserIds = Array.from(new Set([
      ...activeDeliveryOrders.map(o => o.user_id),
      ...deliveredLast10DaysOrders.map(o => o.user_id)
    ].filter(Boolean)));

    let profilesMap: Record<string, { full_name: string; phone_number: string }> = {};

    if (allUserIds.length > 0) {
      // Step A: Read profiles table
      const { data: profilesData } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, phone_number, email')
        .in('id', allUserIds);

      if (profilesData) {
        profilesData.forEach(p => {
          profilesMap[p.id] = {
            full_name: p.full_name?.trim() || '',
            phone_number: p.phone_number?.trim() || '',
          };
        });
      }

      // Step B: Fallback to Supabase Auth admin user list for any missing names/phones
      try {
        const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
        if (authUsers && authUsers.users) {
          authUsers.users.forEach(u => {
            const meta = u.user_metadata || {};
            const existing = profilesMap[u.id] || { full_name: '', phone_number: '' };
            
            const resolvedName = (existing.full_name && existing.full_name !== 'Student User')
              ? existing.full_name
              : (meta.full_name || meta.name || (u.email ? u.email.split('@')[0] : 'Student User'));

            const resolvedPhone = (existing.phone_number && existing.phone_number !== 'No Phone' && existing.phone_number.trim() !== '')
              ? existing.phone_number
              : (meta.phone_number || meta.phone || u.phone || u.email || 'No Phone');

            profilesMap[u.id] = {
              full_name: resolvedName,
              phone_number: resolvedPhone
            };
          });
        }
      } catch (authErr) {
        console.warn('Auth admin listUsers fallback warning:', authErr);
      }
    }

    // Helper to format order with profile details
    const formatOrder = (order: any) => {
      const profile = order.user_id ? profilesMap[order.user_id] : null;
      return {
        id: order.id,
        file_name: order.file_name || order.file_url,
        page_count: order.page_count || 1,
        total_amount: order.total_amount,
        amount_rupees: ((order.total_amount || 0) / 100).toFixed(2),
        status: order.status || order.payment_status || 'PAID',
        pickup_time: order.pickup_time || order.created_at,
        created_at: order.created_at,
        updated_at: order.updated_at || order.created_at,
        requires_staple: order.requires_staple,
        user_id: order.user_id,
        profiles: profile ? {
          full_name: profile.full_name || 'Student User',
          phone_number: profile.phone_number || 'No Phone'
        } : {
          full_name: 'Student User',
          phone_number: 'No Phone'
        }
      };
    };

    const formattedActive = activeDeliveryOrders.map(formatOrder);
    const formattedDelivered = deliveredLast10DaysOrders.map(formatOrder);

    return NextResponse.json({
      success: true,
      count: formattedActive.length,
      orders: formattedActive,
      deliveredOrders: formattedDelivered,
      stats: {
        grossRevenue: grossRevenueRupees.toFixed(2),
        totalPages: totalPagesPrinted,
        razorpayFee: razorpayFeeRupees.toFixed(2),
        printCost: paperPrintingCostRupees.toFixed(2),
        netProfit: netProfitRupees.toFixed(2),
        pendingDeliveriesCount: formattedActive.length,
        readyDeliveriesCount: formattedActive.filter(o => o.status === 'PRINTED').length,
        deliveredCount: formattedDelivered.length
      }
    });

  } catch (error) {
    console.error('Admin orders API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
