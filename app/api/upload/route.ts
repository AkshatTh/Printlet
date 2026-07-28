import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { PDFDocument } from 'pdf-lib';
import { calculatePickupTime } from '@/lib/pickup-time';

const STAPLE_COST = 1; // ₹1 for staple

// Tiered pricing based on page count
function getPricePerPage(pageCount: number): number {
  if (pageCount >= 20) return 3.5;  // 20+ pages: ₹3.50/page
  if (pageCount >= 10) return 4;    // 10-19 pages: ₹4/page
  if (pageCount >= 5) return 4.5;   // 5-9 pages: ₹4.50/page
  return 5;                         // 1-4 pages: ₹5/page
}

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
    // Enforce mandatory authentication header
    let userId: string | null = null;
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to upload documents and place an order.' },
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

      // Upload file to Supabase Storage
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
        console.error('Upload error for file', file.name, uploadError);
        // Clean up previously uploaded files
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

    // Calculate total amount (in paise) with tiered pricing based on aggregated page count
    const pricePerPage = getPricePerPage(totalPageCount);
    const baseAmount = totalPageCount * pricePerPage * 100; // Convert to paise
    const stapleAmount = requiresStaple ? STAPLE_COST * 100 : 0;
    const totalAmount = baseAmount + stapleAmount;

    const fileUrlJoined = uploadedUniqueFiles.join(',');
    const fileNameJoined = originalFileNames.join(', ');

    // Calculate pickup time (next working day at 12:30 PM)
    const pickupTime = calculatePickupTime();

    // Create order record using admin client (resilient to schema migrations)
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

    // Fallback if database migration script has not been run yet
    if (dbError && (dbError.code === 'PGRST204' || dbError.message?.includes('file_name') || dbError.message?.includes('column'))) {
      console.warn('Full schema insert failed, falling back to base schema:', dbError.message);
      const legacyResult = await supabaseAdmin
        .from('orders')
        .insert({
          file_url: fileUrlJoined,
          page_count: totalPageCount,
          requires_staple: requiresStaple,
          total_amount: totalAmount,
          payment_status: 'PENDING'
        })
        .select()
        .single();

      order = legacyResult.data;
      dbError = legacyResult.error;
    }

    if (dbError || !order) {
      console.error('Database error:', dbError);
      // Clean up uploaded files
      if (uploadedUniqueFiles.length > 0) {
        await supabase.storage.from('print-jobs').remove(uploadedUniqueFiles);
      }
      return NextResponse.json(
        { error: 'Failed to create order', details: dbError?.message || 'Database insert failed' },
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
      totalAmount: totalAmount / 100, // Return in rupees
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
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
