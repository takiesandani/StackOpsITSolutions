(() => {
    const state = {
        token: localStorage.getItem('authToken'),
        system: null,
        tenants: [],
        tenant: null,
        selectedCompanyId: Number(localStorage.getItem('stackctrlAdminIntelligenceCompanyId') || 0),
        actionRunning: false
    };

    const outputTypes = [
        'executive_summary', 'overall_risk_score', 'risk_level', 'governance_assessment',
        'compliance_review', 'risk_register', 'recommendations', 'trend_analysis',
        'board_report', 'powerbi_summary'
    ];

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
        renderSources();
        renderRuns();
        renderOutputs();
        renderReadiness();
        renderPreviews();
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
        const buttons = ['create-snapshot', 'run-analysis', 'run-full-test'].map(el).filter(Boolean);
        buttons.forEach(item => { item.disabled = true; });
        button.querySelector('.control-icon i')?.classList.add('is-spinning');
        const status = el('action-status');
        status.className = 'action-status is-running';
        status.textContent = `${label} is running. Azure rate-limit retries can keep this request open for several minutes.`;
        try {
            const result = await api(path, { method: 'POST', body: JSON.stringify(body) });
            status.className = 'action-status is-success';
            status.textContent = `${label} completed successfully${result.snapshotId ? ` · Snapshot #${result.snapshotId}` : ''}.`;
            toast(`${label} completed.`);
            state.system = (await api('/api/admin/intelligence/status'));
            renderSystem();
            await loadTenant();
        } catch (error) {
            status.className = 'action-status is-error';
            status.textContent = `${label} failed: ${error.message}`;
            toast(error.message, 'error');
        } finally {
            state.actionRunning = false;
            buttons.forEach(item => { item.disabled = false; });
            button.querySelector('.control-icon i')?.classList.remove('is-spinning');
        }
    }

    function openOutput(index) {
        const output = state.tenant?.outputs?.[index];
        if (!output) return;
        el('json-modal-title').textContent = output.Title || output.OutputType || 'Output JSON';
        const content = output.ContentJson ?? {};
        el('json-modal-content').textContent = JSON.stringify(content, null, 2);
        el('json-modal').classList.add('open');
        el('json-modal').setAttribute('aria-hidden', 'false');
    }

    function closeOutput() {
        el('json-modal').classList.remove('open');
        el('json-modal').setAttribute('aria-hidden', 'true');
    }

    function setupInteractions() {
        el('tenant-selector').addEventListener('change', async event => {
            state.selectedCompanyId = Number(event.target.value || 0);
            localStorage.setItem('stackctrlAdminIntelligenceCompanyId', String(state.selectedCompanyId));
            try { await loadTenant(); } catch (error) { toast(error.message, 'error'); }
        });
        el('refresh-control-center').addEventListener('click', () => loadAll().catch(error => toast(error.message, 'error')));
        el('create-snapshot').addEventListener('click', event => runAction(event.currentTarget, 'Snapshot creation', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/snapshot`));
        el('run-analysis').addEventListener('click', event => runAction(event.currentTarget, 'Azure analysis', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/analyze`, {
            snapshotId: state.tenant?.latestSnapshot?.ID,
            outputTypes
        }));
        el('run-full-test').addEventListener('click', event => runAction(event.currentTarget, 'Full intelligence test', `/api/admin/intelligence/tenant/${state.selectedCompanyId}/full-test`, { includeAnalysis: true, outputTypes }));
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
        if (!state.token) return redirectToSignIn();
        const payload = decodeToken(state.token);
        const role = String(payload.role || payload.Role || '').toLowerCase();
        if (role && role !== 'admin') return redirectUnauthorized();
        setupInteractions();
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
