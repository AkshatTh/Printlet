import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
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

    // Check Admin privileges
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

    const { isClosed, message } = await request.json();

    const statusValue = {
      is_closed: Boolean(isClosed),
      message: message || 'Printing service is temporarily paused due to maintenance or power outage. Your order can still be uploaded and paid for, but next-day delivery timeline will resume as soon as service reopens.'
    };

    // Upsert into site_settings table
    const { error: dbError } = await supabaseAdmin
      .from('site_settings')
      .upsert({
        key: 'site_status',
        value: statusValue,
        updated_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('Failed to update site_status in DB:', dbError);
      return NextResponse.json(
        { error: 'Failed to update site status in database', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      isClosed: Boolean(isClosed),
      message: statusValue.message
    });

  } catch (error) {
    console.error('Admin site status update error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
