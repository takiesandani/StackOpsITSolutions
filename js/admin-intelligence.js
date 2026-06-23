(() => {
    const state = {
        token: localStorage.getItem('authToken'),
        system: null,
        tenants: [],
        tenant: null,
        enterprise: null,
        enterpriseRunView: localStorage.getItem('stackctrlEnterpriseRunView') || 'latest',
        enterpriseStatusFilter: localStorage.getItem('stackctrlEnterpriseStatusFilter') || 'all',
        enterpriseSelectedDomain: null,
        selectedCompanyId: Number(localStorage.getItem('stackctrlAdminIntelligenceCompanyId') || 0),
        actionRunning: false,
        lastAction: null,
        headerResizeObserver: null
    };

    const outputTypes = [
        'executive_summary', 'overall_risk_score', 'risk_level', 'governance_assessment',
        'compliance_review', 'risk_register', 'recommendations', 'trend_analysis',
        'board_report', 'powerbi_summary'
    ];

    // All 10 supported enterprise domains for Sunbird tenant profile
    const supportedEnterpriseDomains = [
        { key: 'identity', name: 'Identity Protection' },
        { key: 'devices', name: 'Device Protection' },
        { key: 'email_security', name: 'Email Security' },
        { key: 'cloudflare_network_security', name: 'Network Security / Cloudflare' },
        { key: 'governance', name: 'Governance' },
        { key: 'compliance', name: 'Compliance Validation' },
        { key: 'security_alerts', name: 'Security Alerts' },
        { key: 'operations', name: 'Operations' },
        { key: 'backup', name: 'Backup and Recovery' },
        { key: 'applications', name: 'Applications' }
    ];
    const enterpriseAuditDefaultTitle = 'Enterprise evidence and output audit';

    function enterpriseDomainDisplayName(domainKey, domainRow) {
        if (!domainKey) return enterpriseAuditDefaultTitle;
        return supportedEnterpriseDomains.find(domain => domain.key === domainKey)?.name
            || domainRow?.DomainName
            || String(domainKey).replaceAll('_', ' ');
    }

    function parseEnterpriseRunModeDomainKey(mode) {
        const value = String(mode || '').trim();
        if (!value.startsWith('enterprise_domain_')) return null;
        const domainKey = value.slice('enterprise_domain_'.length);
        return supportedEnterpriseDomains.some(domain => domain.key === domainKey) ? domainKey : null;
    }

    function resolveEnterprisePrimaryDomain({ domainRows = [], audits = [], selectedDomain = null, latestRun = null } = {}) {
        const combined = [...domainRows, ...audits];
        const latestRunId = latestRun?.ID ? Number(latestRun.ID) : null;
        const isMultiDomainRun = latestRun?.Mode === 'enterprise_deep_reporting'
            || (latestRunId && new Set(combined.filter(row => Number(row.RunID) === latestRunId).map(row => row.DomainKey)).size > 1);

        if (selectedDomain?.domainKey && latestRunId && Number(selectedDomain.runId) === latestRunId) {
            const selectedRow = combined.find(row =>
                row.DomainKey === selectedDomain.domainKey &&
                Number(row.RunID) === latestRunId
            );
            if (selectedRow) {
                return {
                    domainKey: selectedRow.DomainKey,
                    domainName: enterpriseDomainDisplayName(selectedRow.DomainKey, selectedRow),
                    row: selectedRow,
                    isMultiDomainRun
                };
            }
        }

        if (isMultiDomainRun) {
            return { domainKey: null, domainName: 'Enterprise Deep Reporting', row: null, isMultiDomainRun: true };
        }

        const runDomainKey = parseEnterpriseRunModeDomainKey(latestRun?.Mode);
        if (runDomainKey) {
            const row = (latestRunId
                ? combined.find(item => item.DomainKey === runDomainKey && Number(item.RunID) === latestRunId)
                : null) || combined.find(item => item.DomainKey === runDomainKey);
            return {
                domainKey: runDomainKey,
                domainName: enterpriseDomainDisplayName(runDomainKey, row),
                row: row || null,
                isMultiDomainRun: false
            };
        }
        const displayedRows = domainRows.length ? domainRows : audits;
        const domainKeys = [...new Set(displayedRows.map(row => row.DomainKey).filter(Boolean))];
        if (domainKeys.length === 1) {
            const domainKey = domainKeys[0];
            const row = displayedRows.find(item => item.DomainKey === domainKey);
            return { domainKey, domainName: enterpriseDomainDisplayName(domainKey, row), row: row || null, isMultiDomainRun: false };
        }
        return { domainKey: null, domainName: enterpriseAuditDefaultTitle, row: null, isMultiDomainRun: false };
    }

    function updateEnterpriseAuditHeading(primaryDomain, fallbackRun = null, pipeline = null) {
        if (primaryDomain?.isMultiDomainRun) {
            const progress = pipeline || fallbackRun?.ProgressJson || {};
            const counts = progress.counts || {};
            const total = counts.total || supportedEnterpriseDomains.length;
            const successful = counts.successful ?? counts.completed ?? 0;
            const failed = counts.failed || 0;
            const blocked = counts.blocked || 0;
            const skipped = counts.skipped || 0;
            el('enterprise-audit-title').textContent = 'Enterprise Deep Reporting';
            el('enterprise-audit-subtitle').textContent = `Run #${number(fallbackRun?.ID || progress.runId || 0)} · ${statusLabel(fallbackRun?.Status || progress.phase || 'unknown')} · ${number(successful)} successful · ${number(failed)} failed · ${number(blocked)} blocked · ${number(skipped)} skipped · ${number(counts.processed || 0)} / ${number(total)} domains processed`;
            return;
        }
        const domainName = primaryDomain?.domainKey ? primaryDomain.domainName : enterpriseAuditDefaultTitle;
        const row = primaryDomain?.row || null;
        el('enterprise-audit-title').textContent = domainName;
        el('enterprise-audit-subtitle').textContent = primaryDomain?.domainKey
            ? `${domainName} · Run #${number(row?.RunID || fallbackRun?.ID || 0)} · ${statusLabel(row?.Status || fallbackRun?.Status || 'unknown')} · Proof of what StackCTRL held, what Azure received, and what structured intelligence was stored`
            : 'Proof of what StackCTRL held, what Azure received, and what structured intelligence was stored';
    }

    function selectEnterpriseDomain(row) {
        if (!row?.DomainKey || !row?.RunID) {
            state.enterpriseSelectedDomain = null;
            return;
        }
        state.enterpriseSelectedDomain = { domainKey: row.DomainKey, runId: Number(row.RunID) };
        updateEnterpriseAuditHeading({
            domainKey: row.DomainKey,
            domainName: enterpriseDomainDisplayName(row.DomainKey, row),
            row,
            isMultiDomainRun: false
        }, null, null);
    }

    function syncIntelligenceHeaderOffset() {
        const header = document.querySelector('.intelligence-header');
        const height = Math.ceil(header?.getBoundingClientRect().height || 80);
        document.documentElement.style.setProperty('--intel-header-height', `${height}px`);
    }

    const el = id => document.getElementById(id);

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    }

    function decodeToken(token) {
        try {
            const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(decodeURIComponent(atob(encoded).split('').map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
        } catch (_) {
            return {};
        }
    }

    function redirectToSignIn() {
        localStorage.removeItem('authToken');
        window.location.replace('/signin.html');
    }

    function redirectUnauthorized() {
        window.location.replace('/ClientPortal.html');
    }

    function statusClass(status) {
        return String(status || 'muted').toLowerCase().replace(/[^a-z0-9_]/g, '');
    }

    function statusBadge(status) {
        const value = status || 'unknown';
        return `<span class="status-badge status-${statusClass(value)}">${escapeHtml(String(value).replaceAll('_', ' '))}</span>`;
    }

    function isFailureStatus(status) {
        return String(status || '').startsWith('failed');
    }

    function enterpriseStatusRank(status) {
        const value = statusClass(status);
        if (isFailureStatus(value)) return 0;
        if (value === 'partial' || value === 'completed_with_warnings') return 1;
        if (value === 'running' || value === 'queued') return 2;
        if (value === 'completed') return 3;
        return 4;
    }

    function statusLabel(status) {
        return String(status || 'unknown').replaceAll('_', ' ');
    }

    function number(value) {
        const numeric = Number(value || 0);
        return Number.isFinite(numeric) ? numeric.toLocaleString() : '0';
    }

    function bytes(value) {
        const numeric = Number(value || 0);
        if (!numeric) return '—';
        if (numeric < 1024) return `${numeric} B`;
        if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`;
        return `${(numeric / 1024 / 1024).toFixed(2)} MB`;
    }

    function minutesFromMs(value) {
        const numeric = Number(value || 0);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        return Math.max(1, Math.ceil(numeric / 60000));
    }

    function dateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    }

    function shortDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function arrayValue(value) {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        try { return JSON.parse(value); } catch (_) { return []; }
    }

    function formatDisplayValue(value, fallback = '—') {
        if (value === null || value === undefined || value === '') return fallback;
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed || trimmed === '[object Object]') return fallback;
            return trimmed;
        }
        if (Array.isArray(value)) {
            if (!value.length) return '[]';
            if (value.every(item => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
                return value.map(item => formatDisplayValue(item, '')).filter(Boolean).join(', ');
            }
            try { return JSON.stringify(value); } catch (_) { return fallback; }
        }
        if (typeof value === 'object') {
            try {
                const entries = Object.entries(value);
                if (!entries.length) return '{}';
                if (entries.every(([, nested]) => nested === null || ['string', 'number', 'boolean'].includes(typeof nested))) {
                    return entries.map(([key, nested]) => `${key}: ${formatDisplayValue(nested, '')}`).join(' · ');
                }
                return JSON.stringify(value);
            } catch (_) {
                return fallback;
            }
        }
        return String(value);
    }

    function formatLineageCell(value, fallback = '—') {
        const formatted = formatDisplayValue(value, fallback);
        return formatted.length > 220 ? `${formatted.slice(0, 217)}...` : formatted;
    }

    function lineageValue(value, fallback = '—') {
        return formatLineageCell(value, fallback);
    }

    function openJsonModal({ label, title, subtitle, payload }) {
        el('json-modal-label').textContent = label || 'Stored Azure output';
        el('json-modal-title').textContent = title || 'Output JSON';
        el('json-modal-subtitle').textContent = subtitle || '';
        const content = el('json-modal-content');
        content.textContent = typeof payload === 'string'
            ? payload
            : JSON.stringify(payload ?? {}, null, 2);
        document.body.classList.add('json-modal-open');
        el('json-modal').classList.add('open');
        el('json-modal').setAttribute('aria-hidden', 'false');
        content.scrollTop = 0;
        requestAnimationFrame(() => { content.scrollTop = 0; });
    }

    function batchDetailsHtml(batches) {
        if (!batches.length) return '<div class="enterprise-batch-empty">No batch details stored for this domain.</div>';
        return `<details class="enterprise-batch-details"><summary>Batches · ${number(batches.filter(batch => batch.Status === 'completed').length)} / ${number(batches.length)} completed</summary><div>${batches.map(batch => {
            const repaired = batch.BatchSummaryJson?.jsonRepaired ? 'yes' : 'no';
            const retryMinutes = minutesFromMs(batch.BatchSummaryJson?.recommendedRetryAfterMs);
            return `<section><header><strong>Batch ${number(batch.BatchNumber)}</strong>${statusBadge(batch.Status)}</header><div class="enterprise-domain-meta"><span>Items ${number(batch.BatchItemCount)}</span><span>Input size ${bytes(batch.InputSizeBytes)}</span><span>Input tokens ${number(batch.InputTokens)}</span><span>Output tokens ${number(batch.OutputTokens)}</span><span>Retries ${number(batch.RetryCount)}</span><span>Finish ${escapeHtml(batch.AzureFinishReason || '—')}</span><span>JSON repaired ${repaired}</span>${retryMinutes ? `<span>Retry after ${number(retryMinutes)} min</span>` : ''}</div>${batch.ErrorMessage ? `<p class="enterprise-error">${escapeHtml(batch.ErrorMessage)}</p>` : ''}</section>`;
        }).join('')}</div></details>`;
    }

    function rateLimitGuidance(row, batches = []) {
        if (row?.Status !== 'failed_rate_limited' && !batches.some(batch => batch.Status === 'failed_rate_limited')) return '';
        const retryMs = batches.map(batch => batch.BatchSummaryJson?.recommendedRetryAfterMs).find(Boolean);
        const retryMinutes = minutesFromMs(retryMs);
        return `<div class="enterprise-error">Azure rate limit reached. Wait before retrying. Do not run full enterprise report yet.${retryMinutes ? ` Recommended retry after: ${number(retryMinutes)} minutes.` : ''}</div>`;
    }

    async function api(path, options = {}) {
        const response = await fetch(path, {
            ...options,
            headers: {
                Authorization: `Bearer ${state.token}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        let data;
        try { data = await response.json(); } catch (_) { data = {}; }
        if (response.status === 401) {
            redirectToSignIn();
            throw new Error('Administrator access is required');
        }
        if (response.status === 403) {
            redirectUnauthorized();
            throw new Error('Administrator access is required');
        }
        if (!response.ok || data.success === false) throw new Error(data.message || `Request failed (${response.status})`);
        return data;
    }

    function toast(message, type = 'success') {
        const item = document.createElement('div');
        item.className = `intel-toast ${type}`;
        item.textContent = message;
        el('toast-stack').appendChild(item);
        setTimeout(() => item.remove(), 5000);
    }

    function renderSystem() {
        const system = state.system || {};
        const azure = system.azure || {};
        const latest = system.latestRun || {};
        const cells = [
            ['Azure endpoint', azure.endpointConfigured ? 'Configured' : 'Not configured', azure.authenticationMode || 'No authentication mode'],
            ['Deployment', azure.deployment || '—', azure.region || 'Region unavailable'],
            ['API / model version', azure.apiVersion || 'v1', azure.modelVersion || 'Model version unavailable'],
            ['Latest successful run', system.latestSuccessfulRun ? `#${system.latestSuccessfulRun.ID}` : 'None', dateTime(system.latestSuccessfulRun?.CompletedAt)],
            ['Latest failed run', system.latestFailedRun ? `#${system.latestFailedRun.ID}` : 'None', dateTime(system.latestFailedRun?.CompletedAt)],
            ['Current run state', latest.Status || 'Idle', latest.ID ? `Run #${latest.ID} · ${number(system.lastRetryCount)} retries` : 'No recorded run'],
            ['Rate limits today', number(system.usage?.RateLimitedRunsToday), `${number(system.usage?.CurrentRateLimitedRuns)} currently waiting`],
            ['Server automation', system.serverAutomation?.enabled ? 'Enabled' : 'Disabled', system.serverAutomation?.running ? 'Tick running now' : 'No active tick'],
            ['Latest error', system.latestErrorMessage || 'No active errors', system.latestFailedRun?.ID ? `Failed run #${system.latestFailedRun.ID}` : 'Bridge healthy']
        ];
        el('system-status-grid').innerHTML = cells.map(([label, value, detail]) => `
            <div class="system-cell"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>
        `).join('');

        const usage = system.usage || {};
        const usageTiles = [
            ['Runs today', usage.TotalRunsToday, 'All analysis runs'],
            ['Completed', usage.CompletedRunsToday, 'Successful'],
            ['Failed', usage.FailedRunsToday, 'Needs review'],
            ['Rate limited', usage.RateLimitedRunsToday, 'Retried today'],
            ['Input tokens', usage.InputTokensToday, 'Azure usage'],
            ['Output tokens', usage.OutputTokensToday, 'Azure usage'],
            ['Total tokens', usage.TotalTokensToday, `${bytes(usage.AverageRequestSize)} avg request`]
        ];
        el('azure-usage-metrics').innerHTML = usageTiles.map(([label, value, detail]) => `
            <article class="metric-tile"><span>${escapeHtml(label)}</span><strong>${number(value)}</strong><small>${escapeHtml(detail)}</small></article>
        `).join('');
    }

    function renderTenantSelector() {
        const selector = el('tenant-selector');
        if (!state.tenants.length) {
            selector.innerHTML = '<option value="">No tenants available</option>';
            return;
        }
        if (!state.tenants.some(tenant => Number(tenant.companyId) === state.selectedCompanyId)) {
            state.selectedCompanyId = Number(state.tenants[0].companyId);
        }
        selector.innerHTML = state.tenants.map(tenant => `
            <option value="${Number(tenant.companyId)}" ${Number(tenant.companyId) === state.selectedCompanyId ? 'selected' : ''}>${escapeHtml(tenant.companyName)} · Company ${Number(tenant.companyId)}</option>
        `).join('');
    }

    function renderTenantIdentity() {
        const company = state.tenant?.company;
        if (!company) {
            el('tenant-identity').textContent = 'Select a tenant to inspect its intelligence flow.';
            return;
        }
        el('tenant-identity').textContent = `CompanyID ${company.companyId} · ${company.tenantKey} · ${company.capabilities.profileKey} profile · ${company.capabilities.expectedSources} expected sources`;
    }

    function renderBridge() {
        const tenant = state.tenant || {};
        const snapshot = tenant.latestSnapshot;
        const latestRun = tenant.runs?.[0];
        const stages = {
            collection: {
                state: tenant.sourceStatuses?.length ? `${snapshot?.availableSources || 0}/${snapshot?.expectedSources || 0} sources` : 'No evidence',
                tone: tenant.sourceStatuses?.length ? (snapshot?.missingSources ? 'warn' : 'good') : 'bad'
            },
            snapshot: { state: snapshot ? `Snapshot #${snapshot.ID}` : 'Not created', tone: snapshot ? 'good' : 'bad' },
            azure: {
                state: latestRun?.Status ? String(latestRun.Status).replaceAll('_', ' ') : 'No run',
                tone: latestRun?.Status === 'completed' ? 'good' : latestRun?.Status === 'rate_limited' || latestRun?.Status === 'processing' ? 'warn' : latestRun ? 'bad' : ''
            },
            storage: { state: tenant.outputs?.length ? `${tenant.outputs.length} outputs` : 'Empty', tone: tenant.outputs?.length ? 'good' : 'bad' }
        };
        document.querySelectorAll('.bridge-stage').forEach(stage => {
            const config = stages[stage.dataset.stage];
            stage.classList.remove('is-good', 'is-warn', 'is-bad');
            if (config?.tone) stage.classList.add(`is-${config.tone}`);
            stage.querySelector('.stage-state').textContent = config?.state || '—';
        });
        el('bridge-updated').textContent = snapshot ? `Snapshot captured ${dateTime(snapshot.CreatedAt)}` : 'No snapshot available';
    }

    function renderSnapshot() {
        const snapshot = state.tenant?.latestSnapshot;
        if (!snapshot) {
            el('snapshot-badge').className = 'status-badge status-muted';
            el('snapshot-badge').textContent = 'No snapshot';
            el('snapshot-summary').innerHTML = '<div class="empty-state">Create the first tenant snapshot to begin.</div>';
            return;
        }
        el('snapshot-badge').className = 'status-badge status-available';
        el('snapshot-badge').textContent = `Snapshot #${snapshot.ID}`;
        const items = [
            ['Snapshot ID', snapshot.ID, snapshot.SnapshotType],
            ['Company ID', snapshot.CompanyID, state.tenant.company.companyName],
            ['Created', shortDateTime(snapshot.CreatedAt), snapshot.TenantKey],
            ['Completeness', `${Number(snapshot.DataCompletenessScore || 0).toFixed(1)}%`, bytes(snapshot.ContextSizeBytes)],
            ['Expected', snapshot.expectedSources, 'Tenant capability profile'],
            ['Available', snapshot.availableSources, 'Available or stale'],
            ['Missing', snapshot.missingSources, 'Missing / error / unconfigured'],
            ['Stale', snapshot.staleSources, 'Outside freshness target'],
            ['Not expected', snapshot.notExpectedSources, 'Excluded for this tenant']
        ];
        el('snapshot-summary').innerHTML = items.map(([label, value, detail]) => `
            <div class="snapshot-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>
        `).join('');
    }

    function renderPayloadComparison() {
        const compact = state.tenant?.compactContexts?.[0];
        const snapshot = state.tenant?.latestSnapshot;
        const badge = el('payload-mode-badge');
        if (!compact || !snapshot) {
            badge.className = 'status-badge status-muted';
            badge.textContent = 'No compact context';
            el('payload-comparison').innerHTML = '<div class="empty-state">Build a compact context to compare payload size and historical coverage.</div>';
            return;
        }
        badge.className = 'status-badge status-available';
        badge.textContent = `${compact.PeriodType || 'snapshot'} compact`;
        const availability = state.tenant?.historicalAvailability || {};
        const historical = [
            ['Previous', availability.previous?.availability],
            ['24h', availability['24_hours']?.availability],
            ['7d', availability['7_days']?.availability],
            ['30d', availability['30_days']?.availability],
            ['90d', availability['90_days']?.availability]
        ];
        const historyHtml = historical.map(([label, availability]) =>
            `<span class="history-pill ${availability === 'available' ? 'available' : ''}">${escapeHtml(label)} · ${escapeHtml(availability || 'unavailable')}</span>`
        ).join('');
        el('payload-comparison').innerHTML = `
            <div class="payload-stat"><span>Full snapshot</span><strong>${bytes(compact.FullContextSizeBytes)}</strong><small>Retained permanently by StackCTRL</small></div>
            <div class="payload-stat"><span>Compact Azure package</span><strong>${bytes(compact.CompactContextSizeBytes)}</strong><small>Processed metrics and ranked evidence</small></div>
            <div class="payload-stat is-reduction"><span>Payload reduction</span><strong>${compact.ReductionPercentage == null ? '—' : `${Number(compact.ReductionPercentage).toFixed(1)}%`}</strong><small>Raw vendor lists remain outside Azure</small></div>
            <div class="payload-stat"><span>Evidence selection</span><strong>${number(compact.EvidenceIncludedCount)} in</strong><small>${number(compact.EvidenceOmittedCount)} aggregated or omitted</small></div>
            <div class="payload-stat"><span>Historical coverage</span><div class="history-coverage">${historyHtml}</div><small>Every available horizon is included as compact deltas</small></div>
        `;
    }

    function renderSources() {
        const sources = state.tenant?.sourceStatuses || [];
        el('source-health-summary').textContent = sources.length ? `${sources.length} source adapters recorded` : '';
        el('source-health-body').innerHTML = sources.length ? sources.map(source => `
            <tr>
                <td><div class="source-name"><strong>${escapeHtml(source.DisplayName || source.SourceKey)}</strong><span>${escapeHtml(source.SourceKey)}</span></div></td>
                <td>${statusBadge(source.Status)}</td>
                <td>${Number(source.IsExpected) === 1 ? 'Yes' : 'No'}</td>
                <td>${number(source.EvidenceCount)}</td>
                <td>${escapeHtml(shortDateTime(source.LastUpdated))}</td>
                <td>${source.AgeMinutes == null ? '—' : `${number(source.AgeMinutes)} min`}</td>
                <td class="cell-error" title="${escapeHtml(source.ErrorMessage || '')}">${escapeHtml(source.ErrorMessage || '—')}</td>
            </tr>
        `).join('') : '<tr><td colspan="7" class="empty-cell">No source status rows are available.</td></tr>';
    }

    function renderRuns() {
        const runs = state.tenant?.runs || [];
        el('run-history-body').innerHTML = runs.length ? runs.map(run => {
            const requested = arrayValue(run.RequestedOutputTypes);
            return `<tr>
                <td><strong>#${number(run.ID)}</strong><br><small>Company ${number(run.CompanyID)}</small></td>
                <td>${run.SnapshotID ? `#${number(run.SnapshotID)}` : '—'}</td>
                <td>${statusBadge(run.Status)}</td>
                <td title="${escapeHtml(requested.join(', '))}">${requested.length ? `${requested.length} types` : '—'}</td>
                <td>${escapeHtml(shortDateTime(run.StartedAt || run.CreatedAt))}</td>
                <td>${escapeHtml(shortDateTime(run.CompletedAt))}</td>
                <td>${number(run.RetryCount)}</td>
                <td>${bytes(run.RequestSizeBytes)}</td>
                <td>${bytes(run.ResponseSizeBytes)}</td>
                <td>${number(run.InputTokens)}</td>
                <td>${number(run.OutputTokens)}</td>
                <td>${number(run.TotalTokens)}</td>
                <td><div class="run-model"><strong>${escapeHtml(run.ModelName || '—')}</strong><span>${escapeHtml(run.AzureDeployment || '—')}</span></div></td>
                <td class="cell-error" title="${escapeHtml(run.ErrorMessage || '')}">${escapeHtml(run.ErrorMessage || '—')}</td>
            </tr>`;
        }).join('') : '<tr><td colspan="14" class="empty-cell">No Azure analysis runs are stored for this tenant.</td></tr>';
    }

    function renderPeriods() {
        const periods = state.tenant?.periods || [];
        el('period-history-body').innerHTML = periods.length ? periods.map(period => `
            <tr>
                <td><strong>${escapeHtml(period.PeriodType || '—')}</strong><br><small>#${number(period.ID)}</small></td>
                <td>${escapeHtml(new Date(period.PeriodStart).toLocaleDateString())}<br><small>to ${escapeHtml(new Date(period.PeriodEnd).toLocaleDateString())}</small></td>
                <td>${statusBadge(period.Status)}</td>
                <td>${period.RiskScore == null ? '—' : Number(period.RiskScore).toFixed(1)}<br><small>${escapeHtml(period.RiskLevel || '—')}</small></td>
                <td>${period.MaturityScore == null ? '—' : Number(period.MaturityScore).toFixed(1)}</td>
                <td>${period.IdentityHealth == null ? '—' : Number(period.IdentityHealth).toFixed(1)}</td>
                <td>${period.DeviceHealth == null ? '—' : Number(period.DeviceHealth).toFixed(1)}</td>
                <td>${period.EmailHealth == null ? '—' : Number(period.EmailHealth).toFixed(1)}</td>
                <td>${period.GovernanceHealth == null ? '—' : Number(period.GovernanceHealth).toFixed(1)}</td>
                <td>${period.ComplianceHealth == null ? '—' : Number(period.ComplianceHealth).toFixed(1)}</td>
                <td>${escapeHtml(period.TopRisk || '—')}</td>
                <td>${escapeHtml(period.TopRecommendation || '—')}</td>
            </tr>
        `).join('') : '<tr><td colspan="12" class="empty-cell">No daily, weekly, monthly, or yearly intelligence rows have been generated.</td></tr>';
    }

    function summaryText(content) {
        if (!content) return null;
        if (typeof content === 'string') return content;
        const direct = content.summary || content.executiveSummary || content.executive_summary ||
            content.overview || content.reportSummary || content.board_summary || content.narrative;
        if (direct) return typeof direct === 'string' ? direct : summaryText(direct);
        const narratives = [];
        function collect(value, depth = 0) {
            if (depth > 4 || narratives.length >= 4 || value == null) return;
            if (typeof value === 'string' && value.length > 35) narratives.push(value);
            else if (Array.isArray(value)) value.slice(0, 5).forEach(item => collect(item, depth + 1));
            else if (typeof value === 'object') Object.values(value).slice(0, 20).forEach(item => collect(item, depth + 1));
        }
        collect(content);
        return narratives.join(' ') || null;
    }

    function valueFrom(object, keys, fallback = null) {
        for (const key of keys) {
            if (object?.[key] !== undefined && object?.[key] !== null && object?.[key] !== '') return object[key];
        }
        return fallback;
    }

    function listFrom(object, keys) {
        const value = valueFrom(object, keys, []);
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return Object.entries(value).map(([title, detail]) => ({ title, detail }));
        return value ? [value] : [];
    }

    function readableItem(item) {
        if (typeof item === 'string') return item;
        return item?.title || item?.name || item?.risk || item?.decision || item?.action ||
            item?.recommendation || item?.detail || item?.description || JSON.stringify(item);
    }

    function readableValue(value, fallback = 'Not provided by Azure.') {
        if (value == null || value === '') return fallback;
        if (typeof value === 'string' || typeof value === 'number') return String(value);
        if (Array.isArray(value)) return value.map(readableItem).join(' ');
        return summaryText(value) || readableItem(value) || fallback;
    }

    function resultList(items, emptyText, limit = 5) {
        const values = (Array.isArray(items) ? items : []).slice(0, limit);
        if (!values.length) return `<div class="result-empty">${escapeHtml(emptyText)}</div>`;
        return `<ul class="result-bullet-list">${values.map(item => `<li>${escapeHtml(readableItem(item))}</li>`).join('')}</ul>`;
    }

    function intelligenceRowsForOutput(rows, output) {
        if (!output) return [];
        return (rows || []).filter(row => Number(row.AIOutputID) === Number(output.ID));
    }

    function renderLatestSummary() {
        const outputs = state.tenant?.outputs || [];
        const runs = state.tenant?.runs || [];
        const latestCompletedRun = runs.find(run => run.Status === 'completed');
        const completedSnapshotId = Number(latestCompletedRun?.SnapshotID || 0);
        const latestOf = type => outputs.find(output =>
            output.OutputType === type && (!completedSnapshotId || Number(output.SnapshotID) === completedSnapshotId)
        ) || outputs.find(output => output.OutputType === type);
        const executive = latestOf('executive_summary');
        const board = latestOf('board_report');
        const riskOutput = latestOf('risk_register');
        const recommendationOutput = latestOf('recommendations');
        const trendOutput = latestOf('trend_analysis');
        const powerbiOutput = latestOf('powerbi_summary');
        const executiveContent = executive?.ContentJson || {};
        const boardContent = board?.ContentJson || {};
        const powerbi = powerbiOutput?.ContentJson || {};
        const period = state.tenant?.periods?.find(item => item.Status === 'completed');
        const risks = intelligenceRowsForOutput(state.tenant?.risks, riskOutput).slice(0, 5);
        const recommendations = intelligenceRowsForOutput(state.tenant?.recommendations, recommendationOutput).slice(0, 5);
        const trends = intelligenceRowsForOutput(state.tenant?.trends, trendOutput);
        const compact = state.tenant?.compactContexts?.[0] || {};
        const readiness = state.tenant?.powerBIReadiness || [];
        const proofBadge = el('intelligence-proof-badge');
        if (!executive && !board && !period && !latestCompletedRun) {
            proofBadge.className = 'status-badge status-muted';
            proofBadge.textContent = 'Waiting for compact test';
            el('latest-intelligence-summary').innerHTML = '<div class="empty-state">Run compact analysis to populate the latest intelligence summary.</div>';
            return;
        }

        proofBadge.className = 'status-badge status-completed';
        proofBadge.textContent = 'Azure + storage verified';
        const businessImpact = valueFrom(executiveContent, ['businessImpact', 'business_impact', 'impact']) ||
            risks[0]?.BusinessImpact || 'Business impact is represented in the stored risk register below.';
        const managementAttention = valueFrom(executiveContent, ['managementAttentionRequired', 'management_attention_required', 'managementAttention', 'attention_required']) ||
            recommendations[0]?.RecommendationDetail || recommendations[0]?.BusinessReason || 'Management should review the highest-priority recommendations.';
        const confidence = executive?.ConfidenceScore ?? valueFrom(executiveContent, ['confidenceScore', 'confidence_score', 'confidence']);
        const boardRisks = listFrom(boardContent, ['topBoardRisks', 'top_board_risks', 'topRisks', 'top_risks', 'keyRisks', 'key_risks']);
        const decisions = listFrom(boardContent, ['decisionsRequired', 'decisions_required', 'actions_required', 'boardDecisions']);
        const next30 = listFrom(boardContent, ['next30DaysFocus', 'next_30_days_focus', 'next30Days', 'focus_30_days']);
        const next90 = listFrom(boardContent, ['next90DaysFocus', 'next_90_days_focus', 'next90Days', 'focus_90_days']);
        const improved = trends.filter(item => /improv|positive|up/i.test(item.Direction || ''));
        const deteriorated = trends.filter(item => /declin|deterior|worsen|negative|down/i.test(item.Direction || ''));
        const stable = trends.filter(item => /stable|same|unchanged|flat/i.test(item.Direction || ''));
        const readinessLabels = {
            StackCTRLTenantAIOutputs: 'AI outputs',
            StackCTRLTenantRiskRegister: 'Risk register',
            StackCTRLTenantRecommendations: 'Recommendations',
            StackCTRLTenantTrendAnalysis: 'Trends',
            StackCTRLIntelligencePeriods: 'Period intelligence row',
            StackCTRLIntelligenceMetrics: 'Metrics',
            StackCTRLIntelligenceSourceStatus: 'Source status'
        };
        const readinessRows = Object.entries(readinessLabels).map(([tableName, label]) => {
            const row = readiness.find(item => item.tableName === tableName);
            const ready = Boolean(row?.available && Number(row.RecordCount || 0) > 0);
            return `<li><span>${escapeHtml(label)}</span><b class="${ready ? 'is-ready' : 'is-missing'}"><i class="fas ${ready ? 'fa-check' : 'fa-minus'}"></i>${ready ? `${number(row.RecordCount)} stored` : 'Not stored'}</b></li>`;
        }).join('');
        const requestTokens = latestCompletedRun?.InputTokens;
        const responseTokens = latestCompletedRun?.OutputTokens;
        const totalTokens = latestCompletedRun?.TotalTokens;
        const reduction = compact.ReductionPercentage;

        el('latest-intelligence-summary').innerHTML = `
            <div class="intelligence-proof-banner"><i class="fas fa-circle-check"></i><div><strong>Compact Azure Intelligence Completed Successfully</strong><span>Snapshot #${number(latestCompletedRun?.SnapshotID || compact.SnapshotID)} · Run #${number(latestCompletedRun?.ID)} · ${escapeHtml(shortDateTime(latestCompletedRun?.CompletedAt))}</span></div></div>

            <article class="intelligence-result-card executive-result">
                <header><span class="result-icon"><i class="fas fa-file-lines"></i></span><div><small>01 · Azure generated</small><h3>Executive Summary</h3></div>${confidence == null ? '' : `<b class="confidence-chip">${escapeHtml(confidence)} confidence</b>`}</header>
                <p class="result-lead">${escapeHtml(summaryText(executiveContent) || period?.ExecutiveSummary || 'Azure returned structured intelligence without a narrative summary field.')}</p>
                <div class="result-facts"><div><span>Business impact</span><p>${escapeHtml(readableValue(businessImpact))}</p></div><div><span>Management attention required</span><p>${escapeHtml(readableValue(managementAttention))}</p></div></div>
            </article>

            <article class="intelligence-result-card board-result">
                <header><span class="result-icon"><i class="fas fa-briefcase"></i></span><div><small>02 · Board view</small><h3>Board Report</h3></div></header>
                <p class="result-lead">${escapeHtml(summaryText(boardContent) || 'No board-level narrative was returned in the latest output.')}</p>
                <div class="board-detail-grid"><div><span>Top board risks</span>${resultList(boardRisks.length ? boardRisks : risks.map(item => item.RiskTitle), 'No board risks returned.')}</div><div><span>Decisions required</span>${resultList(decisions, 'No explicit board decisions returned.')}</div><div><span>Next 30 days</span>${resultList(next30.length ? next30 : recommendations.slice(0, 3).map(item => item.RecommendationTitle), 'No 30-day focus returned.', 3)}</div><div><span>Next 90 days</span>${resultList(next90.length ? next90 : recommendations.slice(3, 5).map(item => item.RecommendationTitle), 'No 90-day focus returned.', 3)}</div></div>
            </article>

            <article class="intelligence-result-card risk-result">
                <header><span class="result-icon"><i class="fas fa-shield-halved"></i></span><div><small>03 · Risk engine</small><h3>Risk Summary</h3></div></header>
                <div class="risk-score-row"><div><span>Overall risk</span><strong>${escapeHtml(powerbi.risk_score ?? period?.RiskScore ?? '—')}</strong></div><div><span>Risk level</span><strong>${escapeHtml(powerbi.risk_level || period?.RiskLevel || '—')}</strong></div><div><span>Maturity</span><strong>${escapeHtml(powerbi.security_maturity_score ?? period?.MaturityScore ?? '—')}</strong></div></div>
                <div class="ranked-result-list">${risks.length ? risks.map((risk, index) => `<div><b>${index + 1}</b><span><strong>${escapeHtml(risk.RiskTitle)}</strong><small>${escapeHtml(risk.Domain || 'General')}</small></span>${statusBadge(risk.Severity || 'unknown')}</div>`).join('') : '<div class="result-empty">No normalized risks were stored.</div>'}</div>
            </article>

            <article class="intelligence-result-card recommendation-result">
                <header><span class="result-icon"><i class="fas fa-list-check"></i></span><div><small>04 · Action plan</small><h3>Recommendations</h3></div></header>
                <div class="recommendation-result-list">${recommendations.length ? recommendations.map(item => `<div><header><strong>${escapeHtml(item.RecommendationTitle)}</strong>${statusBadge(item.Priority || 'unprioritized')}</header><p>${escapeHtml(item.BusinessReason || item.RecommendationDetail || 'No business reason returned.')}</p><small><i class="fas fa-user"></i>${escapeHtml(item.SuggestedOwner || 'Owner not assigned')}<i class="fas fa-calendar"></i>${escapeHtml(item.SuggestedDueDate ? new Date(item.SuggestedDueDate).toLocaleDateString() : 'No due date')}</small></div>`).join('') : '<div class="result-empty">No normalized recommendations were stored.</div>'}</div>
            </article>

            <article class="intelligence-result-card trend-result">
                <header><span class="result-icon"><i class="fas fa-arrow-trend-up"></i></span><div><small>05 · Historical intelligence</small><h3>Trend / Historical Summary</h3></div></header>
                ${trends.length ? `<div class="trend-columns"><div class="improved"><span>Improved</span>${resultList(improved.map(item => `${item.MetricName}: ${item.Explanation || item.Direction}`), 'Nothing recorded as improved.')}</div><div class="deteriorated"><span>Deteriorated</span>${resultList(deteriorated.map(item => `${item.MetricName}: ${item.Explanation || item.Direction}`), 'Nothing recorded as deteriorated.')}</div><div class="stable"><span>Stayed the same</span>${resultList(stable.map(item => `${item.MetricName}: ${item.Explanation || item.Direction}`), 'Nothing recorded as stable.')}</div></div>` : '<div class="historical-empty"><i class="fas fa-clock-rotate-left"></i><span>Historical comparison is not available yet.</span></div>'}
            </article>

            <article class="intelligence-result-card readiness-result">
                <header><span class="result-icon"><i class="fas fa-chart-column"></i></span><div><small>06 · Storage proof</small><h3>Power BI Readiness</h3></div></header>
                <ul class="proof-checklist">${readinessRows}</ul>
            </article>

            <article class="intelligence-result-card diagnostics-result">
                <header><span class="result-icon"><i class="fas fa-gauge-high"></i></span><div><small>07 · Request telemetry</small><h3>Payload / Azure Diagnostics</h3></div>${statusBadge(latestCompletedRun?.Status || 'unknown')}</header>
                <div class="diagnostic-grid"><div><span>Full snapshot</span><strong>${bytes(compact.FullContextSizeBytes)}</strong></div><div><span>Compact package</span><strong>${bytes(compact.CompactContextSizeBytes)}</strong></div><div><span>Reduction</span><strong>${reduction == null ? '—' : `${Number(reduction).toFixed(1)}%`}</strong></div><div><span>Azure request</span><strong>${bytes(latestCompletedRun?.RequestSizeBytes)}</strong></div><div><span>Azure response</span><strong>${bytes(latestCompletedRun?.ResponseSizeBytes)}</strong></div><div><span>Input tokens</span><strong>${number(requestTokens)}</strong></div><div><span>Output tokens</span><strong>${number(responseTokens)}</strong></div><div><span>Total tokens</span><strong>${number(totalTokens)}</strong></div><div><span>Retries</span><strong>${number(latestCompletedRun?.RetryCount)}</strong></div></div>
            </article>
        `;
    }

    function renderOutputs() {
        const outputs = state.tenant?.outputs || [];
        el('ai-output-list').innerHTML = outputs.length ? outputs.slice(0, 18).map((output, index) => `
            <article class="output-row">
                <div><h3>${escapeHtml(output.Title || output.OutputType)}</h3><p>${escapeHtml(output.OutputType)} · ${escapeHtml(output.PromptVersion || 'No prompt version')} · ${escapeHtml(shortDateTime(output.CreatedAt))}</p></div>
                ${statusBadge(output.Status)}
                <button type="button" class="output-open" data-output-index="${index}">View JSON</button>
            </article>
        `).join('') : '<div class="empty-state">No AI outputs have been stored for this tenant.</div>';
    }

    function renderReadiness() {
        const rows = state.tenant?.powerBIReadiness || [];
        el('powerbi-readiness').innerHTML = rows.length ? rows.map(row => `
            <article class="readiness-row">
                <div><strong>${escapeHtml(row.tableName)}</strong><span>${row.available ? `Latest: ${dateTime(row.LatestUpdatedAt)}` : 'Table unavailable'}</span></div>
                <b class="readiness-count">${number(row.RecordCount)}</b>
            </article>
        `).join('') : '<div class="empty-state">No Power BI readiness information is available.</div>';
    }

    function previewCard(title, meta, detail, footer = '') {
        return `<article class="preview-card"><header><strong>${escapeHtml(title)}</strong>${meta ? statusBadge(meta) : ''}</header><p>${escapeHtml(detail || 'No detail recorded.')}</p>${footer ? `<small>${escapeHtml(footer)}</small>` : ''}</article>`;
    }

    function renderPreviews() {
        const tenant = state.tenant || {};
        el('risk-preview').innerHTML = tenant.risks?.length ? tenant.risks.slice(0, 6).map(risk =>
            previewCard(risk.RiskTitle, risk.Severity, risk.BusinessImpact || risk.RiskDescription, `${risk.Domain || 'General'} · ${risk.Recommendation || 'Recommendation pending'}`)
        ).join('') : '<div class="empty-state">No risks stored.</div>';
        el('recommendation-preview').innerHTML = tenant.recommendations?.length ? tenant.recommendations.slice(0, 6).map(item =>
            previewCard(item.RecommendationTitle, item.Priority, item.RecommendationDetail || item.BusinessReason, `${item.SuggestedOwner || 'Owner unassigned'} · ${item.SuggestedDueDate ? new Date(item.SuggestedDueDate).toLocaleDateString() : 'No due date'}`)
        ).join('') : '<div class="empty-state">No recommendations stored.</div>';
        el('trend-preview').innerHTML = tenant.trends?.length ? tenant.trends.slice(0, 6).map(item =>
            previewCard(item.MetricName, item.Direction, item.Explanation, `${item.PreviousValue ?? '—'} → ${item.CurrentValue ?? '—'} · ${item.ChangePercent == null ? 'No percentage' : `${item.ChangePercent}%`}`)
        ).join('') : '<div class="empty-state">No trends stored.</div>';
    }

    function renderTenant() {
        renderTenantIdentity();
        renderBridge();
        renderSnapshot();
        renderPayloadComparison();
        renderSources();
        renderRuns();
        renderPeriods();
        renderOutputs();
        renderReadiness();
        renderPreviews();
        renderLatestSummary();
    }

    function renderEnterprisePipelineProgress(latestRun, enterprise = {}) {
        const container = el('enterprise-pipeline-progress');
        if (!container) return;
        if (!latestRun) {
            container.innerHTML = '<div class="empty-state">Run or load Enterprise Deep Reporting to see the full pipeline status.</div>';
            return;
        }

        const progress = latestRun.ProgressJson || {};
        const counts = progress.counts || {};
        const totalDomains = counts.total || supportedEnterpriseDomains.length;
        const audits = (enterprise.evidenceAudit || []).filter(row => Number(row.RunID) === Number(latestRun.ID));
        const domainRows = (enterprise.domainIntelligence || []).filter(row => Number(row.RunID) === Number(latestRun.ID));
        const synthesis = (enterprise.synthesis || []).find(row => Number(row.RunID) === Number(latestRun.ID)) || null;
        const queue = Array.isArray(progress.domainQueue) && progress.domainQueue.length
            ? progress.domainQueue
            : supportedEnterpriseDomains.map(domain => {
                const stored = domainRows.find(row => row.DomainKey === domain.key) || audits.find(row => row.DomainKey === domain.key);
                return {
                    domainKey: domain.key,
                    domainName: domain.name,
                    status: stored?.Status || 'queued',
                    errorMessage: stored?.ErrorMessage || null
                };
            });
        const currentDomainName = progress.currentDomainName
            || (progress.currentDomainKey ? enterpriseDomainDisplayName(progress.currentDomainKey) : null);
        const rateLimitMinutes = minutesFromMs(progress.rateLimit?.retryAfterMs);
        const reportReady = Boolean(synthesis) && ['completed', 'completed_with_warnings'].includes(String(synthesis.Status || ''));
        const snapshotFreshness = progress.snapshotCreatedAt ? dateTime(progress.snapshotCreatedAt) : dateTime(latestRun.StartedAt);
        const completedCount = counts.successful ?? queue.filter(item => item.status === 'completed').length;
        const failedCount = counts.failed ?? queue.filter(item => String(item.status || '').startsWith('failed')).length;
        const blockedCount = counts.blocked ?? queue.filter(item => String(item.status || '').startsWith('blocked')).length;
        const skippedCount = counts.skipped ?? queue.filter(item => /skipped/.test(String(item.status || ''))).length;
        const synthesisStatus = progress.synthesisStatus || (synthesis ? synthesis.Status : (latestRun.Status === 'running' ? 'pending' : 'not_started'));

        container.innerHTML = `
            <div class="enterprise-pipeline-grid">
                <div><span>Full run status</span><strong>${escapeHtml(statusLabel(latestRun.Status))}</strong></div>
                <div><span>Current domain</span><strong>${escapeHtml(currentDomainName || (latestRun.Status === 'running' ? 'Starting…' : '—'))}</strong></div>
                <div><span>Domains completed</span><strong>${number(completedCount)} / ${number(totalDomains)}</strong></div>
                <div><span>Failed / blocked / skipped</span><strong>${number(failedCount)} / ${number(blockedCount)} / ${number(skippedCount)}</strong></div>
                <div><span>Snapshot ID</span><strong>#${number(latestRun.SnapshotID || progress.snapshotId)}</strong></div>
                <div><span>Evidence freshness</span><strong>${escapeHtml(snapshotFreshness)}</strong></div>
                <div><span>Synthesis status</span><strong>${escapeHtml(statusLabel(synthesisStatus))}</strong></div>
                <div><span>Final report ready</span><strong class="${reportReady ? 'is-ready' : 'is-missing'}">${reportReady ? 'Yes' : 'No'}</strong></div>
            </div>
            ${progress.rateLimit?.active || latestRun.Status === 'failed_rate_limited' ? `<div class="enterprise-error">Azure cooldown active${rateLimitMinutes ? ` · retry after ${number(rateLimitMinutes)} minute(s)` : ''}${progress.rateLimit?.domainKey ? ` · stopped at ${escapeHtml(enterpriseDomainDisplayName(progress.rateLimit.domainKey))}` : ''}</div>` : ''}
            <div class="enterprise-pipeline-queue">
                ${queue.map(item => {
                    const audit = audits.find(row => row.DomainKey === item.domainKey);
                    return `<div class="enterprise-pipeline-domain ${statusClass(item.status)}"><div><strong>${escapeHtml(item.domainName || enterpriseDomainDisplayName(item.domainKey))}</strong><small>${escapeHtml(item.domainKey)}</small></div><div class="enterprise-pipeline-domain-meta"><span>${statusBadge(item.status)}</span><span>StackCTRL ${number(audit?.StackCTRLDataCount)}</span><span>Prepared ${number(audit?.EvidenceIncludedCount ?? audit?.StackCTRLDataCount)}</span><span>Analysed ${number(audit?.SentToAzureCount)}</span><span>Omitted ${number(audit?.OmittedCount)}</span></div>${item.errorMessage ? `<p class="enterprise-error">${escapeHtml(item.errorMessage)}</p>` : ''}</div>`;
                }).join('')}
            </div>
        `;
    }

    function renderEnterprise() {
        const enterprise = state.enterprise || {};
        const runs = enterprise.runs || [];
        const latestRun = runs[0];
        const latestRunId = latestRun?.ID;
        const showLatestOnly = state.enterpriseRunView !== 'history';
        const statusFilter = state.enterpriseStatusFilter || 'all';
        const filterByRun = row => !showLatestOnly || !latestRunId || Number(row.RunID) === Number(latestRunId);
        const filterByStatus = row => {
            if (statusFilter === 'failed') return isFailureStatus(row.Status) || row.Status === 'partial' || row.Status === 'completed_with_warnings';
            if (statusFilter === 'completed') return row.Status === 'completed';
            return true;
        };
        const audits = (enterprise.evidenceAudit || []).filter(row => filterByRun(row) && filterByStatus(row));
        const domainRows = (enterprise.domainIntelligence || [])
            .filter(row => filterByRun(row) && filterByStatus(row))
            .sort((a, b) => (Number(b.RunID) - Number(a.RunID)) || (enterpriseStatusRank(a.Status) - enterpriseStatusRank(b.Status)) || (Number(b.ID) - Number(a.ID)));
        const synthesisRows = (enterprise.synthesis || []).filter(row => filterByRun(row));
        const batchRows = (enterprise.batches || []).filter(row => filterByRun(row));
        const batchesByDomainRun = batchRows.reduce((map, batch) => {
            const key = `${batch.RunID}:${batch.DomainKey}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(batch);
            return map;
        }, new Map());
        const visibleRows = [...domainRows, ...audits];
        if (state.enterpriseSelectedDomain && !visibleRows.some(row =>
            row.DomainKey === state.enterpriseSelectedDomain.domainKey &&
            Number(row.RunID) === Number(state.enterpriseSelectedDomain.runId)
        )) state.enterpriseSelectedDomain = null;
        const primaryDomain = resolveEnterprisePrimaryDomain({
            domainRows,
            audits,
            selectedDomain: state.enterpriseSelectedDomain,
            latestRun
        });
        state.enterprisePrimaryDomain = primaryDomain;
        renderEnterprisePipelineProgress(latestRun, enterprise);
        updateEnterpriseAuditHeading(primaryDomain, latestRun, latestRun?.ProgressJson || null);
        const badge = el('enterprise-run-badge');
        badge.className = `status-badge status-${statusClass(latestRun?.Status || 'muted')}`;
        badge.textContent = latestRun ? `Run #${number(latestRun.ID)} · ${statusLabel(latestRun.Status)}` : 'No enterprise run';
        el('enterprise-audit-summary').textContent = latestRun ? `${showLatestOnly ? 'Latest run' : 'All runs'} · ${audits.length} audit row(s) · ${domainRows.length} domain row(s)` : 'No enterprise data stored';

        document.querySelectorAll('[data-enterprise-run-view]').forEach(button => button.classList.toggle('active', button.dataset.enterpriseRunView === state.enterpriseRunView));
        document.querySelectorAll('[data-enterprise-status-filter]').forEach(button => button.classList.toggle('active', button.dataset.enterpriseStatusFilter === state.enterpriseStatusFilter));

        if (latestRun) {
            const latestRunDomains = (enterprise.domainIntelligence || []).filter(row => Number(row.RunID) === Number(latestRun.ID));
            const completedDomains = latestRunDomains.filter(row => row.Status === 'completed').length;
            const completedBatches = (enterprise.batches || []).filter(row => Number(row.RunID) === Number(latestRun.ID) && row.Status === 'completed').length;
            const totalBatches = (enterprise.batches || []).filter(row => Number(row.RunID) === Number(latestRun.ID)).length;
            const currentDomain = primaryDomain.domainKey
                ? latestRunDomains.find(row => row.DomainKey === primaryDomain.domainKey) || primaryDomain.row
                : latestRunDomains.find(row => row.Status === 'running' || row.Status === 'queued') || latestRunDomains.find(row => row.Status !== 'completed');
            const summary = [
                ['Run', `#${number(latestRun.ID)}`],
                ['Snapshot', `#${number(latestRun.SnapshotID)}`],
                ['Status', statusLabel(latestRun.Status)],
                ['Mode', latestRun.Mode || '—'],
                ['Period', latestRun.PeriodType || '—'],
                ['Current domain', primaryDomain.domainKey ? primaryDomain.domainName : (currentDomain?.DomainName || currentDomain?.DomainKey || '—')],
                ['Domains', `${number(completedDomains)} / ${number(latestRunDomains.length || supportedEnterpriseDomains.length)}`],
                ['Batches', `${number(completedBatches)} / ${number(totalBatches)}`],
                ['Input tokens', number(latestRun.TotalInputTokens)],
                ['Output tokens', number(latestRun.TotalOutputTokens)],
                ['Retries', number(latestRun.RetryCount)]
            ];
            el('enterprise-run-summary').innerHTML = summary.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
        } else {
            el('enterprise-run-summary').innerHTML = '<div class="empty-state">No enterprise run has been stored.</div>';
        }

        el('enterprise-audit-body').innerHTML = audits.length ? audits.map(row => {
            const domainBatches = batchesByDomainRun.get(`${row.RunID}:${row.DomainKey}`) || [];
            const completed = domainBatches.filter(batch => batch.Status === 'completed').length;
            const failed = domainBatches.filter(batch => isFailureStatus(batch.Status)).length;
            const totalItems = Number(row.EvidenceIncludedCount ?? row.StackCTRLDataCount ?? 0);
            const completedItems = domainBatches.filter(batch => batch.Status === 'completed').reduce((total, batch) => total + Number(batch.BatchItemCount || 0), 0);
            const remaining = Math.max(0, totalItems - completedItems);
            return `<tr><td><button type="button" class="output-open" data-enterprise-audit-index="${(enterprise.evidenceAudit || []).indexOf(row)}">${escapeHtml(enterpriseDomainDisplayName(row.DomainKey, row))}</button><small>${escapeHtml(row.DomainKey)} · Run #${number(row.RunID)} · Snapshot #${number(row.SnapshotID)} · ${dateTime(row.CreatedAt)}</small>${rateLimitGuidance(row, domainBatches)}</td><td>${number(row.StackCTRLDataCount)}</td><td>${number(row.EvidenceIncludedCount ?? row.StackCTRLDataCount)}</td><td>${number(row.SentToAzureCount)}</td><td>${number(row.OmittedCount)}</td><td>${number(domainBatches[0]?.BatchCount || domainBatches.length)}</td><td>${number(completed)}</td><td>${number(failed)}</td><td>${number(remaining)}</td><td>${number(row.InputTokens)}</td><td>${number(row.OutputTokens)}</td><td>${number(row.RetryCount)}</td><td>${statusBadge(row.Status)}</td></tr>`;
        }).join('') : '<tr><td colspan="13" class="empty-cell">No enterprise evidence audit rows match the current filters.</td></tr>';

        const lineageDomain = primaryDomain.domainKey
            ? domainRows.find(row => row.DomainKey === primaryDomain.domainKey) || null
            : domainRows[0] || null;
        const lineageAudit = primaryDomain.domainKey
            ? audits.find(row => row.DomainKey === primaryDomain.domainKey) || null
            : audits.find(row =>
                (!lineageDomain || row.DomainKey === lineageDomain.DomainKey) &&
                (!lineageDomain || Number(row.RunID) === Number(lineageDomain.RunID))
            ) || audits[0] || null;
        const storedLineageRows = arrayValue(lineageDomain?.AnalysisJson?.dataLineageComparison);
        const lineageMetadata = lineageAudit?.AzureInputSummaryJson?.dataLineage || {};
        const inputLineageRows = arrayValue(lineageMetadata.rows);
        const lineageRows = storedLineageRows.length ? storedLineageRows : inputLineageRows;
        el('enterprise-lineage-summary').textContent = lineageAudit
            ? `${enterpriseDomainDisplayName(lineageAudit.DomainKey, lineageDomain)} · ${lineageMetadata.sourceBuilder || 'dashboardContext'} · Run #${number(lineageAudit.RunID)} · Snapshot #${number(lineageAudit.SnapshotID)} · Source updated ${dateTime(lineageMetadata.sourceLastUpdated)}`
            : 'No source lineage metadata loaded.';
        el('enterprise-lineage-body').innerHTML = lineageRows.length ? lineageRows.map(row => `
            <tr><td>${escapeHtml(row.metric)}</td><td>${escapeHtml(lineageValue(row.stackCTRLSource))}</td><td>${escapeHtml(lineageValue(row.enterpriseAzureInput))}</td><td>${escapeHtml(lineageValue(row.azureOutput, row.azureOutputStatus || 'NOT_APPLICABLE'))}</td><td>${escapeHtml(lineageValue(row.storedIntelligence, 'NOT_APPLICABLE'))}</td><td>${statusBadge(row.status || 'MISSING')}</td></tr>
        `).join('') : '<tr><td colspan="6" class="empty-cell">No run-scoped lineage comparison loaded.</td></tr>';

        el('enterprise-domain-results').innerHTML = domainRows.length ? domainRows.slice(0, 20).map(row => `
            <div class="enterprise-result-item ${isFailureStatus(row.Status) ? 'is-failed' : ''}"><header><strong>${escapeHtml(row.DomainName || row.DomainKey)}</strong>${statusBadge(row.Status)}</header><p>${escapeHtml(row.DomainExecutiveSummary || row.ErrorMessage || 'No domain executive summary returned.')}</p>${row.ErrorMessage ? `<div class="enterprise-error">${escapeHtml(row.ErrorMessage)}</div>` : ''}${rateLimitGuidance(row, batchesByDomainRun.get(`${row.RunID}:${row.DomainKey}`) || [])}<div class="enterprise-domain-meta"><span>Run #${number(row.RunID)}</span><span>Snapshot #${number(row.SnapshotID)}</span><span>Health ${escapeHtml(row.HealthScore ?? '—')}</span><span>Risk ${escapeHtml(row.RiskScore ?? '—')}</span><span>Total StackCTRL Data ${number((enterprise.evidenceAudit || []).find(audit => audit.RunID === row.RunID && audit.DomainKey === row.DomainKey)?.StackCTRLDataCount)}</span><span>Prepared for Azure ${number((enterprise.evidenceAudit || []).find(audit => audit.RunID === row.RunID && audit.DomainKey === row.DomainKey)?.EvidenceIncludedCount)}</span><span>Successfully Analysed ${number((enterprise.evidenceAudit || []).find(audit => audit.RunID === row.RunID && audit.DomainKey === row.DomainKey)?.SentToAzureCount)}</span><span>Permanently Omitted ${number((enterprise.evidenceAudit || []).find(audit => audit.RunID === row.RunID && audit.DomainKey === row.DomainKey)?.OmittedCount)}</span><span>Input ${number(row.InputTokens)}</span><span>Output ${number(row.OutputTokens)}</span><span>Created ${dateTime(row.CreatedAt)}</span></div>${batchDetailsHtml(batchesByDomainRun.get(`${row.RunID}:${row.DomainKey}`) || [])}<button type="button" class="output-open" data-enterprise-domain-index="${(enterprise.domainIntelligence || []).indexOf(row)}">View Azure output</button>${isFailureStatus(row.Status) ? `<button type="button" class="output-open" data-retry-domain="${escapeHtml(row.DomainKey)}">Retry failed domain</button>` : ''}</div>
        `).join('') : '<div class="empty-state">No stored domain intelligence loaded.</div>';

        const synthesis = synthesisRows[0];
        const executiveSummary = summaryText(synthesis?.ExecutiveSummaryJson || {});
        const boardSummary = summaryText(synthesis?.BoardReportJson || {});
        el('enterprise-synthesis-result').innerHTML = synthesis ? `
            <div class="enterprise-result-item"><header><strong>Enterprise executive summary</strong>${statusBadge(synthesis.Status)}</header><p>${escapeHtml(executiveSummary || 'Structured synthesis stored without a summary text field.')}</p></div>
            <div class="enterprise-result-item"><header><strong>Board-level summary</strong></header><p>${escapeHtml(boardSummary || 'No board summary text was returned.')}</p></div>
            <div class="enterprise-result-item"><header><strong>Power BI readiness</strong></header><p>Domain rows, findings, risks, recommendations, trends, actions, evidence audit and synthesis are stored for the reporting API.</p><small>${number(synthesis.TotalTokens)} synthesis tokens · ${bytes(synthesis.InputSizeBytes)} request</small><button type="button" class="output-open" data-enterprise-synthesis>View synthesis output</button></div>
        ` : '<div class="empty-state">No final enterprise synthesis loaded.</div>';

        // renderEnterprise() now focuses on rendering enterprise data only
        // Domain dropdown population moved to populateDomainDropdown() for independence from this function
    }

    function populateDomainDropdown() {
        // Populate domain dropdown immediately from static list (independent of loadEnterprise)
        const selector = el('enterprise-domain-selector');
        if (!selector) return;
        const currentValue = selector.value;
        selector.innerHTML = supportedEnterpriseDomains.map(domain => `<option value="${escapeHtml(domain.key)}">${escapeHtml(domain.name)}</option>`).join('');
        // Restore selection if it still exists in updated list
        if (supportedEnterpriseDomains.some(domain => domain.key === currentValue)) selector.value = currentValue;
    }

    async function loadEnterprise({ scroll = false } = {}) {
        state.enterprise = await api(`/api/admin/intelligence/tenant/${state.selectedCompanyId}/enterprise`);
        renderEnterprise();
        if (scroll) {
            // Keep the run/domain heading visible; scrolling to a nested lineage table hides it behind the fixed header.
            el('enterprise-audit-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function enterpriseActionMessage(label, result) {
        const status = result?.status || 'completed';
        const failedDomain = (result?.domains || []).find(domain => isFailureStatus(domain.status));
        const partialDomain = (result?.domains || []).find(domain => domain.status === 'partial' || domain.status === 'completed_with_warnings');
        const snapshotText = result?.snapshotId ? ` · Snapshot #${number(result.snapshotId)}` : '';
        const runText = result?.runId ? ` · Run #${number(result.runId)}` : '';
        if (isFailureStatus(status) || failedDomain) {
            return { className: 'action-status is-error', toastType: 'error', text: `${label} failed${runText}${snapshotText}: ${failedDomain?.errorMessage || result?.message || statusLabel(status)}` };
        }
        if (status === 'partial' || status === 'completed_with_warnings' || partialDomain) {
            const detail = partialDomain?.errorMessage ? ` ${partialDomain.errorMessage}` : '';
            return { className: 'action-status is-warning', toastType: 'error', text: `${label} completed with warnings${runText}${snapshotText}.${detail}` };
        }
        return { className: 'action-status is-success', toastType: 'success', text: `${label} completed successfully${runText}${snapshotText}.` };
    }

    function isEnterpriseActionLabel(label) {
        return /Enterprise|Domain Deep|Retry failed domain/i.test(label || '');
    }

    async function loadTenant() {
        if (!state.selectedCompanyId) return;
        state.tenant = await api(`/api/admin/intelligence/tenant/${state.selectedCompanyId}`);
        renderTenant();
    }

    async function loadAll({ quiet = false } = {}) {
        const refreshIcon = el('refresh-control-center')?.querySelector('i');
        if (!quiet) refreshIcon?.classList.add('is-spinning');
        try {
            const [system, tenantResult] = await Promise.all([
                api('/api/admin/intelligence/status'),
                state.tenants.length ? Promise.resolve({ tenants: state.tenants }) : api('/api/admin/intelligence/tenants')
            ]);
            state.system = system;
            state.tenants = tenantResult.tenants || [];
            renderSystem();
            renderTenantSelector();
            await loadTenant();
            document.body.classList.remove('is-guarded');
        } finally {
            refreshIcon?.classList.remove('is-spinning');
        }
    }

    async function runAction(button, label, path, body = {}) {
        if (state.actionRunning || !state.selectedCompanyId) return;
        state.actionRunning = true;
        const isFullEnterpriseRun = /Enterprise Deep Report|Enterprise Domain Deep Analysis/i.test(label || '');
        if (isFullEnterpriseRun) state.enterpriseSelectedDomain = null;
        const buttons = [
            'create-snapshot', 'build-compact-context', 'run-analysis',
            'run-full-snapshot-analysis', 'run-full-test'
        ].map(el).filter(Boolean).concat(Array.from(document.querySelectorAll('[data-period-run], .enterprise-action')));
        buttons.forEach(item => { item.disabled = true; });
        button.classList.add('is-loading');
        button.querySelector('.control-icon i')?.classList.add('is-spinning');
        const status = el('action-status');
        status.className = 'action-status is-running';
        status.textContent = `${label} is running. Azure rate-limit retries can keep this request open for several minutes.`;
        let enterprisePollTimer = null;
        if (isEnterpriseActionLabel(label)) {
            enterprisePollTimer = setInterval(() => {
                loadEnterprise().catch(() => {});
            }, 15000);
        }
        try {
            const result = await api(path, { method: 'POST', body: JSON.stringify(body) });
            state.lastAction = result;
            const completedSnapshotId = result.snapshotId || result.analysis?.snapshotId || result.period?.SnapshotID;
            const payload = result.payloadComparison || result.compactContext;
            if (isEnterpriseActionLabel(label)) {
                const message = enterpriseActionMessage(label, result);
                status.className = message.className;
                status.textContent = message.text;
                toast(message.text, message.toastType === 'error' ? 'error' : 'success');
            } else {
                status.className = 'action-status is-success';
                status.textContent = label === 'Compact Azure analysis'
                    ? `Compact Azure Intelligence Completed Successfully${completedSnapshotId ? ` · Snapshot #${completedSnapshotId}` : ''}${payload?.compactContextSizeBytes ? ` · Azure package ${bytes(payload.compactContextSizeBytes)}` : ''}.`
                    : `${label} completed successfully${completedSnapshotId ? ` · Snapshot #${completedSnapshotId}` : ''}${payload?.compactContextSizeBytes ? ` · Azure package ${bytes(payload.compactContextSizeBytes)}` : ''}.`;
                toast(`${label} completed.`);
            }
            try {
                state.system = (await api('/api/admin/intelligence/status'));
                renderSystem();
                await loadTenant();
                if (isEnterpriseActionLabel(label)) {
                    const domainKey = body.domainKey || (Array.isArray(result.domains) && result.domains.length === 1 ? result.domains[0].domainKey : null);
                    if (domainKey && result.runId) {
                        state.enterpriseSelectedDomain = { domainKey, runId: Number(result.runId) };
                    }
                    await loadEnterprise();
                }
                if (label === 'Compact Azure analysis') {
                    el('compact-intelligence-proof')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } catch (refreshError) {
                status.textContent += ` Dashboard refresh warning: ${refreshError.message}`;
                toast(`Action completed, but dashboard refresh failed: ${refreshError.message}`, 'error');
            }
        } catch (error) {
            status.className = 'action-status is-error';
            status.textContent = `${label} failed: ${error.message}`;
            toast(error.message, 'error');
            if (isEnterpriseActionLabel(label)) {
                try { await loadEnterprise(); } catch (_) {}
            }
        } finally {
            if (enterprisePollTimer) clearInterval(enterprisePollTimer);
            state.actionRunning = false;
            buttons.forEach(item => { item.disabled = false; });
            button.classList.remove('is-loading');
            button.querySelector('.control-icon i')?.classList.remove('is-spinning');
        }
    }

    function openOutput(index) {
        const output = state.tenant?.outputs?.[index];
        if (!output) return;
        openJsonModal({
            label: 'Stored Azure output',
            title: output.Title || output.OutputType || 'Output JSON',
            subtitle: `${output.OutputType || 'output'} · ${shortDateTime(output.CreatedAt)}`,
            payload: output.ContentJson ?? {}
        });
    }

    function closeOutput() {
        el('json-modal').classList.remove('open');
        el('json-modal').setAttribute('aria-hidden', 'true');
        document.body.classList.remove('json-modal-open');
    }

    function setupInteractions() {
        el('tenant-selector').addEventListener('change', async event => {
            state.selectedCompanyId = Number(event.target.value || 0);
            state.enterpriseSelectedDomain = null;
            localStorage.setItem('stackctrlAdminIntelligenceCompanyId', String(state.selectedCompanyId));
            // Populate domain dropdown immediately (independent of loadTenant/loadEnterprise)
            populateDomainDropdown();
            try {
                await loadTenant();
                await loadEnterprise();
            } catch (error) { toast(error.message, 'error'); }
        });
        el('refresh-control-center').addEventListener('click', () => loadAll().catch(error => toast(error.message, 'error')));
        el('create-snapshot').addEventListener('click', event => runAction(event.currentTarget, 'Snapshot creation', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/snapshot`));
        el('build-compact-context').addEventListener('click', event => runAction(event.currentTarget, 'Compact context build', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/compact-context`, {
            snapshotId: state.tenant?.latestSnapshot?.ID,
            periodType: 'snapshot'
        }));
        el('run-analysis').addEventListener('click', event => runAction(event.currentTarget, 'Compact Azure analysis', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/analyze`, {
            snapshotId: state.tenant?.latestSnapshot?.ID,
            analysisMode: 'compact',
            outputTypes
        }));
        el('run-full-snapshot-analysis').addEventListener('click', event => runAction(event.currentTarget, 'Full snapshot Azure analysis', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/analyze`, {
            snapshotId: state.tenant?.latestSnapshot?.ID,
            analysisMode: 'full',
            outputTypes
        }));
        el('run-full-test').addEventListener('click', event => runAction(event.currentTarget, 'Full bridge test', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/full-test`, { includeAnalysis: true, outputTypes }));
        document.querySelectorAll('[data-period-run]').forEach(button => button.addEventListener('click', event => {
            const periodType = event.currentTarget.dataset.periodRun;
            runAction(event.currentTarget, `${periodType.charAt(0).toUpperCase()}${periodType.slice(1)} intelligence`, `/api/admin/intelligence/tenant/${state.selectedCompanyId}/period/${periodType}`, {
                snapshotId: state.tenant?.latestSnapshot?.ID
            });
        }));
        el('run-enterprise-report')?.addEventListener('click', event => {
            if (!window.confirm('Run Enterprise Deep Report for all domains and final synthesis? Use selected-domain testing first.')) return;
            runAction(event.currentTarget, 'Enterprise Deep Report', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/enterprise/run`, {
            snapshotId: state.tenant?.latestSnapshot?.ID,
            periodType: 'daily',
            includeSynthesis: true
            });
        });
        el('run-enterprise-domains')?.addEventListener('click', event => {
            if (!window.confirm('Run Domain Deep Analysis for all enterprise domains without synthesis?')) return;
            runAction(event.currentTarget, 'Enterprise Domain Deep Analysis', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/enterprise/domain`, {
            snapshotId: state.tenant?.latestSnapshot?.ID,
            periodType: 'daily'
            });
        });
        el('run-enterprise-selected')?.addEventListener('click', event => {
            const selectedDomainKey = el('enterprise-domain-selector').value;
            if (!selectedDomainKey) return toast('No domain selected. Please select a domain from the dropdown.', 'error');
            runAction(event.currentTarget, 'Selected Domain Deep Analysis', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/enterprise/domain`, {
                snapshotId: state.tenant?.latestSnapshot?.ID,
                periodType: 'daily',
                domainKey: selectedDomainKey
            });
        });
        el('run-enterprise-synthesis')?.addEventListener('click', event => {
            const runId = state.enterprise?.runs?.[0]?.ID;
            if (!runId) return toast('Load or run domain intelligence before synthesis.', 'error');
            runAction(event.currentTarget, 'Enterprise Synthesis', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/enterprise/synthesis`, { runId });
        });
        document.querySelectorAll('[data-enterprise-view]').forEach(button => button.addEventListener('click', event => {
            loadEnterprise({ scroll: true, target: event.currentTarget.dataset.enterpriseView === 'input' ? 'lineage' : 'audit' }).catch(error => toast(error.message, 'error'));
        }));
        document.querySelectorAll('[data-enterprise-run-view]').forEach(button => button.addEventListener('click', event => {
            state.enterpriseRunView = event.currentTarget.dataset.enterpriseRunView;
            localStorage.setItem('stackctrlEnterpriseRunView', state.enterpriseRunView);
            renderEnterprise();
        }));
        document.querySelectorAll('[data-enterprise-status-filter]').forEach(button => button.addEventListener('click', event => {
            state.enterpriseStatusFilter = event.currentTarget.dataset.enterpriseStatusFilter;
            localStorage.setItem('stackctrlEnterpriseStatusFilter', state.enterpriseStatusFilter);
            renderEnterprise();
        }));
        el('enterprise-audit-results')?.addEventListener('click', event => {
            const auditButton = event.target.closest('[data-enterprise-audit-index]');
            const domainButton = event.target.closest('[data-enterprise-domain-index]');
            const synthesisButton = event.target.closest('[data-enterprise-synthesis]');
            const retryDomainButton = event.target.closest('[data-retry-domain]');
            if (auditButton) {
                const row = state.enterprise?.evidenceAudit?.[Number(auditButton.dataset.enterpriseAuditIndex)];
                if (row) {
                    selectEnterpriseDomain(row);
                    openJsonModal({
                        label: 'Sanitized Azure input',
                        title: `${enterpriseDomainDisplayName(row.DomainKey, row)} · Azure input package`,
                        subtitle: `Run #${number(row.RunID)} · Snapshot #${number(row.SnapshotID)} · Total StackCTRL Data ${number(row.StackCTRLDataCount)} · Prepared for Azure ${number(row.EvidenceIncludedCount ?? row.StackCTRLDataCount)} · ${dateTime(row.CreatedAt)}`,
                        payload: { azureInput: row.AzureInputSummaryJson, omitted: row.OmittedSummaryJson }
                    });
                }
            } else if (domainButton) {
                const row = state.enterprise?.domainIntelligence?.[Number(domainButton.dataset.enterpriseDomainIndex)];
                if (row) {
                    selectEnterpriseDomain(row);
                    openJsonModal({
                        label: 'Stored Azure output',
                        title: `${enterpriseDomainDisplayName(row.DomainKey, row)} · Azure output`,
                        subtitle: `Run #${number(row.RunID)} · Snapshot #${number(row.SnapshotID)} · ${statusLabel(row.Status)} · Input ${number(row.InputTokens)} · Output ${number(row.OutputTokens)} · ${dateTime(row.CreatedAt)}`,
                        payload: row.AnalysisJson || {}
                    });
                }
            } else if (synthesisButton) {
                const row = state.enterprise?.synthesis?.[0];
                if (row) {
                    state.enterpriseSelectedDomain = null;
                    el('enterprise-audit-title').textContent = enterpriseAuditDefaultTitle;
                    el('enterprise-audit-subtitle').textContent = 'Proof of what StackCTRL held, what Azure received, and what structured intelligence was stored';
                    openJsonModal({
                        label: 'Final enterprise synthesis',
                        title: 'Final enterprise synthesis',
                        subtitle: `Run #${number(row.RunID)} · Snapshot #${number(row.SnapshotID)} · ${statusLabel(row.Status)} · ${dateTime(row.CreatedAt)}`,
                        payload: row
                    });
                }
            } else if (retryDomainButton) {
                const domainKey = retryDomainButton.dataset.retryDomain;
                runAction(retryDomainButton, 'Retry failed domain', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/enterprise/domain`, {
                    snapshotId: state.tenant?.latestSnapshot?.ID,
                    periodType: 'daily',
                    domainKey
                });
            }
        });
        el('ai-output-list').addEventListener('click', event => {
            const button = event.target.closest('[data-output-index]');
            if (button) openOutput(Number(button.dataset.outputIndex));
        });
        document.querySelectorAll('[data-close-json]').forEach(button => button.addEventListener('click', closeOutput));
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closeOutput(); });

        const sidebar = el('admin-sidebar');
        el('sidebar-toggle')?.addEventListener('click', () => sidebar.classList.remove('mobile-open'));
        el('mobile-sidebar-toggle')?.addEventListener('click', event => { event.stopPropagation(); sidebar.classList.toggle('mobile-open'); });
        document.addEventListener('click', event => {
            if (window.innerWidth <= 1024 && sidebar.classList.contains('mobile-open') && !sidebar.contains(event.target)) sidebar.classList.remove('mobile-open');
        });
        el('hamburger')?.addEventListener('click', () => el('nav-links').classList.toggle('active'));
        el('admin-signout')?.addEventListener('click', event => { event.preventDefault(); redirectToSignIn(); });
    }

    async function initialize() {
        syncIntelligenceHeaderOffset();
        window.addEventListener('resize', syncIntelligenceHeaderOffset, { passive: true });
        if ('ResizeObserver' in window) {
            const header = document.querySelector('.intelligence-header');
            if (header) {
                state.headerResizeObserver = new ResizeObserver(syncIntelligenceHeaderOffset);
                state.headerResizeObserver.observe(header);
            }
        }
        if (!state.token) return redirectToSignIn();
        const payload = decodeToken(state.token);
        const role = String(payload.role || payload.Role || '').toLowerCase();
        if (role && role !== 'admin') return redirectUnauthorized();
        setupInteractions();
        // Populate domain dropdown immediately on page load (independent of data loading)
        populateDomainDropdown();
        try {
            await loadAll();
            setInterval(() => {
                if (!state.actionRunning) api('/api/admin/intelligence/status').then(system => { state.system = system; renderSystem(); }).catch(() => {});
            }, 60000);
        } catch (error) {
            document.body.classList.remove('is-guarded');
            toast(error.message, 'error');
            el('action-status').className = 'action-status is-error';
            el('action-status').textContent = error.message;
        }
    }

    document.addEventListener('DOMContentLoaded', initialize);
})();
