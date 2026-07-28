import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
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

    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Fetch order to get file_url
    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Update order status to PRINTED (resilient to schema versions)
    let { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'PRINTED',
        status: 'PRINTED'
      })
      .eq('id', orderId);

    if (updateError && (updateError.code === 'PGRST204' || updateError.message?.includes('status') || updateError.message?.includes('column'))) {
      const fallbackResult = await supabaseAdmin
        .from('orders')
        .update({
          payment_status: 'PRINTED'
        })
        .eq('id', orderId);
      updateError = fallbackResult.error;
    }

    if (updateError) {
      console.error('Failed to update order status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      );
    }

    // Delete all files in multi-file job from Supabase Storage to free up space
    const fileKeys = (order.file_url || '').split(',').map((s: string) => s.trim()).filter(Boolean);

    if (fileKeys.length > 0) {
      const { error: deleteError } = await supabaseAdmin.storage
        .from('print-jobs')
        .remove(fileKeys);

      if (deleteError) {
        console.error('Failed to delete files from storage:', deleteError);
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      message: 'Order marked as printed and files cleaned up'
    });

  } catch (error) {
    console.error('Complete order error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
