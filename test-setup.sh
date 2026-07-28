#!/bin/bash

# Test Script for College Printing Platform
# Run this after setting up to verify everything works

echo "======================================"
echo "College Printing Platform - Test Suite"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.local exists
echo "1. Checking environment configuration..."
if [ -f .env.local ]; then
    echo -e "${GREEN}✓${NC} .env.local found"

    # Check required variables
    if grep -q "NEXT_PUBLIC_SUPABASE_URL=.*[^=]$" .env.local; then
        echo -e "${GREEN}✓${NC} NEXT_PUBLIC_SUPABASE_URL is set"
    else
        echo -e "${RED}✗${NC} NEXT_PUBLIC_SUPABASE_URL is not set"
    fi

    if grep -q "SUPABASE_SERVICE_ROLE_KEY=.*[^=]$" .env.local; then
        echo -e "${GREEN}✓${NC} SUPABASE_SERVICE_ROLE_KEY is set"
    else
        echo -e "${RED}✗${NC} SUPABASE_SERVICE_ROLE_KEY is not set"
    fi

    if grep -q "RAZORPAY_KEY_ID=.*[^=]$" .env.local; then
        echo -e "${GREEN}✓${NC} RAZORPAY_KEY_ID is set"
    else
        echo -e "${RED}✗${NC} RAZORPAY_KEY_ID is not set"
    fi

    if grep -q "DAEMON_SECRET_KEY=.*[^=]$" .env.local; then
        echo -e "${GREEN}✓${NC} DAEMON_SECRET_KEY is set"
    else
        echo -e "${RED}✗${NC} DAEMON_SECRET_KEY is not set"
    fi
else
    echo -e "${RED}✗${NC} .env.local not found"
    echo "   Copy .env.example to .env.local and fill in your credentials"
fi

echo ""

# Check if node_modules exists
echo "2. Checking dependencies..."
if [ -d node_modules ]; then
    echo -e "${GREEN}✓${NC} node_modules found"
else
    echo -e "${RED}✗${NC} node_modules not found"
    echo "   Run: npm install"
fi

echo ""

# Check if Supabase schema file exists
echo "3. Checking database schema..."
if [ -f supabase/schema.sql ]; then
    echo -e "${GREEN}✓${NC} Database schema file exists"
    echo "   Remember to run this in Supabase SQL Editor"
else
    echo -e "${RED}✗${NC} supabase/schema.sql not found"
fi

echo ""

# Check if daemon requirements exist
echo "4. Checking daemon setup..."
if [ -f daemon/requirements.txt ]; then
    echo -e "${GREEN}✓${NC} daemon/requirements.txt exists"
else
    echo -e "${RED}✗${NC} daemon/requirements.txt not found"
fi

if [ -f daemon/print_daemon.py ]; then
    echo -e "${GREEN}✓${NC} print_daemon.py exists"
else
    echo -e "${RED}✗${NC} print_daemon.py not found"
fi

echo ""

# Check if Python is installed
echo "5. Checking Python installation..."
if command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version 2>&1)
    echo -e "${GREEN}✓${NC} Python found: $PYTHON_VERSION"
elif command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo -e "${GREEN}✓${NC} Python found: $PYTHON_VERSION"
else
    echo -e "${RED}✗${NC} Python not found"
    echo "   Install Python 3.8+ from python.org"
fi

echo ""

# Try to start Next.js dev server (don't actually start, just check)
echo "6. Checking Next.js configuration..."
if [ -f package.json ]; then
    if grep -q "\"next\":" package.json; then
        echo -e "${GREEN}✓${NC} Next.js is configured"
    else
        echo -e "${RED}✗${NC} Next.js not found in package.json"
    fi
fi

echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Fill in .env.local with your Supabase and Razorpay credentials"
echo "2. Run the database schema in Supabase SQL Editor"
echo "3. Create the 'print-jobs' storage bucket in Supabase"
echo "4. Start the dev server: npm run dev"
echo "5. In another terminal, start the daemon: cd daemon && python print_daemon.py"
echo "6. Visit http://localhost:3000 and test uploading a file"
echo ""
echo "For detailed instructions, see:"
echo "  - README.md (overview)"
echo "  - DEPLOYMENT.md (complete setup guide)"
echo "  - daemon/README.md (daemon-specific setup)"
echo ""
