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

    // Fetch all PAID orders (resilient to schema status fallback)
    const { data: ordersData, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    const allOrders = ordersData || [];
    const pendingOrders = allOrders.filter(
      o => o.status === 'PAID' || o.payment_status === 'PAID'
    );

    // Generate signed URLs for each file path (handles single and multi-file jobs)
    const ordersWithUrls = await Promise.all(
      pendingOrders.map(async (order) => {
        const rawPaths = (order.file_url || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        
        const signedUrls: string[] = [];
        for (const path of rawPaths) {
          const { data: signedUrlData, error: signError } = await supabaseAdmin.storage
            .from('print-jobs')
            .createSignedUrl(path, 3600); // 1 hour expiry

          if (signedUrlData?.signedUrl) {
            signedUrls.push(signedUrlData.signedUrl);
          } else {
            console.error('Failed to create signed URL for path:', path, signError);
          }
        }

        return {
          id: order.id,
          file_url: signedUrls.join(','),
          filename: order.file_name || order.file_url,
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
