import { supabaseAdmin } from '@/lib/supabase';

export interface SiteStatus {
  isClosed: boolean;
  message: string;
  mode: 'BATCH_7PM' | 'NORMAL_247';
}

let globalMemoryStatus: SiteStatus = {
  isClosed: false,
  message: 'Printing service is temporarily paused due to maintenance or power outage. Your order can still be uploaded and paid for, but next-day delivery timeline will resume as soon as service reopens.',
  mode: 'BATCH_7PM'
};

export async function getSiteStatusFromDB(): Promise<SiteStatus> {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('key', 'site_status')
      .single();

    if (!error && data && data.value) {
      globalMemoryStatus = {
        isClosed: Boolean(data.value.is_closed),
        message: data.value.message || globalMemoryStatus.message,
        mode: data.value.mode === 'NORMAL_247' ? 'NORMAL_247' : 'BATCH_7PM'
      };
    }
  } catch (e) {
    // DB table might not exist yet, fallback to memory
  }
  return globalMemoryStatus;
}

export async function setSiteStatusInDB(
  isClosed: boolean,
  message?: string,
  mode?: 'BATCH_7PM' | 'NORMAL_247'
): Promise<{ success: boolean; isClosed: boolean; message: string; mode: 'BATCH_7PM' | 'NORMAL_247'; dbUpdated: boolean }> {
  const statusValue = {
    is_closed: Boolean(isClosed),
    message: message || globalMemoryStatus.message,
    mode: mode || globalMemoryStatus.mode
  };

  // Update in-memory state
  globalMemoryStatus = {
    isClosed: Boolean(isClosed),
    message: statusValue.message,
    mode: statusValue.mode
  };

  let dbUpdated = false;

  try {
    const { error: dbError } = await supabaseAdmin
      .from('site_settings')
      .upsert({
        key: 'site_status',
        value: statusValue,
        updated_at: new Date().toISOString()
      });

    if (!dbError) {
      dbUpdated = true;
    } else {
      console.warn('site_settings table upsert warning:', dbError.message);
    }
  } catch (e) {
    console.warn('site_settings table upsert catch:', e);
  }

  return {
    success: true,
    isClosed: globalMemoryStatus.isClosed,
    message: globalMemoryStatus.message,
    mode: globalMemoryStatus.mode,
    dbUpdated
  };
}
