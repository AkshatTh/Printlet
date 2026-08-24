import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { PDFDocument } from 'pdf-lib';

export async function GET(request: NextRequest) {
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

    // Fetch active paid orders waiting to be printed/delivered
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        file_url,
        file_path,
        file_name,
        page_count,
        requires_staple,
        status,
        created_at,
        profiles (
          full_name,
          phone_number
        )
      `)
      .in('status', ['PAID', 'PRINTED'])
      .order('created_at', { ascending: true });

    if (ordersError) {
      throw new Error(`Failed to fetch batch orders: ${ordersError.message}`);
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'No active paid orders found in queue for batch download.' },
        { status: 404 }
      );
    }

    // Create a new master PDF document
    const masterPdf = await PDFDocument.create();
    let mergedFilesCount = 0;

    for (const order of orders) {
      const rawPathStr = order.file_url || order.file_path;
      if (!rawPathStr) continue;

      // Handle comma-separated filenames for multi-file orders
      const fileList = rawPathStr.split(',').map((s: string) => s.trim()).filter(Boolean);

      for (const filePath of fileList) {
        try {
          // Download document file from Supabase Storage bucket 'print-jobs'
          let { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
            .from('print-jobs')
            .download(filePath);

          // Fallback check in 'print-files' bucket if not found
          if (downloadError || !fileBlob) {
            const fallback = await supabaseAdmin.storage
              .from('print-files')
              .download(filePath);
            if (!fallback.error && fallback.data) {
              fileBlob = fallback.data;
              downloadError = null;
            }
          }

          if (downloadError || !fileBlob) {
            console.error(`Failed to download file ${filePath}:`, downloadError);
            continue;
          }

          const fileArrayBuffer = await fileBlob.arrayBuffer();
          const lowerPath = filePath.toLowerCase();

          if (lowerPath.endsWith('.pdf')) {
            const srcPdf = await PDFDocument.load(fileArrayBuffer, { ignoreEncryption: true });
            const pageIndices = srcPdf.getPageIndices();
            const copiedPages = await masterPdf.copyPages(srcPdf, pageIndices);
            copiedPages.forEach((page) => masterPdf.addPage(page));
            mergedFilesCount++;
          } else if (lowerPath.endsWith('.png') || lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) {
            let embeddedImage;
            if (lowerPath.endsWith('.png')) {
              embeddedImage = await masterPdf.embedPng(fileArrayBuffer);
            } else {
              embeddedImage = await masterPdf.embedJpg(fileArrayBuffer);
            }

            const page = masterPdf.addPage([embeddedImage.width, embeddedImage.height]);
            page.drawImage(embeddedImage, {
              x: 0,
              y: 0,
              width: embeddedImage.width,
              height: embeddedImage.height,
            });
            mergedFilesCount++;
          }
        } catch (docErr) {
          console.error(`Error merging file ${filePath} for order ${order.id}:`, docErr);
        }
      }
    }

    if (mergedFilesCount === 0) {
      return NextResponse.json(
        { error: 'Could not process PDF files from the current queue. Check if files exist in storage.' },
        { status: 500 }
      );
    }

    const pdfBytes = await masterPdf.save();
    const todayStr = new Date().toISOString().split('T')[0];

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Printlet_Batch_${todayStr}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Batch PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate batch PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
