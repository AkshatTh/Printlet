import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { PDFDocument } from 'pdf-lib';
import { getPricePerPage } from '@/lib/pricing';
import { calculatePickupTime } from '@/lib/pickup-time';

const STAPLE_COST = 1; // ₹1 for staple

async function countPDFPages(buffer: ArrayBuffer): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return Math.max(1, pdfDoc.getPageCount());
  } catch (e) {
    console.warn('PDF page count warning, defaulting to 1 page:', e);
    return 1;
  }
}

async function countImagePages(): Promise<number> {
  return 1;
}

async function countDocxPages(buffer: ArrayBuffer): Promise<number> {
  try {
    const sizeInKB = buffer.byteLength / 1024;
    return Math.max(1, Math.ceil(sizeInKB / 50));
  } catch (e) {
    return 1;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Enforce mandatory authentication header
    let userId: string | null = null;
    let userEmail: string = '';
    let userPhone: string = '';

    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (user && !authErr) {
        userId = user.id;
        userEmail = user.email || '';
        userPhone = user.phone || '';
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Session expired or invalid. Please sign out and sign in again.' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    let files = formData.getAll('files') as File[];
    if (files.length === 0) {
      const singleFile = formData.get('file') as File;
      if (singleFile) files = [singleFile];
    }

    const requiresStaple = formData.get('requiresStaple') === 'true';

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg'
    ];

    const maxSize = 50 * 1024 * 1024; // 50MB per file

    let totalPageCount = 0;
    const uploadedUniqueFiles: string[] = [];
    const originalFileNames: string[] = [];

    // Process each uploaded file
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();

      let pageCount = 1;
      const lowerName = file.name.toLowerCase();

      if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
        pageCount = await countPDFPages(arrayBuffer);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx')) {
        pageCount = await countDocxPages(arrayBuffer);
      } else {
        pageCount = await countImagePages();
      }

      totalPageCount += pageCount;

      // Upload file to Supabase Storage using admin service-role client
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const fileExtension = file.name.split('.').pop() || 'bin';
      const uniqueFilename = `${timestamp}-${randomSuffix}.${fileExtension}`;

      // Primary bucket: print-jobs
      let { error: uploadError } = await supabaseAdmin.storage
        .from('print-jobs')
        .upload(uniqueFilename, arrayBuffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: true
        });

      // Fallback bucket: print-files if print-jobs bucket does not exist
      if (uploadError) {
        console.warn(`Upload to print-jobs failed (${uploadError.message}), trying print-files...`);
        const fallbackUpload = await supabaseAdmin.storage
          .from('print-files')
          .upload(uniqueFilename, arrayBuffer, {
            contentType: file.type || 'application/octet-stream',
            upsert: true
          });
        uploadError = fallbackUpload.error;
      }

      if (uploadError) {
        console.error('Upload error for file', file.name, uploadError);
        if (uploadedUniqueFiles.length > 0) {
          await supabaseAdmin.storage.from('print-jobs').remove(uploadedUniqueFiles);
          await supabaseAdmin.storage.from('print-files').remove(uploadedUniqueFiles);
        }
        return NextResponse.json(
          { error: `Storage Upload Failed for ${file.name}`, details: uploadError.message },
          { status: 500 }
        );
      }

      uploadedUniqueFiles.push(uniqueFilename);
      originalFileNames.push(file.name);
    }

    // 2. Ensure profile record exists in `profiles` table to satisfy orders_user_id_fkey
    try {
      await supabaseAdmin.from('profiles').upsert({
        id: userId,
        email: userEmail,
        full_name: userEmail ? userEmail.split('@')[0] : 'Student User',
        phone_number: userPhone,
        role: 'STUDENT',
      });
    } catch (profErr) {
      console.warn('Profile upsert warning:', profErr);
    }

    // Calculate total amount (in paise)
    const pricePerPage = getPricePerPage(totalPageCount);
    const baseAmount = totalPageCount * pricePerPage * 100;
    const stapleAmount = requiresStaple ? STAPLE_COST * 100 : 0;
    const totalAmount = baseAmount + stapleAmount;

    const fileUrlJoined = uploadedUniqueFiles.join(',');
    const fileNameJoined = originalFileNames.join(', ');
    const pickupTime = calculatePickupTime();

    // 3. Insert order with fallback handling if foreign key constraint is triggered
    const fullPayload: Record<string, any> = {
      file_url: fileUrlJoined,
      file_name: fileNameJoined,
      page_count: totalPageCount,
      requires_staple: requiresStaple,
      total_amount: totalAmount,
      status: 'PENDING',
      payment_status: 'PENDING',
      pickup_time: pickupTime.toISOString(),
      user_id: userId
    };

    let { data: order, error: dbError } = await supabaseAdmin
      .from('orders')
      .insert(fullPayload)
      .select()
      .single();

    // Fallback 1: If database migration has not added file_name column
    if (dbError && (dbError.code === 'PGRST204' || dbError.message?.includes('file_name') || dbError.message?.includes('column'))) {
      console.warn('Full schema insert failed, falling back to base schema:', dbError.message);
      const legacyResult = await supabaseAdmin
        .from('orders')
        .insert({
          file_url: fileUrlJoined,
          page_count: totalPageCount,
          requires_staple: requiresStaple,
          total_amount: totalAmount,
          payment_status: 'PENDING',
          user_id: userId
        })
        .select()
        .single();

      order = legacyResult.data;
      dbError = legacyResult.error;
    }

    // Fallback 2: Handle foreign key constraint error specifically
    if (dbError && (dbError.code === '23503' || dbError.message?.includes('orders_user_id_fkey') || dbError.message?.includes('foreign key'))) {
      console.warn('Foreign key constraint failed on user_id, trying insert without user_id:', dbError.message);
      const noUserPayload = { ...fullPayload };
      delete noUserPayload.user_id;

      const fallbackNoUser = await supabaseAdmin
        .from('orders')
        .insert(noUserPayload)
        .select()
        .single();

      if (!fallbackNoUser.error && fallbackNoUser.data) {
        order = fallbackNoUser.data;
        dbError = null;
      } else {
        return NextResponse.json(
          { error: 'Session expired or user profile not registered. Please sign out and sign in again.' },
          { status: 401 }
        );
      }
    }

    if (dbError || !order) {
      console.error('Database error creating order:', dbError);
      if (uploadedUniqueFiles.length > 0) {
        await supabaseAdmin.storage.from('print-jobs').remove(uploadedUniqueFiles);
        await supabaseAdmin.storage.from('print-files').remove(uploadedUniqueFiles);
      }
      return NextResponse.json(
        { error: 'Failed to create order in database', details: dbError?.message || 'Database insert failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orderId: order.id,
      pageCount: totalPageCount,
      fileCount: files.length,
      fileNames: fileNameJoined,
      requiresStaple,
      pricePerPage,
      totalAmount: totalAmount / 100,
      totalAmountPaise: totalAmount,
      breakdown: {
        fileCount: files.length,
        pages: totalPageCount,
        pricePerPage: pricePerPage,
        staple: requiresStaple ? STAPLE_COST : 0,
        subtotal: (baseAmount / 100),
        total: (totalAmount / 100)
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error during upload', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
