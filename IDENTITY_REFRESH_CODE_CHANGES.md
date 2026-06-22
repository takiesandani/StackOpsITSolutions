# Identity Refresh Fix - Code Changes Quick Reference

## 5 Key Files Modified

### 1. `server.js` - Lines 10628-10760
**Function**: `refreshStackCTRLIntelligenceSource()` - identity case

**What Changed**:
- Now returns actual refreshed data instead of `null`
- Updates BOTH `IdentityMetricsCache` AND `identity_metrics` table
- Added try/catch with proper error logging
- Throws `refreshError` with metadata

**Critical Lines**:
```javascript
case 'identity': {
    try {
        const token = await getMicrosoftGraphTokenForCompany(companyId);
        const [metrics, details, roleAssignments] = await Promise.all([...]);
        
        // Update Azure cache
        await pool.query(`REPLACE INTO IdentityMetricsCache ...`);
        
        // NEW: Update Sunbird dashboard tables
        await pool.query(`REPLACE INTO identity_metrics VALUES (?, ?, ...)`, [
            'sunbird', totalUsers, mfaEnabledUsers, ...
        ]);
        
        for (const userRow of userInserts) {
            await pool.query(`REPLACE INTO identity_users ...`, userRow);
        }
        
        // NEW: Return data for fromRefresh handler
        return { metrics, evidence, users, roleAssignments, lastUpdated };
    } catch (error) {
        // NEW: Log real error
        error.isRefreshError = true;
        throw error;
    }
}
```

---

### 2. `services/intelligence/source-adapters.js` - Lines 205-260
**Object**: `definitions.identity` - Added `fromRefresh` handler

**What Changed**:
- Added new `fromRefresh(refreshed, stored)` handler
- Processes refreshed data from `refreshStackCTRLIntelligenceSource`
- Rebuilds metrics with fresh user data
- Returns updated records with current timestamp

**Critical Lines**:
```javascript
identity: {
    table: '...',
    async load(...) { ... },  // Existing
    
    // NEW HANDLER
    fromRefresh(refreshed, stored) {
        if (!refreshed || typeof refreshed !== 'object') {
            return stored;
        }
        const users = refreshed.users || [];
        const roleAssignments = refreshed.roleAssignments || [];
        
        const dashboardSource = buildIdentityDashboardSource({
            metricsRow: {
                total_users: refreshed.metrics?.totalUsers,
                mfa_enabled_users: users.filter(u => u.mfaEnabled).length,
                admin_users: users.filter(u => u.roles?.length > 0).length,
                high_risk_users: users.filter(u => u.riskLevel === 'HIGH').length,
                active_users_24h: users.filter(u => u.lastSignIn?.daysSince <= 1).length
            },
            usersRows: users,
            riskRow: {},
            signInRow: {},
            roleAssignments: roleAssignments
        });
        
        return {
            ...stored,
            records: [{ LastUpdated: refreshed.lastUpdated || new Date().toISOString(), ...refreshed.metrics }],
            metrics: dashboardSource.dashboardMetrics,
            dashboardSourceMetrics: dashboardSource.dashboardMetrics,
            evidence: [
                ...stored.evidence.filter(e => e.evidenceType === 'tenant'),
                { evidenceType: 'users', data: dashboardSource.users },
                { evidenceType: 'role_assignments', data: roleAssignments }
            ]
        };
    },
    
    metrics: records => primitiveMetrics(records[0]),
    evidence: records => records
}
```

---

### 3. `services/intelligence/source-adapters.js` - Lines 115-185
**Function**: `collectSource()` - Enhanced error handling

**What Changed**:
- Now tracks `refreshFailed` boolean and `refreshErrorMessage`
- Logs full context when refresh fails
- **Marks source as `stale` if refresh failed** (critical!)
- Returns both flags through to caller

