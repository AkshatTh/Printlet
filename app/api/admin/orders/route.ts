import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

    // 3. Fetch ALL orders to compute accurate metrics and separate queues
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

    // Financial Metrics Calculation across ALL paid/delivered orders
    const totalPaise = completedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const grossRevenueRupees = totalPaise / 100;
    const totalPagesPrinted = completedOrders.reduce((sum, o) => sum + (o.page_count || 0), 0);
    const razorpayFeeRupees = grossRevenueRupees * 0.02; // 2% Razorpay fee
    const paperPrintingCostRupees = totalPagesPrinted * 1.00; // ₹1 per page print cost
    const netProfitRupees = Math.max(0, grossRevenueRupees - (razorpayFeeRupees + paperPrintingCostRupees));

    // 4. Fetch profiles for user_ids across active & delivered orders
    const allUserIds = Array.from(new Set([
      ...activeDeliveryOrders.map(o => o.user_id),
      ...deliveredLast10DaysOrders.map(o => o.user_id)
    ].filter(Boolean)));

    let profilesMap: Record<string, { full_name: string; phone_number: string }> = {};

    if (allUserIds.length > 0) {
      const { data: profilesData } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, phone_number')
        .in('id', allUserIds);

      if (profilesData) {
        profilesData.forEach(p => {
          profilesMap[p.id] = {
            full_name: p.full_name,
            phone_number: p.phone_number,
          };
        });
      }
    }

    // Helper to format order with profile details
    const formatOrder = (order: any) => {
      const profile = order.user_id ? profilesMap[order.user_id] : null;
      return {
        id: order.id,
        file_name: order.file_name || order.file_url,
        page_count: order.page_count,
        total_amount: order.total_amount, // Amount in paise
        amount_rupees: (order.total_amount / 100).toFixed(2), // Formatted in Rupees
        status: order.status || order.payment_status || 'PAID',
        pickup_time: order.pickup_time || order.created_at,
        created_at: order.created_at,
        updated_at: order.updated_at || order.created_at,
        requires_staple: order.requires_staple,
        user_id: order.user_id,
        profiles: profile ? {
          full_name: profile.full_name,
          phone_number: profile.phone_number
        } : null
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
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
