import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { PDFDocument } from 'pdf-lib';
import { calculatePickupTime } from '@/lib/pickup-time';

async function countPDFPages(buffer: ArrayBuffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(buffer);
  return pdfDoc.getPageCount();
}

async function countImagePages(): Promise<number> {
  return 1;
}

async function countDocxPages(buffer: ArrayBuffer): Promise<number> {
  const sizeInKB = buffer.byteLength / 1024;
  return Math.max(1, Math.ceil(sizeInKB / 50));
}

export async function POST(request: NextRequest) {
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
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type for ${file.name}. Only PDF, DOCX, PNG, and JPG are allowed.` },
          { status: 400 }
        );
      }

      if (file.size > maxSize) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds the 50MB size limit.` },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();

      let pageCount = 1;
      if (file.type === 'application/pdf') {
        pageCount = await countPDFPages(arrayBuffer);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        pageCount = await countDocxPages(arrayBuffer);
      } else {
        pageCount = await countImagePages();
      }

      totalPageCount += pageCount;

      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const fileExtension = file.name.split('.').pop();
      const uniqueFilename = `${timestamp}-${randomSuffix}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('print-jobs')
        .upload(uniqueFilename, arrayBuffer, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        console.error('Admin upload error for file', file.name, uploadError);
        if (uploadedUniqueFiles.length > 0) {
          await supabase.storage.from('print-jobs').remove(uploadedUniqueFiles);
        }
        return NextResponse.json(
          { error: `Failed to upload file ${file.name}`, details: uploadError.message },
          { status: 500 }
        );
      }

      uploadedUniqueFiles.push(uniqueFilename);
      originalFileNames.push(file.name);
    }

    const fileUrlJoined = uploadedUniqueFiles.join(',');
    const fileNameJoined = originalFileNames.join(', ');
    const pickupTime = calculatePickupTime();

    // Directly insert order as PAID (free admin print).
    // Use total_amount: 1 (1 paise, ₹0.01) to satisfy CHECK (total_amount > 0) database constraint.
    const { data: order, error: dbError } = await supabaseAdmin
      .from('orders')
      .insert({
        file_url: fileUrlJoined,
        file_name: fileNameJoined,
        page_count: totalPageCount,
        requires_staple: requiresStaple,
        total_amount: 1, // 1 paise (satisfies total_amount > 0 DB check constraint)
        status: 'PAID', // Directly PAID so daemon picks it up immediately
        payment_status: 'PAID',
        pickup_time: pickupTime.toISOString(),
        user_id: user.id
      })
      .select()
      .single();

    if (dbError || !order) {
      console.error('Admin order database error:', dbError);
      if (uploadedUniqueFiles.length > 0) {
        await supabase.storage.from('print-jobs').remove(uploadedUniqueFiles);
      }
      return NextResponse.json(
        { error: 'Failed to create admin order', details: dbError?.message || 'Database insert failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      pageCount: totalPageCount,
      fileCount: files.length,
      fileNames: fileNameJoined,
      message: 'Admin print order created and sent to local print queue successfully!'
    });

  } catch (error) {
    console.error('Admin upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
