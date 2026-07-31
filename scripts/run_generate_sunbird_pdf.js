const fs = require('fs');
const path = require('path');

// Require server.js as a module (server startup is guarded by require.main)
const { generateSunbirdReportPdf } = require('../server');

async function run() {
    const report = {
        companyName: 'Example Co',
        period: { start: new Date(Date.now() - 7 * 24 * 3600 * 1000), end: new Date() },
        summary: { healthScore: 72, failures: 3, successes: 8, totalEvents: 24, activeIncidents: 1, highSeverityAlerts: 0 },
        analysis: { executiveSummary: 'This is a generated sample executive summary for testing evidence rendering.' },
        domainInsights: {
            domains: [
                {
                    domainKey: 'identity',
                    domainName: 'Identity',
                    intelligenceOutput: {
                        evidenceRows: [
                            { userEmail: 'alice@example.com', deviceName: 'ALICE-LAPTOP', title: 'MFA missing', detail: 'User missing MFA', status: 'noncompliant' },
                            { user: { email: 'bob@example.com', displayName: 'Bob' }, device: { deviceName: 'BOB-PC' }, title: 'Unpatched device', detail: 'Missing security updates', status: 'warning' }
                        ]
                    }
                },
                {
                    domainKey: 'devices',
                    domainName: 'Devices',
                    intelligenceOutput: {
                        evidenceRows: [
                            { email: 'charlie@example.com', assetName: 'CHARLIE-VMA', finding: 'Outdated OS', severity: 'high' }
                        ]
                    }
                }
            ]
        },
        finalSynthesis: {},
        failures: [],
        successes: [],
        recommendations: [],
        events: []
    };

    try {
        const pdf = await generateSunbirdReportPdf(report, 9999);
        const out = path.join(__dirname, '..', 'test-sunbird-report-generated.pdf');
        fs.writeFileSync(out, pdf);
        console.log('Generated PDF:', out);
    } catch (err) {
        console.error('PDF generation failed:', err);
        process.exit(1);
    }
}

run();
