import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

if (!process.env.RAZORPAY_KEY_SECRET) {
  throw new Error('Missing RAZORPAY_KEY_SECRET');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_id
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'Missing payment verification data' },
        { status: 400 }
      );
    }

    // Verify Razorpay signature
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      console.error('Payment verification failed: Invalid signature');
      return NextResponse.json(
        { error: 'Payment verification failed' },
        { status: 400 }
      );
    }

    // Find order by razorpay_order_id
    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .single();

    if (fetchError || !order) {
      console.error('Order not found:', fetchError);
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Update order status to PAID (resilient to schema version)
    let { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'PAID',
        status: 'PAID',
        razorpay_payment_id,
        razorpay_signature
      })
      .eq('id', order.id)
      .select()
      .single();

    if (updateError && (updateError.code === 'PGRST204' || updateError.message?.includes('status') || updateError.message?.includes('column'))) {
      const fallbackResult = await supabaseAdmin
        .from('orders')
        .update({
          payment_status: 'PAID',
          razorpay_payment_id,
          razorpay_signature
        })
        .eq('id', order.id)
        .select()
        .single();

      updatedOrder = fallbackResult.data;
      updateError = fallbackResult.error;
    }

    if (updateError || !updatedOrder) {
      console.error('Failed to update order status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update order' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: updatedOrder.id,
      message: 'Payment verified successfully'
    });

  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: 'Payment verification failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
