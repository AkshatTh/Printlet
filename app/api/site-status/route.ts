import { NextResponse } from 'next/server';
import { getSiteStatusFromDB } from '@/lib/site-status-state';

export async function GET() {
  const status = await getSiteStatusFromDB();
  return NextResponse.json(status);
}
