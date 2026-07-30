# 𖤓 Printlet — Campus Printing Micro-SaaS & Distributed Hardware Spooler Network

> **A high-performance, automated campus printing platform built with Next.js 16, Supabase, Razorpay API, and an autonomous Windows Python Print Daemon.**

[![Next.js](https://img.shields.io/badge/Next.js-16_Turbopack-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%26_RLS-emerald?style=flat-square&logo=supabase)](https://supabase.com/)
[![Python](https://img.shields.io/badge/Python-3.4_--_3.12-yellow?style=flat-square&logo=python)](https://www.python.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-sky?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)

---

## 📌 Executive Summary

**Printlet (PrintHub)** is a light, fast, 100% automated campus printing micro-SaaS designed to eliminate long printing queues for college students. Students can upload multi-file assignments (PDFs, Word documents, images) directly from their phone or laptop, receive dynamic volume-discounted pricing, pay via Razorpay UPI/Cards, and collect their **Black & White** printouts from **Room 607** during designated pickup slots (**10:40 AM – 10:50 AM** or **12:30 PM – 1:20 PM**).

Behind the scenes, a decoupled Python daemon running on a remote Windows machine connected to a physical printer polls the cloud backend for paid orders, streams documents via signed Supabase Storage URLs, silently spools them to the printer hardware, and purges cloud/local temporary files upon completion.

---

## 🏗️ System Architecture

Printlet is architected into two main layers: a **Cloud Web Layer** deployed on Vercel and an **Edge Hardware Layer** running an autonomous Python daemon on physical Windows hardware.

```mermaid
sequenceDiagram
    autonumber
    actor Student as 🎓 Student / User
    participant Frontend as 🌐 Next.js 16 Web App
    participant Backend as ⚡ Next.js API Routes
    participant Supabase as 🗄️ Supabase DB & Storage
    participant Razorpay as 💳 Razorpay Gateway
    participant Daemon as 🐍 Windows Print Daemon
    participant Printer as 🖨️ SumatraPDF / GDI+ Printer

    Student->>Frontend: Select & Drag-and-Drop Files (PDF, DOCX, PNG, JPG)
    Frontend->>Backend: POST /api/upload (Multi-file Payload)
    Backend->>Backend: Inspect Binary Buffers & Calculate Pages (pdf-lib)
    Backend->>Supabase: Store files in private 'print-jobs' bucket & insert 'orders'
    Backend-->>Frontend: Return Order Summary & Tier-Calculated Pricing
    Student->>Frontend: Click Pay via Razorpay
    Frontend->>Razorpay: Initiate Razorpay Checkout Modal
    Razorpay-->>Student: Complete Payment (UPI / QR / Card)
    Razorpay->>Backend: POST /api/verify (Cryptographic HMAC SHA256 Signature)
    Backend->>Supabase: Update Order Status to 'PAID'
    loop Every 10 Seconds
        Daemon->>Backend: GET /api/daemon/pending (Bearer Auth)
        Backend-->>Daemon: Return Paid Print Queue Payload
        Daemon->>Supabase: Download file via Signed Temp Storage URL
        alt File is PDF
            Daemon->>Printer: Spool silently via SumatraPDF -silent
        alt File is JPG / PNG
            Daemon->>Daemon: Convert Image to PDF in-memory (convert_image_to_pdf)
            Daemon->>Printer: Spool converted PDF via SumatraPDF -silent
        alt File is DOCX
            Daemon->>Printer: Print via MS Word COM Automation (win32com)
        end
        Daemon->>Backend: POST /api/daemon/complete
        Backend->>Supabase: Purge temp cloud file & set status 'PRINTED'
    end
    Student->>Frontend: View Ready Status & Pickup Notice (Room 607)
```

---

## ✨ Key Features & Functionality

### 📱 Student Portal & Frontend
- **Multi-Format Ingestion**: Supports `.pdf`, `.docx`, `.png`, and `.jpg` multi-file batch uploads.
- **Instant Page Calculation**: Uses serverless binary stream parsing (`pdf-lib`) to calculate total pages before payment.
- **Dynamic Tier-Based Pricing**:
  - **1 – 9 Pages**: ₹4.00 / page
  - **10 – 29 Pages**: ₹3.75 / page
  - **30+ Pages**: ₹3.50 / page *(Volume discount for lab manuals & notes)*
  - **Staple Option**: Optional +₹1.00 staple fee per order batch.
- **Seamless UPI Checkout**: Integrated Razorpay checkout with fallback DOM body-scroll recovery handlers.
- **Pickup Notifications & Disclaimers**: Displays pickup location (**Room 607**), pickup slots (**10:40–10:50 AM** & **12:30–1:20 PM**), operator email (`at6710@srmist.edu.in`), and delay notices.

### ⚡ Admin Delivery & Operations Panel
- **Active Delivery Queue**: Real-time view of paid and printed orders awaiting collection.
- **Delivered Orders History**: Dedicated **Last 10 Days Completed Orders** section backed by Service-Role API persistence (`POST /api/admin/deliver`).
- **Visual Staple Indicators**: Prominent `📌 Stapled (+₹1)` badges in admin tables so operators know which orders require stapling.
- **WhatsApp Notification Integration**: One-click WhatsApp message triggers populated with customer name, phone number, and pickup slot timings.
- **Service Outage & Maintenance Control Mode**: Toggle switch to mark the site as closed during power or hardware outages while allowing document uploads without next-day promises.
- **Direct Free Print Upload Panel**: Admin drag-and-drop tool to upload and print documents directly without going through payment gateways.

### 🐍 Autonomous Windows Print Daemon
- **Zero-Touch Hardware Spooling**: Runs silently in the background on Windows machines.
- **Dynamic SumatraPDF Detection**: Dynamically locates installed or portable SumatraPDF binaries (e.g., `SumatraPDF-3.5.2-64.exe`).
- **Pure-Python Image-to-PDF Wrapper**: Converted JPEG/PNG images on-the-fly to valid PDF streams to fix SumatraPDF silent CLI execution limitations.
- **MS Word COM Automation**: Automated `.docx` file printing containing embedded images via `win32com.client` and LibreOffice fallbacks.
- **Cross-Version Python Compatibility**: Customized `Popen` wrappers (`sub_run`) ensuring flawless execution on legacy Python 3.4.4 and Windows 7 environments up to modern Python 3.12.

---

## 🛠️ The Engineering Journey: Hardships & Solved Bottlenecks

Building Printlet involved solving real-world hardware, browser, and cloud storage challenges:

### 1. The SumatraPDF Silent CLI Image Printing Bug
- **Issue**: Calling `SumatraPDF.exe -print-to-default -silent image.jpg` caused SumatraPDF to silently exit without spooling any output to the printer.
- **Solution**: Developed a pure-Python in-memory JPEG-to-PDF binary stream converter (`convert_image_to_pdf()`) inside `daemon/print_daemon.py`. Images are converted to lightweight PDFs on-the-fly before handing them to SumatraPDF, guaranteeing 100% silent image printing.

### 2. DOCX Files with Embedded Images
- **Issue**: Standard text converters stripped embedded images from student assignment `.docx` files during command-line printing.
- **Solution**: Built MS Word COM automation via `win32com.client.Dispatch("Word.Application")` to silently render and print complete Word documents with embedded images preserved.

### 3. Legacy Windows 7 & Python 3.4.4 Compatibility
- **Issue**: The dedicated printer machine ran Python 3.4.4 on Windows 7, which lacks modern standard library methods like `subprocess.run()`.
- **Solution**: Built a custom `sub_run()` compatibility wrapper using `subprocess.Popen()` and standard output piping, allowing the daemon to execute seamlessly across legacy and modern environments.

### 4. Supabase Client RLS Mutation Restrictions
- **Issue**: Updating order statuses directly from client-side Supabase calls failed or was ignored due to strict Row-Level Security (RLS) policies for non-owner updates.
- **Solution**: Created dedicated Next.js API routes (`/api/admin/deliver`, `/api/admin/orders`) using `supabaseAdmin` (Service Role Key) to execute administrative database updates securely.

### 5. Razorpay Modal Body-Scroll Lock & Outage Control
- **Issue**: Closing the Razorpay checkout modal occasionally left `overflow: hidden` on the HTML `<body>`, preventing user interaction.
- **Solution**: Implemented an explicit `unlockBodyScroll()` utility attached to modal dismissals and payment handlers, combined with a fault-tolerant in-memory site status fallback (`lib/site-status-state.ts`) to ensure 0 server crashes.

---

## 📂 Repository File Structure

```
printing-platform/
├── app/
│   ├── admin/               # Admin Operations & Delivery Panel
│   ├── api/
│   │   ├── admin/
│   │   │   ├── deliver/     # Service-Role Mark Delivered Route
│   │   │   ├── orders/      # Service-Role Admin Orders & Analytics
│   │   │   ├── site-status/ # Admin Outage Mode Toggle Endpoint
│   │   │   └── upload/      # Admin Direct Free Print Upload
│   │   ├── checkout/        # Razorpay Order Creation
│   │   ├── daemon/
│   │   │   ├── complete/    # Daemon Order Complete Notification
│   │   │   └── pending/     # Daemon Pending Print Queue Fetch
│   │   ├── site-status/     # Public Site Outage Status Endpoint
│   │   ├── upload/          # Multi-file Upload & Page Counter
│   │   └── verify/          # Razorpay Webhook & Signature Verification
│   ├── auth/                # Student Sign In & Registration
│   ├── dashboard/           # Student Print Dashboard & Upload Hub
│   ├── privacy/             # Terms of Service & Privacy Policy Page
│   ├── layout.tsx           # Global Root Layout & Fonts
│   └── page.tsx             # Public Landing Page & Calculator
├── daemon/
│   ├── print_daemon.py      # Autonomous Python Print Daemon
│   └── requirements.txt     # Python Dependencies
├── lib/
│   ├── pickup-time.ts       # Pickup Schedule & Slot Formatting
│   ├── pricing.ts           # Dynamic Volume Tier Calculator
│   ├── site-status-state.ts # Outage Mode State Handler
│   ├── supabase.ts          # Server-Side Supabase Admin Client
│   └── supabase-client.ts   # Client-Side Supabase Client
├── supabase/
│   ├── schema.sql           # Core Database Schema
│   └── migration_site_settings.sql # Outage Mode Table Migration
├── README.md                # Project Documentation
└── package.json
```

---

## 🚀 Local Setup & Installation Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: v3.4 or higher (for print daemon machine)
- **Supabase Account**: For PostgreSQL database & cloud storage
- **Razorpay Account**: For payment checkout keys

---

### 1. Environment Configuration

Create a `.env.local` file in the root directory:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Razorpay API Credentials
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
RAZORPAY_KEY_SECRET=your-razorpay-secret

# Daemon Authentication Secret
DAEMON_SECRET_KEY=your-strong-random-daemon-secret-key
```

---

### 2. Database & Storage Setup (Supabase)

1. Open your Supabase SQL Editor and execute the schema from [`supabase/schema.sql`](file:///c:/Projects/printer/printing-platform/supabase/schema.sql) and [`supabase/migration_site_settings.sql`](file:///c:/Projects/printer/printing-platform/supabase/migration_site_settings.sql).
2. Create a private bucket in Supabase Storage named `print-jobs`:
   - Allowed MIME Types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/png`, `image/jpeg`
   - Maximum File Size: `50MB`

---

### 3. Run Web Application

```bash
# Install NPM dependencies
npm install

# Check TypeScript types
npx tsc --noEmit

# Run local development server
npm run dev
```

Open `http://localhost:3000` to access Printlet locally.

---

### 4. Run Python Print Daemon (Printer Hardware Machine)

On the Windows computer connected to the printer:

```bash
cd daemon

# Install Python requirements
pip install -r requirements.txt

# Set environment credentials in environment or script
# Run the autonomous print daemon
python print_daemon.py
```

The daemon will:
- Poll `/api/daemon/pending` every 10 seconds.
- Download paid files securely via signed storage URLs.
- Print documents natively to the default Windows printer.
- Post completion status to `/api/daemon/complete` and purge temporary files.

---

## 📧 Support & Contact

For operational assistance, custom deployments, or campus printing inquiries:
- **Operator Email**: [at6710@srmist.edu.in](mailto:at6710@srmist.edu.in)
- **Developer GitHub**: [@AkshatTh](https://github.com/AkshatTh)
- **Live Platform**: [printlet.vercel.app](https://printlet.vercel.app)

---

<p center="text-center">
  <strong>© 2026 Printlet — Engineered with precision for campus printing efficiency.</strong>
</p>
