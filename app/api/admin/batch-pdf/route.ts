import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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
      return NextResponse.json(
        { error: 'Database error fetching orders', details: ordersError.message },
        { status: 500 }
      );
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'No active paid orders found in queue for batch download.' },
        { status: 404 }
      );
    }

    // Create a new master PDF document
    const masterPdf = await PDFDocument.create();
    const font = await masterPdf.embedFont(StandardFonts.HelveticaBold);
    let mergedFilesCount = 0;

    for (const order of orders) {
      const rawPathStr = order.file_url || order.file_path || order.file_name;
      if (!rawPathStr) continue;

      // Handle comma-separated filenames for multi-file orders
      const rawFileList = rawPathStr.split(',').map((s: string) => s.trim()).filter(Boolean);

      for (let filePath of rawFileList) {
        // Clean URL if full Supabase URL was passed
        if (filePath.includes('/print-jobs/')) {
          filePath = filePath.split('/print-jobs/').pop() || filePath;
        } else if (filePath.includes('/print-files/')) {
          filePath = filePath.split('/print-files/').pop() || filePath;
        } else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
          filePath = filePath.split('/').pop() || filePath;
        }

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
            // Insert error placeholder page so batch continues smoothly
            const errPage = masterPdf.addPage([600, 400]);
            errPage.drawText(`[PRINTLET NOTICE] File Download Pending: ${order.file_name || filePath}`, {
              x: 50,
              y: 200,
              size: 14,
              font,
              color: rgb(0.8, 0.1, 0.1),
            });
            mergedFilesCount++;
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
          } else {
            // DOCX or unsupported format: Add informative placeholder page
            const docxPage = masterPdf.addPage([600, 400]);
            docxPage.drawText(`DOCX / WORD DOCUMENT: ${order.file_name || filePath}`, {
              x: 50,
              y: 250,
              size: 16,
              font,
              color: rgb(0.1, 0.1, 0.1),
            });
            const profile: any = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles;
            docxPage.drawText(`Customer: ${profile?.full_name || 'Student'} (${profile?.phone_number || ''})`, {
              x: 50,
              y: 210,
              size: 12,
              font,
              color: rgb(0.3, 0.3, 0.3),
            });
            docxPage.drawText(`Note: Word documents (.docx) can be opened and printed separately from phone/laptop.`, {
              x: 50,
              y: 170,
              size: 11,
              font,
              color: rgb(0.5, 0.5, 0.5),
            });
            mergedFilesCount++;
          }
        } catch (docErr) {
          console.error(`Error merging file ${filePath} for order ${order.id}:`, docErr);
          // Add fallback page so batch does not fail
          const fallbackPage = masterPdf.addPage([600, 400]);
          fallbackPage.drawText(`DOCUMENT PROCESSING NOTICE: ${order.file_name || filePath}`, {
            x: 50,
            y: 200,
            size: 14,
            font,
            color: rgb(0.8, 0.1, 0.1),
          });
          mergedFilesCount++;
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
      { error: 'Failed to generate batch PDF', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
