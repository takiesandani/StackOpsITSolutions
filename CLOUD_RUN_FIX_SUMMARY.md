# ⚡ Cloud Run Deployment Fix - Quick Reference

## 🔴 The Problem

```
ERROR: The user-provided container failed to start and listen on 
the port defined by PORT=8080 environment variable within the 
allocated timeout.
```

**Why it happened:**
- The Express app was calling `app.listen()` synchronously
- If anything fails during startup (DB connection, routes, etc.), the app crashes
- Cloud Run never sees the container listening on port 8080
- Deployment times out and fails

---

## ✅ The Solution

### Problem Code (OLD)
```javascript
// OLD: app.listen() doesn't wait for anything
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

### Fixed Code (NEW)
```javascript
// NEW: Proper async initialization
async function startServer() {
    const PORT = process.env.PORT || 8080;
    
    try {
        // Test database connection BEFORE listening
        if (!pool) throw new Error('Database pool unavailable');
        const connection = await pool.getConnection();
        connection.release();
        
        // NOW safe to listen
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Startup failed:', error);
        process.exit(1); // Exit with error code
    }
}

startServer();
```

---

## 🔑 Key Changes

### 1. Async Initialization (server.js)
| Before | After |
|--------|-------|
| Synchronous `app.listen()` | Async `startServer()` function |
| No database test | Test DB before listening |
| No error handling | Proper error handling + exit codes |
| No health checks | Added `/health` and `/ready` endpoints |
| No graceful shutdown | SIGTERM handling |

### 2. Docker Settings (Dockerfile)
| Before | After |
|--------|-------|
| No NODE_ENV | `NODE_ENV=production` |
| No HEALTHCHECK | Docker HEALTHCHECK instruction |
| No PORT env | Explicit `PORT=8080` |
| Generic startup | Optimized Node.js configuration |

### 3. Cloud Build Config (cloudbuild.yaml)
| Before | After |
|--------|-------|
| No port specification | `--port 8080` |
| Default timeout | `--timeout 3600s` |
| No Cloud SQL link | `--set-cloudsql-instances ...` |
| No resource limits | Memory, CPU, max instances |

---

## 🚀 How to Deploy Now

### Method 1: Cloud Build (Recommended)
```bash
# Push to repo triggers Cloud Build automatically
git add .
git commit -m "Fix Cloud Run deployment"
git push origin main

# View build progress
gcloud builds list --limit=5

# View logs
gcloud builds log <BUILD_ID> -f
```

### Method 2: Manual Deployment
```bash
# Build Docker image
docker build -t stackops-app .

# Tag for Artifact Registry
docker tag stackops-app:latest \
  us-central1-docker.pkg.dev/stackops-backend-475222/stackops-repo/stackops-app:latest

# Push to Artifact Registry
docker push \
  us-central1-docker.pkg.dev/stackops-backend-475222/stackops-repo/stackops-app:latest

# Deploy to Cloud Run
gcloud run deploy stackops-backend \
  --image us-central1-docker.pkg.dev/stackops-backend-475222/stackops-repo/stackops-app:latest \
  --region us-central1 \
  --set-cloudsql-instances stackops-backend-475222:us-central1:stackops-db \
  --allow-unauthenticated
```

---

## ✅ Verification Checklist

### Local Testing
```bash
# 1. Start server locally
npm start
# Should see: "✅ Server is RUNNING on PORT 8080"

# 2. Test health endpoint
curl http://localhost:8080/health
# Should return: {"status": "healthy", ...}

# 3. Test ready endpoint
curl http://localhost:8080/ready
# Should return: {"status": "ready", ...}
```

### Docker Testing
```bash
# 1. Build image
docker build -t stackops-app .
# Should complete without errors

# 2. Run container
docker run -it -p 8080:8080 stackops-app
# Should see: "✅ Server is RUNNING on PORT 8080"

# 3. Test from another terminal
curl http://localhost:8080/health
```

### Cloud Run Testing
```bash
# 1. Check service status
gcloud run services describe stackops-backend --region=us-central1

# 2. View recent logs
gcloud logging read "resource.type=cloud_run_revision AND \
  resource.labels.service_name=stackops-backend" --limit=50

# 3. Test service endpoint
SERVICE_URL=$(gcloud run services list --filter="name=stackops-backend" \
  --region=us-central1 --format='value(URL)')
curl $SERVICE_URL/health
```

---

## 📊 What Changed Under the Hood

### Health Check Flow (NEW)
```
1. Container starts
   ↓
2. Node.js executes server.js
   ↓
3. startServer() is called immediately
   ↓
4. Database pool is verified
   ↓
5. Test connection to Cloud SQL
   ↓
6. ✅ If success → app.listen(8080)
   ❌ If failed → console.error() + process.exit(1)
   ↓
7. Cloud Run sees port 8080 listening
   ↓
8. Cloud Run considers deployment successful
```

### Service Availability (NEW)
```
/health  → Is the server running? (Always responds if app is up)
/ready   → Is everything ready to serve traffic? (Tests DB connection)
```

---

## 🔍 Monitoring After Deployment

### View Service Status
```bash
gcloud run services describe stackops-backend --region=us-central1
```

### View Recent Logs
```bash
gcloud logging read "resource.type=cloud_run_revision AND \
  resource.labels.service_name=stackops-backend" \
  --limit=100 --format=text
```

### Check for Errors
```bash
gcloud logging read "severity=ERROR AND \
  resource.labels.service_name=stackops-backend" \
  --limit=20 --format=text
```

---

## 🆘 If Still Having Issues

1. **Check Cloud SQL Connection**
   ```bash
   gcloud sql instances describe stackops-db
   ```

2. **Verify Service Account Permissions**
   ```bash
   gcloud projects get-iam-policy stackops-backend-475222 \
     --flatten="bindings[].members" \
     --filter="bindings.members:*cloud-run*"
   ```

3. **Enable Debug Mode**
   - Set `DEBUG=true` in Cloud Run environment variables
   - Redeploy and check logs

4. **Review Full Troubleshooting Guide**
   - See: [DEPLOYMENT_TROUBLESHOOTING.md](DEPLOYMENT_TROUBLESHOOTING.md)

---

## 📚 Related Files Modified

- ✅ [server.js](server.js#L3450-L3500) - Added `startServer()` function with health checks
- ✅ [Dockerfile](Dockerfile) - Added NODE_ENV, HEALTHCHECK, PORT env
- ✅ [cloudbuild.yaml](cloudbuild.yaml) - Added deployment configuration
- ✅ [DEPLOYMENT_TROUBLESHOOTING.md](DEPLOYMENT_TROUBLESHOOTING.md) - Full troubleshooting guide
- ✅ [deployment-test.sh](deployment-test.sh) - Automated test script

---

## 🎯 Expected Result

After applying these fixes:

1. ✅ Container starts consistently
2. ✅ Port 8080 listening within timeout
3. ✅ Health checks pass
4. ✅ Service stays running
5. ✅ Can process requests normally

**Deployment time:** Usually completes in 2-5 minutes
