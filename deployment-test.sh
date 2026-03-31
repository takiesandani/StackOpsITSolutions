#!/usr/bin/env bash
# deployment-test.sh - Test script to verify Cloud Run deployment readiness

set -e  # Exit on any error

echo "=================================================="
echo "🔍 Cloud Run Deployment Readiness Test"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0

# Function to test commands
test_command() {
    local name="$1"
    local cmd="$2"
    
    echo -n "Testing: $name... "
    if eval "$cmd" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((FAILED++))
    fi
}

# ============================================
# 1. Local Verification
# ============================================
echo "Step 1️⃣ : Local Environment Verification"
echo "============================================"

test_command "Node.js installed" "node --version"
test_command "npm installed" "npm --version"
test_command "package.json exists" "test -f package.json"
test_command "server.js exists" "test -f server.js"
test_command "Dockerfile exists" "test -f Dockerfile"
test_command "cloudbuild.yaml exists" "test -f cloudbuild.yaml"

echo ""

# ============================================
# 2. Dependency Check
# ============================================
echo "Step 2️⃣ : Dependency Verification"
echo "============================================"

test_command "Dependencies installed" "test -d node_modules"
test_command "Express dependency" "test -d node_modules/express"
test_command "MySQL2 dependency" "test -d node_modules/mysql2"
test_command "CORS dependency" "test -d node_modules/cors"

echo ""

# ============================================
# 3. Code Quality Checks
# ============================================
echo "Step 3️⃣ : Code Quality Checks"
echo "============================================"

test_command "server.js has app.listen" "grep -q 'app.listen\|startServer' server.js"
test_command "server.js exports health endpoint" "grep -q '/health' server.js"
test_command "server.js exports ready endpoint" "grep -q '/ready' server.js"
test_command "Dockerfile uses Node 20" "grep -q 'node:20' Dockerfile"
test_command "Dockerfile exposes port 8080" "grep -q 'EXPOSE 8080' Dockerfile"

echo ""

# ============================================
# 4. Google Cloud Configuration
# ============================================
echo "Step 4️⃣ : Google Cloud Configuration"
echo "============================================"

# Check if gcloud is installed
if command -v gcloud &> /dev/null; then
    test_command "gcloud CLI installed" "gcloud --version"
    
    # Get project ID
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
    if [ -n "$PROJECT_ID" ]; then
        echo "Current project: $PROJECT_ID"
        
        test_command "Cloud Run API enabled" "gcloud services list --enabled --filter=name:run.googleapis.com | grep -q run"
        test_command "Cloud Build API enabled" "gcloud services list --enabled --filter=name:cloudbuild.googleapis.com | grep -q cloudbuild"
        test_command "Artifact Registry API enabled" "gcloud services list --enabled --filter=name:artifactregistry.googleapis.com | grep -q artifactregistry"
        test_command "Cloud SQL Admin API enabled" "gcloud services list --enabled --filter=name:sqladmin.googleapis.com | grep -q sqladmin"
        
        test_command "Cloud SQL instance exists" "gcloud sql instances list --format='value(name)' | grep -q stackops-db"
        test_command "Artifact Registry repo exists" "gcloud artifacts repositories list --location=us-central1 | grep -q stackops-repo"
    else
        echo -e "${YELLOW}⚠ gcloud not authenticated. Skipping GCP checks.${NC}"
    fi
else
    echo -e "${YELLOW}⚠ gcloud CLI not installed. Skipping GCP checks.${NC}"
    echo "  Install from: https://cloud.google.com/sdk/docs/install"
fi

echo ""

# ============================================
# 5. Docker Check
# ============================================
echo "Step 5️⃣ : Docker Verification"
echo "============================================"

if command -v docker &> /dev/null; then
    test_command "Docker CLI installed" "docker --version"
    test_command "Docker daemon running" "docker ps > /dev/null"
else
    echo -e "${YELLOW}⚠ Docker not installed. Skipping Docker build test.${NC}"
    echo "  Install from: https://www.docker.com/products/docker-desktop"
fi

echo ""

# ============================================
# 6. Database Credentials
# ============================================
echo "Step 6️⃣ : Database Configuration"
echo "============================================"

test_command "DB config in server.js" "grep -q 'admin-fix\|consultation_db' server.js"
test_command "Cloud SQL socket path set" "grep -q 'cloudsql.*stackops-db' server.js"

echo ""

# ============================================
# 7. Summary
# ============================================
echo "=================================================="
echo "📊 Test Summary"
echo "=================================================="
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo "=================================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready for deployment.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run: npm start (test locally)"
    echo "  2. Run: docker build -t stackops-app . (test Docker build)"
    echo "  3. Run: gcloud builds submit --config cloudbuild.yaml (deploy to Cloud Run)"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please fix the issues above.${NC}"
    exit 1
fi
