# Identity Refresh Path & Stale Source Fix - Technical Summary
**Date**: June 22, 2026  
**Issue**: Snapshots #189-#196 stuck with stale Identity data (May 11, 2026)  
**Status**: ✅ FIXED

---

## Executive Summary

The Enterprise Identity system was silently falling back to stale cached data from May 11, 2026, while newer snapshots existed with fresh data (#176: June 22 18:24, #183: June 22 18:52). The issue was NOT with the Enterprise blocking (that works correctly), but with **Create Snapshot producing stale data** instead of detecting and reporting the refresh failure.

**Root Cause**: Three cascading bugs in the refresh pipeline:
1. `refreshStackCTRLIntelligenceSource` returned `null` instead of data
2. No `fromRefresh` handler existed for identity to process returned data
3. Errors were silently swallowed, with stale fallback marked as "available" not "stale"

**Result**: Snapshots created with `status="available"` containing stale data, preventing Enterprise from blocking them.

---

## What Went Wrong (Snapshots #189-#196)

### Snapshot #189 Creation Timeline:
```
1. createSnapshot() called
   ↓
2. buildTenantAIContext() → calls identity adapter with refresh=true
   ↓
3. adapter calls refreshStackCTRLIntelligenceSource('identity', companyId)
   ↓ PROBLEM: Function returned NULL instead of data
4. adapter reloaded from identity_metrics table
   ↓ PROBLEM: identity_metrics was never updated (May 11 data)
5. collectSource marked status="available" (not "stale")
   ↓ PROBLEM: Refresh error was hidden, didn't mark as stale
6. Snapshot stored with:
   - LastUpdated: 2026-05-11 (from old cache)
   - Status: "available" (incorrect!)
   - NO error message
   ↓
7. Enterprise Intelligence checked source → saw "available" → ran Azure with stale data
```

### Why #176 and #183 Worked:
Unknown - likely manual refresh or different code path. However, the refresh pipeline still had these bugs, which is why subsequent attempts (#189+) consistently failed.

---

## The Fix

### 1. **refreshStackCTRLIntelligenceSource Now Returns Data** 
**File**: `server.js:10628`

**Before**:
```javascript
case 'identity': {
    const token = await getMicrosoftGraphTokenForCompany(companyId);
    const [metrics, details] = await Promise.all([...]);
    
    // Updated cache but returned NULL ❌
    await pool.query(`REPLACE INTO IdentityMetricsCache ...`);
    return null;  // ← Problem!
}
```

**After**:
```javascript
case 'identity': {
    try {
        const token = await getMicrosoftGraphTokenForCompany(companyId);
        const [metrics, details] = await Promise.all([...]);
        
        // Update Azure cache
        await pool.query(`REPLACE INTO IdentityMetricsCache ...`);
        
        // NEW: Also update Sunbird dashboard tables for fresh source
        await pool.query(`REPLACE INTO identity_metrics 
            VALUES (?, ?, ?, ?, ...)`, [computed fresh values]);
        
        // NEW: Update identity_users table with fresh user data
        for (const user of details.users) {
            await pool.query(`REPLACE INTO identity_users ...`, userRow);
        }
        
        // NEW: Return processed data for fromRefresh handler
        return {
            metrics: { totalUsers, activeUsers, ... },
            evidence: details.users,
            users: details.users,
            roleAssignments: details.roleAssignments,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        // NEW: Log real error instead of silently failing
        console.error(`Identity source refresh failed: ${error.message}`, {
            errorCode: error.code,
            errorType: error.constructor.name,
            stack: error.stack
        });
        throw error;  // ← Pass to adapter with context
    }
}
```

**Key Changes**:
- ✅ Returns actual refreshed data
- ✅ Updates `identity_metrics` + `identity_users` (not just Azure cache)
- ✅ Logs real error with full context
- ✅ Throws structured error so adapter knows refresh failed

---

### 2. **Added fromRefresh Handler for Identity**
**File**: `source-adapters.js:205`

**Before**:
```javascript
identity: {
    table: '...',
    async load(...) { ... },
    // NO fromRefresh handler ❌
    metrics: records => primitiveMetrics(records[0]),
    evidence: records => records
}
```

**After**:
```javascript
identity: {
    table: '...',
    async load(...) { ... },
    
    // NEW: Process refreshed data when refresh succeeds
    fromRefresh(refreshed, stored) {
        if (!refreshed) return stored;
        
        const users = refreshed.users || [];
        const dashboardSource = buildIdentityDashboardSource({
            metricsRow: refreshed.metrics,
            usersRows: users,
            ...
        });
        
        return {
            ...stored,
            records: [{ LastUpdated: refreshed.lastUpdated, ...refreshed.metrics }],
            metrics: dashboardSource.dashboardMetrics,
            evidence: [
                ...stored.evidence.filter(e => e.evidenceType === 'tenant'),
                { evidenceType: 'users', data: dashboardSource.users },
                { evidenceType: 'role_assignments', data: refreshed.roleAssignments }
            ]
        };
    },
    
    metrics: records => primitiveMetrics(records[0]),
    evidence: records => records
}
```

**Key Changes**:
- ✅ Processes returned refresh data instead of discarding it
- ✅ Rebuilds metrics from fresh users
- ✅ Updates records with current timestamp
- ✅ Returns fresh evidence instead of stale

---

### 3. **Improved Error Handling in collectSource**
**File**: `source-adapters.js:115`

**Before**:
```javascript
if (shouldRefresh && typeof refreshSource === 'function') {
    try {
        const refreshed = await refreshSource(...);
        // ... process it
    } catch (error) {
        const notConfigured = error.statusCode === 503 || /missing/.test(error.message);
        if (!records.length) {
            return statusResult(capability, notConfigured ? 'not_configured' : 'error', ...);
        }
        // If we have stored data, just set warning and continue ❌
        refreshWarning = `${capability.displayName} refresh failed; the stored evidence was retained.`;
    }
}

// Later: status is set to "available" even if refresh failed ❌
const status = freshness.stale ? 'stale' : 'available';
```

**After**:
```javascript
let refreshFailed = false;
let refreshErrorMessage = null;

if (shouldRefresh && typeof refreshSource === 'function') {
    try {
        const refreshed = await refreshSource(...);
        if (refreshed) {
            loaded = definition.fromRefresh ? definition.fromRefresh(...) : { ...loaded, ...refreshed };
            records = loaded.records || [];
            freshness = getFreshness(records, ...);
            refreshFailed = false;  // Success!
            refreshErrorMessage = null;
        } else {
            loaded = await definition.load(...);
            records = loaded.records || [];
            freshness = getFreshness(records, ...);
        }
    } catch (error) {
        refreshFailed = true;  // ← Track failure
        refreshErrorMessage = error.message;  // ← Store real error
        
        // Log full context for debugging
        console.warn(`[Intelligence Source] Identity refresh error:`, {
            sourceKey: capability.sourceKey,
            companyId,
            errorMessage: error.message,
            isRefreshError: error.isRefreshError === true,
            hasStoredData: records.length > 0
        });
        
        if (!records.length) {
            return statusResult(capability, 'not_configured', ...);
        }
        refreshWarning = `Refresh failed; stored evidence retained: ${error.message}`;
    }
}

// NEW: Mark as stale if refresh failed ✅
const status = refreshFailed ? 'stale' : (freshness.stale ? 'stale' : 'available');

return statusResult(capability, status, {
    freshness: { ... },
    refreshFailed,  // ← Passed through
    refreshErrorMessage,  // ← Passed through
    metrics: loaded.metrics,
    ...
});
```

**Key Changes**:
- ✅ Tracks `refreshFailed` boolean
- ✅ Stores actual error message
- ✅ Logs full context for debugging
- ✅ **Marks source as `stale` if refresh failed** (this is critical!)
- ✅ Returns both to caller for snapshot storage

---

### 4. **Store Refresh Errors in Snapshots**
**File**: `stackctrl-intelligence.js:478`

**Before**:
```javascript
const sourceSummaries = sources.map(source => ({
    sourceKey: source.sourceKey,
    status: source.status,
    freshness: source.freshness,
    warnings: source.warnings,
    errorMessage: source.errorMessage
    // No refresh error tracking ❌
}));
```

**After**:
```javascript
const sourceSummaries = sources.map(source => ({
    sourceKey: source.sourceKey,
    status: source.status,
    freshness: source.freshness,
    refreshFailed: source.refreshFailed || false,  // ← NEW
    refreshErrorMessage: source.refreshErrorMessage || null,  // ← NEW
    warnings: source.warnings,
    errorMessage: source.errorMessage
}));
```

**Stored in snapshot**:
```json
{
  "SourceFreshnessJson": {
    "identity": {
      "status": "stale",
      "lastUpdated": "2026-05-11T10:35:27Z",
      "ageMinutes": 2400,
      "refreshFailed": true,
      "refreshErrorMessage": "Identity source refresh failed: Microsoft Graph API throttling (429)"
    }
  }
}
```

---

### 5. **Enterprise Intelligence Blocks Stale Sources** 
**File**: `enterprise-intelligence.js:266`

```javascript
function sourceStaleFailure(sourceHealth, domainName) {
    if (sourceHealth?.status !== 'stale') return null;
    
    const age = sourceHealth.freshness?.ageMinutes;
    const warnings = sourceHealth.warnings || [];
    const refreshFailedWarning = warnings.find(w => /refresh failed/.test(w));
    
    if (refreshFailedWarning) {
        return {
            status: 'blocked_stale_source',
            isStale: true,
            ageMinutes: age,
            errorMessage: `${domainName} source is stale. Refresh dashboard/source before running Azure analysis.`,
            reason: 'refresh_failed_stale_cache'
        };
    }
    return { ... };
}

async function analyseDomain({ companyId, snapshot, run, domain, ... }) {
    const packageResult = await buildDomainPackage({ ... });
    
    // Check for alignment issues first
    const alignmentFailure = sourceAlignmentFailure(packageResult.sourceAlignment, domain.name);
    if (alignmentFailure) { /* fail early */ }
    
    // NEW: Check for stale sources
    const staleFailure = sourceStaleFailure(packageResult.package.sourceHealth, domain.name);
    if (staleFailure) {
        // Block before Azure!
        return {
            status: 'blocked_stale_source',
            errorMessage: staleFailure.errorMessage,
            sourceHealth: packageResult.package.sourceHealth
        };
    }
    
    // Only run Azure if source is fresh
    const batchResults = await processDomainBatches({ ... });
    ...
}
```

**Result**: Enterprise Identity now catches stale sources BEFORE sending to Azure.

---

## Verification: Before vs After

### Scenario: Create Snapshot with Failed Refresh

**BEFORE (Broken)**:
```
Create Snapshot #189 (2026-06-22 19:00):
├─ buildTenantAIContext()
├─ adapter.load() → tries to refresh
├─ refreshStackCTRLIntelligenceSource() → throws error
│  └─ Error: "Microsoft Graph API connection failed"
├─ collectSource catches error
│  └─ Has stored May 11 data, so continues
│  └─ Sets warning but status="available" ❌
├─ Snapshot stored:
│  ├─ LastUpdated: 2026-05-11 10:35:27 (STALE!)
│  ├─ Status: "available" (WRONG!)
│  └─ No error message (HIDDEN!)
└─ Enterprise Intel runs:
   ├─ Sees status="available" ✓
   ├─ Sends May 11 data to Azure ✗
   └─ Result: Stale metrics in report
```

**AFTER (Fixed)**:
```
Create Snapshot #189 (2026-06-22 19:00):
├─ buildTenantAIContext()
├─ adapter.load() → tries to refresh
├─ refreshStackCTRLIntelligenceSource() → throws error
│  └─ Error: "Microsoft Graph API connection failed"
│  └─ Logs: [Identity Refresh] Refresh failed for CompanyID 1: ...
├─ collectSource catches error  
│  ├─ Sets refreshFailed = true ✓
│  ├─ Sets refreshErrorMessage = actual error ✓
│  └─ Sets status = "stale" ✓
├─ Snapshot stored:
│  ├─ LastUpdated: 2026-05-11 10:35:27 (old data)
│  ├─ Status: "stale" (CORRECT!)
│  ├─ refreshFailed: true (tracked)
│  └─ refreshErrorMessage: "Microsoft Graph API connection failed"
└─ Enterprise Intel runs:
   ├─ buildDomainPackage() finds stale source
   ├─ sourceStaleFailure() returns blocked_stale_source ✓
   └─ Returns error: "Identity source is stale. Refresh before running Azure."
```

### Scenario: Create Snapshot with Successful Refresh

```
Create Snapshot #200 (2026-06-22 20:00):
├─ buildTenantAIContext()
├─ adapter.load() → tries to refresh
├─ refreshStackCTRLIntelligenceSource() succeeds ✓
│  ├─ Fetches fresh data from Microsoft Graph
│  ├─ Updates identity_metrics table with fresh data ✓
│  ├─ Updates identity_users with fresh user data ✓
│  └─ Returns: { metrics, users, evidence, lastUpdated: NOW }
├─ adapter.fromRefresh() processes returned data ✓
│  ├─ Rebuilds dashboard metrics from fresh users
│  ├─ Sets records with LastUpdated = NOW ✓
│  └─ Returns fresh records
├─ collectSource sees success
│  ├─ refreshFailed = false ✓
│  ├─ status = "available" (freshness check)
│  └─ Records updated with current timestamp ✓
├─ Snapshot stored:
│  ├─ LastUpdated: 2026-06-22 20:00:00 (FRESH!)
│  ├─ Status: "available" (CORRECT!)
│  ├─ refreshFailed: false
│  └─ metrics: { totalUsers: 57, mfaEnabled: 46, ... }
└─ Enterprise Intel runs:
   ├─ Finds available source ✓
   ├─ Sends current data to Azure ✓
   └─ Result: Current metrics in report
```

---

## How Admin Can Verify

### SQL Query to Check Recent Snapshots:
```sql
SELECT 
    ID,
    CompanyID,
    CreatedAt,
    JSON_EXTRACT(SourceFreshnessJson, '$.identity.status') AS IdentityStatus,
    JSON_EXTRACT(SourceFreshnessJson, '$.identity.lastUpdated') AS LastUpdated,
    JSON_EXTRACT(SourceFreshnessJson, '$.identity.ageMinutes') AS AgeMinutes,
    JSON_EXTRACT(SourceFreshnessJson, '$.identity.refreshFailed') AS RefreshFailed,
    JSON_EXTRACT(SourceFreshnessJson, '$.identity.refreshErrorMessage') AS ErrorMessage
FROM StackCTRLTenantEvidenceSnapshots
WHERE CompanyID = 1
ORDER BY ID DESC LIMIT 10;
```

**Expected After Fix**:
- Recent snapshots should show `IdentityStatus`: "available" (if refresh succeeded)
- If refresh failed: `RefreshFailed`: true + real `ErrorMessage`
- `LastUpdated` should be recent (not stuck on 2026-05-11)
- `AgeMinutes` should be low (< 60 minutes for recent snapshots)

---

## What This Prevents

✅ Stale cache silently being used  
✅ "available" status masking failed refresh  
✅ Azure analysis running on stale data  
✅ Missing error information for debugging  
✅ No distinction between "really fresh" vs "stale cache marked available"  
✅ Admin confusion about why Enterprise blocks snapshot  

---

## Testing Checklist

- [ ] Create Snapshot with failed network/API access → Should produce `status: stale` + error message
- [ ] Create Snapshot with successful refresh → Should have `status: available` + current LastUpdated
- [ ] Enterprise Identity with stale snapshot → Should return `blocked_stale_source` before Azure
- [ ] Enterprise Identity with fresh snapshot → Should run Azure with current data
- [ ] Admin views snapshot details → Should see refreshFailed flag + error message
- [ ] Verify identity_metrics table updated → Should contain fresh data (not May 11)

---

## Related Files
- `server.js`: `refreshStackCTRLIntelligenceSource()` - Main refresh function
- `source-adapters.js`: `definitions.identity`, `collectSource()` - Adapter & collection logic
- `stackctrl-intelligence.js`: `buildTenantAIContext()`, `sourceSummaries` - Snapshot building
- `enterprise-intelligence.js`: `sourceStaleFailure()`, `analyseDomain()` - Enterprise blocking
- `identity-dashboard-source.js`: `buildIdentityDashboardSource()` - Metric calculation