**Critical Lines**:
```javascript
async function collectSource(context, definition) {
    // ... setup code ...
    
    let refreshFailed = false;
    let refreshErrorMessage = null;
    
    if (shouldRefresh && typeof refreshSource === 'function') {
        try {
            const refreshed = await refreshSource(capability.sourceKey, companyId);
            if (refreshed) {
                loaded = definition.fromRefresh
                    ? definition.fromRefresh(refreshed, loaded)
                    : { ...loaded, ...refreshed };
                records = loaded.records || [];
                freshness = getFreshness(records, capability.freshnessThresholdMinutes);
                refreshFailed = false;
                refreshErrorMessage = null;
            } else {
                loaded = await definition.load(pool, companyId, capability);
                records = loaded.records || [];
                freshness = getFreshness(records, capability.freshnessThresholdMinutes);
            }
        } catch (error) {
            // NEW: Track failure
            refreshFailed = true;
            refreshErrorMessage = error.message;
            
            // NEW: Log context
            console.warn(`[Intelligence Source] ${capability.displayName} refresh error:`, {
                sourceKey: capability.sourceKey,
                companyId,
                errorMessage: error.message,
                isRefreshError: error.isRefreshError === true,
                notConfigured: error.statusCode === 503,
                hasStoredData: records.length > 0
            });
            
            if (!records.length) {
                return statusResult(capability, notConfigured ? 'not_configured' : 'error', {
                    warnings: [
                        ...(supplementalLoadWarning ? [supplementalLoadWarning] : []),
                        `${capability.displayName} refresh failed: ${error.message}`
                    ],
                    errorMessage: error.message
                });
            }
            
            refreshWarning = `${capability.displayName} refresh failed; the stored evidence was retained: ${error.message}`;
        }
    }
    
    // ... records check ...
    
    // NEW: Mark as stale if refresh failed
    const status = refreshFailed ? 'stale' : (freshness.stale ? 'stale' : 'available');
    
    const warnings = [...(loaded.warnings || [])];
    if (supplementalLoadWarning) warnings.push(supplementalLoadWarning);
    if (freshness.stale) warnings.push(`${capability.displayName} evidence is stale.`);
    if (refreshWarning) warnings.push(refreshWarning);
    
    return statusResult(capability, status, {
        freshness: {
            lastUpdated: freshness.lastUpdated,
            ageMinutes: freshness.ageMinutes
        },
        refreshFailed,  // NEW
        refreshErrorMessage,  // NEW
        metrics: loaded.metrics || definition.metrics(records),
        dashboardSourceMetrics: loaded.dashboardSourceMetrics || null,
        sourceLineage: loaded.sourceLineage || null,
        evidence: loaded.evidence || definition.evidence(records),
        warnings,
        rawReference: loaded.rawReference || {
            table: definition.table || null,
            recordId: records[0]?.ID || records[0]?.id || null
        }
    });
}
```

---

### 4. `services/stackctrl-intelligence.js` - Lines 476-495
**Function**: `buildTenantAIContext()` - sourceSummaries mapping

**What Changed**:
- Added `refreshFailed` and `refreshErrorMessage` to snapshot storage
- These are stored in `SourceFreshnessJson` for admin inspection

**Critical Lines**:
```javascript
const sourceSummaries = sources.map(source => ({
    sourceKey: source.sourceKey,
    displayName: source.displayName,
    status: source.status,
    isExpected: source.isExpected,
    freshness: source.freshness,
    refreshFailed: source.refreshFailed || false,  // NEW
    refreshErrorMessage: source.refreshErrorMessage || null,  // NEW
    metrics: source.metrics,
    dashboardMetrics: source.dashboardMetrics,
    calculatedIndicators: source.calculatedIndicators,
    evidence: source.evidence,
    evidenceCount: source.evidence.length,
    chartsData: source.chartsData,
    warnings: source.warnings,
    sourceReferences: source.sourceReferences,
    sourceLineage: source.sourceLineage,
    rawReference: source.rawReference,
    errorMessage: source.errorMessage
}));
```

---

### 5. `services/enterprise-intelligence.js` - Lines 266-290
**Function**: `sourceStaleFailure()` and `analyseDomain()` - Already implemented in Phase 1

**What This Does**:
- Detects stale sources before Azure analysis
- Returns `blocked_stale_source` status
- Prevents Azure from running with stale data

