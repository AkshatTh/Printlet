import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Fallback in-memory status if database table doesn't exist yet
let memoryStatus = {
  isClosed: false,
  message: 'Printing service is temporarily paused due to maintenance or power outage. Your order can still be uploaded and paid for, but next-day delivery timeline will resume as soon as service reopens.'
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('key', 'site_status')
      .single();

    if (!error && data && data.value) {
      return NextResponse.json({
        isClosed: Boolean(data.value.is_closed),
        message: data.value.message || memoryStatus.message
      });
    }

    return NextResponse.json(memoryStatus);
  } catch (err) {
    return NextResponse.json(memoryStatus);
  }
}
