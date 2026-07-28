import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    // Verify daemon secret key
    const authHeader = request.headers.get('authorization');
    const daemonSecret = process.env.DAEMON_SECRET_KEY;

    if (!daemonSecret) {
      console.error('DAEMON_SECRET_KEY not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${daemonSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch all PAID orders
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('payment_status', 'PAID')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    // Generate signed URLs for each file
    const ordersWithUrls = await Promise.all(
      orders.map(async (order) => {
        const { data: signedUrlData } = await supabaseAdmin.storage
          .from('print-jobs')
          .createSignedUrl(order.file_url, 3600); // 1 hour expiry

        return {
          id: order.id,
          file_url: signedUrlData?.signedUrl || null,
          filename: order.file_url,
          page_count: order.page_count,
          requires_staple: order.requires_staple,
          total_amount: order.total_amount,
          created_at: order.created_at
        };
      })
    );

    return NextResponse.json({
      count: ordersWithUrls.length,
      orders: ordersWithUrls
    });

  } catch (error) {
    console.error('Pending orders error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
