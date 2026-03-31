# Cloud Run Deployment Troubleshooting Guide

## 🔴 Current Error

```
Container failed to start and listen on the port defined by PORT=8080
This can happen when the container port is misconfigured or if the timeout is too short.
```

## ✅ Fixes Applied

### 1. **Server Startup Logic** (server.js)
- ✅ Added async initialization sequence
- ✅ Database connection test before listening
- ✅ Proper error handling with exit codes
- ✅ Health check endpoints (`/health`, `/ready`)
- ✅ Graceful shutdown handling

### 2. **Docker Configuration** (Dockerfile)
- ✅ Added `NODE_ENV=production` environment variable
- ✅ Explicit `PORT=8080` environment variable
- ✅ Docker HEALTHCHECK instruction for monitoring
- ✅ Better startup logging

### 3. **Cloud Build Configuration** (cloudbuild.yaml)
- ✅ Added explicit `--port 8080` flag
- ✅ Added `--timeout 3600s` for startup timeout
- ✅ Added `--set-cloudsql-instances` flag for Cloud SQL connection
- ✅ Memory and CPU specifications
- ✅ Max instances configuration

---

## 🔍 Debugging Steps

### Step 1: Check Cloud Logs
```bash
# View recent deployment logs
gcloud run services describe stackops-backend --region=us-central1

# View detailed service logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=stackops-backend" \
  --limit=100 --format=json | jq '.'

# Tail logs in real-time
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=stackops-backend" \
  --follow --format="value(jsonPayload.message)"
```

### Step 2: Check Container Can Start Locally
```bash
# Build and test locally
docker build -t stackops-app .
docker run -it -p 8080:8080 \
  -e PORT=8080 \
  -e NODE_ENV=production \
  stackops-app
```

### Step 3: Verify Cloud SQL Connection
```bash
# Ensure Cloud SQL instance exists
gcloud sql instances list

# Check Cloud SQL instance details
gcloud sql instances describe stackops-db --region=us-central1

# Verify service account has Cloud SQL permissions
gcloud projects get-iam-policy stackops-backend-475222 \
  --flatten="bindings[].members" \
  --format='table(bindings.role)' \
  --filter="bindings.members:*cloud-run-sa*"
```

### Step 4: Manual Deployment Test
```bash
# Deploy with maximum verbosity
gcloud run deploy stackops-backend \
  --image us-central1-docker.pkg.dev/stackops-backend-475222/stackops-repo/stackops-app:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 3600s \
  --set-cloudsql-instances stackops-backend-475222:us-central1:stackops-db \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --verbose

# Check service after deployment
gcloud run services describe stackops-backend --region=us-central1
```

---

## 🚨 Common Issues & Solutions

### Issue 1: Database Connection Fails
**Symptoms:** Logs show "Database connection failed"

**Causes:**
- Cloud SQL proxy not connected
- Wrong credentials in server.js
- Cloud SQL instance down
- Network/firewall issues

**Solutions:**
```bash
# 1. Verify credentials in server.js (lines 84-98)
# Check: - DB_USER, DB_PASSWORD, DB_NAME match Cloud SQL instance

# 2. Test Cloud SQL instance is accessible
gcloud sql connect stackops-db --user=admin-fix

# 3. Check Cloud SQL instance status
gcloud sql instances describe stackops-db

# 4. Grant Cloud Run service account Cloud SQL access
gcloud projects add-iam-policy-binding stackops-backend-475222 \
  --member="serviceAccount:stackops-backend-475222@appspot.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

### Issue 2: Port Not Listening
**Symptoms:** "Container failed to start" after 4+ minutes

**Causes:**
- App crashes before calling app.listen()
- app.listen() timeout is too short
- Missing PORT environment variable

**Solutions:**
```bash
# 1. Check app.listen() is called in server.js (NEW: startServer() function)
# 2. Increase startup timeout in cloudbuild.yaml
# 3. Verify PORT environment variable is set
gcloud run services describe stackops-backend --format='value(status.conditions[0].message)'
```

### Issue 3: Health Check Fails
**Symptoms:** Service rolls back after health check timeout

**Causes:**
- `/health` endpoint not responding
- Database not ready
- Memory/CPU limits too low

**Solutions:**
```bash
# 1. Verify health endpoints exist in server.js
# 2. Increase memory allocation
gcloud run deploy stackops-backend --memory 1Gi --region us-central1

# 3. Test health endpoint locally
curl http://localhost:8080/health
curl http://localhost:8080/ready
```

### Issue 4: Artifact Registry Push Fails
**Symptoms:** "Failed to push image to registry"

**Causes:**
- Not authenticated to Artifact Registry
- Wrong registry URL

**Solutions:**
```bash
# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev

# Verify artifact registry exists
gcloud artifacts repositories list --location=us-central1

# Test push manually
docker tag stackops-app:latest \
  us-central1-docker.pkg.dev/stackops-backend-475222/stackops-repo/stackops-app:test
docker push \
  us-central1-docker.pkg.dev/stackops-backend-475222/stackops-repo/stackops-app:test
```

---

## 📋 Pre-Deployment Checklist

### Local Testing
- [ ] `npm install` runs without errors
- [ ] `npm start` starts the server on port 8080
- [ ] Server logs show "Server is RUNNING on PORT 8080"
- [ ] `curl http://localhost:8080/health` returns 200
- [ ] `curl http://localhost:8080/ready` returns 200
- [ ] All API endpoints respond without errors

### Docker Testing
- [ ] `docker build -t stackops-app .` completes successfully
- [ ] `docker run -it -p 8080:8080 stackops-app` starts the container
- [ ] Container shows "Server is RUNNING on PORT 8080"
- [ ] Health checks pass inside container

### Cloud Configuration
- [ ] Cloud SQL instance exists: `stackops-db`
- [ ] Database name: `consultation_db`
- [ ] Database user: `admin-fix`
- [ ] Cloud Build repository is connected
- [ ] Artifact Registry repository exists: `stackops-repo`
- [ ] Service account has Cloud SQL permissions

### Environment Variables (In Cloud Run)
- [ ] `PORT=8080` is set or default works
- [ ] `NODE_ENV=production` is set (optional but recommended)
- [ ] Any other required secrets are configured

---

## 🚀 Deployment Commands

### Option 1: Using Cloud Build (Recommended)
```bash
# Trigger Cloud Build from repository
gcloud builds submit --config cloudbuild.yaml

# Monitor build progress
gcloud builds log -f <BUILD_ID>
```

### Option 2: Manual Deployment
```bash
# Build locally
docker build -t stackops-app .

# Push to Artifact Registry
docker tag stackops-app:latest \
  us-central1-docker.pkg.dev/stackops-backend-475222/stackops-repo/stackops-app:latest
docker push \
  us-central1-docker.pkg.dev/stackops-backend-475222/stackops-repo/stackops-app:latest

# Deploy to Cloud Run
gcloud run deploy stackops-backend \
  --image us-central1-docker.pkg.dev/stackops-backend-475222/stackops-repo/stackops-app:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 3600s \
  --set-cloudsql-instances stackops-backend-475222:us-central1:stackops-db \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1
```

---

## 📊 Monitoring After Deployment

### Check Service Status
```bash
# View service details
gcloud run services describe stackops-backend --region=us-central1

# View recent revisions
gcloud run revisions list --service=stackops-backend --region=us-central1

# View metrics
gcloud monitoring read --format=table \
  --resource=cloud_run_revision \
  --filter="resource.service_name=stackops-backend"
```

### View Logs
```bash
# Last 50 log lines
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=stackops-backend" \
  --limit=50 --format=text

# Errors only
gcloud logging read "resource.type=cloud_run_revision AND severity=ERROR AND resource.labels.service_name=stackops-backend" \
  --limit=20 --format=text
```

### Test Service
```bash
# Get service URL
SERVICE_URL=$(gcloud run services list --filter="name=stackops-backend" \
  --region=us-central1 --format='value(URL)')

# Test health endpoint
curl $SERVICE_URL/health

# Test ready endpoint
curl $SERVICE_URL/ready

# Test API endpoint (example)
curl $SERVICE_URL/api/admin/companies -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🆘 Still Not Working?

### Enable Debug Logging
In `server.js`, add at the top (after requires):
```javascript
// Enable detailed startup logging
const DEBUG = process.env.DEBUG || true;
if (DEBUG) {
    console.log('=== STARTUP DEBUG INFO ===');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('PORT:', process.env.PORT);
    console.log('CWD:', process.cwd());
    console.log('NODE_VERSION:', process.version);
    console.log('==========================');
}
```

### Create Support Issue with These Details
```
1. Cloud Build logs (gcloud builds log <ID>)
2. Cloud Run service details (gcloud run services describe stackops-backend)
3. Recent Cloud Logging entries (from Cloud Console)
4. Docker build output (docker build -t test .)
5. Local server.js test output (npm start)
6. Database connectivity test results
```

---

## 📚 References

- [Cloud Run Troubleshooting](https://cloud.google.com/run/docs/troubleshooting)
- [Container Failed to Start](https://cloud.google.com/run/docs/troubleshooting#container-failed-to-start)
- [Cloud SQL Connections](https://cloud.google.com/sql/docs/mysql/connect-run)
- [Cloud Run Health Checks](https://cloud.google.com/run/docs/configuring/healthchecks)