**Critical Lines**:
```javascript
function sourceStaleFailure(sourceHealth, domainName) {
    if (sourceHealth?.status !== 'stale') return null;
    
    const age = sourceHealth.freshness?.ageMinutes || 0;
    const warnings = sourceHealth.warnings || [];
    const refreshFailedWarning = warnings.find(w => /refresh failed/.test(w));
    
    if (refreshFailedWarning) {
        const hoursOld = Math.floor(age / 60);
        const minutesOld = age % 60;
        return {
            status: 'blocked_stale_source',
            isStale: true,
            ageMinutes: age,
            ageLabel: `${hoursOld} hour(s) ${minutesOld} minute(s)`,
            errorMessage: `${domainName} source is stale (${hoursOld} hours old). Refresh ${domainName.toLowerCase()} dashboard/source before running Azure analysis.`,
            reason: 'refresh_failed_stale_cache'
        };
    }
    // ... other stale conditions ...
}

async function analyseDomain({ companyId, snapshot, run, domain, capability, ... }) {
    // ... get domain package ...
    const packageResult = buildDomainPackage({ ... });
    
    // Check alignment first
    const alignmentFailure = sourceAlignmentFailure(packageResult.sourceAlignment, domain.name);
    if (alignmentFailure) {
        return { status: 'alignment_failure', ... };
    }
    
    // NEW: Check for stale sources BEFORE Azure
    const staleFailure = sourceStaleFailure(packageResult.package.sourceHealth, domain.name);
    if (staleFailure) {
        return {
            status: 'blocked_stale_source',
            errorMessage: staleFailure.errorMessage,
            sourceHealth: packageResult.package.sourceHealth
        };
    }
    
    // Now safe to run Azure
    const batchResults = await processDomainBatches({ ... });
    // ...
}
```

---

## Data Flow After Fix

### Snapshot Creation (Happy Path):
```
createSnapshot()
  └─> buildTenantAIContext(refresh=true)
      └─> collectSource('identity')
          └─> adapter.load() → identity_metrics (May 11 stale data)
          └─> shouldRefresh = true
          └─> refreshSource('identity', companyId)
              └─> refreshStackCTRLIntelligenceSource()
                  ├─> Fetch from Microsoft Graph ✓
                  ├─> Update IdentityMetricsCache ✓
                  ├─> Update identity_metrics table ✓ (NEW)
                  ├─> Update identity_users table ✓ (NEW)
                  └─> Return { metrics, users, ... } ✓ (NEW)
          └─> adapter.fromRefresh() processes returned data ✓ (NEW)
          └─> Records updated with current timestamp ✓ (NEW)
          └─> Snapshot stored with status="available" ✓
```

### Snapshot Creation (Failure Path - Old Bug):
```
❌ BEFORE:
refreshStackCTRLIntelligenceSource() → returned null
└─> adapter had no fromRefresh handler
    └─> collectSource reloaded old data
        └─> Snapshot stored with stale data + status="available" ❌

✅ AFTER:
refreshStackCTRLIntelligenceSource() → throws error
└─> collectSource catches it
    ├─> Sets refreshFailed = true ✓
    ├─> Sets status = "stale" ✓ (NEW)
    ├─> Logs error message ✓ (NEW)
    └─> Snapshot stored with status="stale" + errorMessage ✓

analyseDomain()
└─> sourceStaleFailure() detects stale status
    └─> Returns blocked_stale_source ✓
    └─> Azure never runs ✓
```

---

## Verification Points

1. **Refresh Success**: `identity_metrics` table should have fresh data with current timestamp
2. **Refresh Failure**: `SourceFreshnessJson` should contain real error message + `refreshFailed: true`
3. **Status Tracking**: Source status should be "available" or "stale", never "available" with stale data
4. **Enterprise Blocking**: Enterprise should block with `blocked_stale_source` when source is stale
5. **Error Visibility**: Admin can see `refreshErrorMessage` in snapshot details

---

## Implementation Notes

- **No breaking changes**: All changes are additive or error handling improvements
- **Backward compatible**: Existing code paths still work, refresh errors are now properly handled
- **No hard-coded values**: All metrics calculated from fresh data
- **Compact Mode unchanged**: No changes to Azure analysis
- **Power BI API unchanged**: No changes to reporting pipeline

