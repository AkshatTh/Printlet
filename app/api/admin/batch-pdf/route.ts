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

    // Fetch all active orders
    const { data: allOrdersData, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: true });

    if (ordersError) {
      console.error('Batch PDF orders DB error:', ordersError);
      return NextResponse.json(
        { error: 'Database error fetching orders', details: ordersError.message },
        { status: 500 }
      );
    }

    // Filter active paid orders (PAID or PRINTED, excluding DELIVERED)
    const activeOrders = (allOrdersData || []).filter(order => {
      const currentStatus = order.status || order.payment_status;
      return currentStatus === 'PAID' || currentStatus === 'PRINTED';
    });

    if (activeOrders.length === 0) {
      return NextResponse.json(
        { error: 'No active paid orders found in queue for batch download.' },
        { status: 404 }
      );
    }

    // Fetch user profiles map for names & phone numbers
    const userIds = Array.from(new Set(activeOrders.map(o => o.user_id).filter(Boolean)));
    let profilesMap: Record<string, { full_name: string; phone_number: string }> = {};

    if (userIds.length > 0) {
      const { data: profilesData } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, phone_number')
        .in('id', userIds);

      if (profilesData) {
        profilesData.forEach(p => {
          profilesMap[p.id] = {
            full_name: p.full_name,
            phone_number: p.phone_number,
          };
        });
      }
    }

    // Create a new master PDF document
    const masterPdf = await PDFDocument.create();
    const font = await masterPdf.embedFont(StandardFonts.HelveticaBold);
    let mergedFilesCount = 0;

    for (const order of activeOrders) {
      const rawPathStr = order.file_url || order.file_path || order.file_name;
      if (!rawPathStr) continue;

      const profile = order.user_id ? profilesMap[order.user_id] : null;
      const fileList = String(rawPathStr).split(',').map((s: string) => s.trim()).filter(Boolean);

      for (let filePath of fileList) {
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
            const errPage = masterPdf.addPage([600, 400]);
            errPage.drawText(`[PRINTLET NOTICE] Download Pending: ${order.file_name || filePath}`, {
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
            // Word / docx / unsupported format page placeholder
            const docxPage = masterPdf.addPage([600, 400]);
            docxPage.drawText(`WORD / OTHER DOCUMENT: ${order.file_name || filePath}`, {
              x: 50,
              y: 250,
              size: 16,
              font,
              color: rgb(0.1, 0.1, 0.1),
            });
            docxPage.drawText(`Customer: ${profile?.full_name || 'Student'} (${profile?.phone_number || ''})`, {
              x: 50,
              y: 210,
              size: 12,
              font,
              color: rgb(0.3, 0.3, 0.3),
            });
            mergedFilesCount++;
          }
        } catch (docErr) {
          console.error(`Error processing file ${filePath} for order ${order.id}:`, docErr);
          const fallbackPage = masterPdf.addPage([600, 400]);
          fallbackPage.drawText(`NOTICE: ${order.file_name || filePath}`, {
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
        { error: 'Could not process PDF files from current queue.' },
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
    console.error('Batch PDF error:', error);
    return NextResponse.json(
      { error: 'Failed to generate batch PDF', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
