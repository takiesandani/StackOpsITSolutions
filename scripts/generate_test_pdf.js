const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function formatReportDate(value, includeTime = false) {
    if (!value) return 'Not available';
    return new Intl.DateTimeFormat('en-ZA', {
        timeZone: 'Africa/Johannesburg',
        dateStyle: 'medium',
        ...(includeTime ? { timeStyle: 'short' } : {})
    }).format(new Date(value));
}

function clampReportScore(score) {
    const v = Number(score || 0);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
}

async function generateTestPdf() {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: false });
    const outPath = path.join(__dirname, '..', 'test-sunbird-report.pdf');
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const orange = '#f97316';
    const navy = '#17212b';
    const slate = '#52606d';
    const pale = '#f3f5f7';
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 80;

    const stackOpsLogo = path.join(__dirname, '..', 'Images', 'Sunbird.png');
    const stackCtrlLogo = path.join(__dirname, '..', 'Images', 'Logos', 'Ctrl big.png');

    // sample report
    const report = {
        companyName: 'Sunbird',
        period: { start: new Date(Date.now() - 30 * 24 * 3600 * 1000), end: new Date() },
        summary: { healthScore: 86, failures: 4, successes: 12, totalEvents: 45 },
        analysis: { executiveSummary: 'Automated summary generated for testing purposes.' },
        dailyReports: [],
        domainScores: { security: 0, identity: 84, devices: 86, email: 86, applications:95, backup:100, cloudflare:75 },
        events: [],
        failures: [{ title: 'Weak MFA settings', detail: 'Some users have weak MFA policies.' }],
        successes: [{ title: 'Antivirus coverage', detail: 'All endpoints reported active AV.' }],
        recommendations: [{ title: 'Enable conditional access', detail: 'Consider applying CA to high-risk users.' }],
        generatedAt: new Date()
    };

    // Header
    doc.rect(0, 0, pageWidth, 126).fill(navy);
    if (fs.existsSync(stackOpsLogo)) doc.image(stackOpsLogo, 40, 28, { fit: [150, 42] });
    if (fs.existsSync(stackCtrlLogo)) doc.image(stackCtrlLogo, pageWidth - 174, 26, { fit: [134, 44], align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor('#c8d0d8')
        .text('AUTOMATED INTELLIGENCE REPORT', 40, 82, { characterSpacing: 1.1 });
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff')
        .text(report.companyName || 'Client', 40, 96, { width: 330 });
    doc.font('Helvetica').fontSize(8).fillColor('#d9dee3')
        .text(`${formatReportDate(report.period.start)} - ${formatReportDate(report.period.end)}`, pageWidth - 220, 100, { width: 180, align: 'right' });

    doc.y = 148;
    doc.roundedRect(40, 144, contentWidth, 76, 8).fill(pale);
    doc.font('Helvetica-Bold').fontSize(28).fillColor(orange).text(`${report.summary.healthScore}%`, 56, 160, { width: 90 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(navy).text('SECURITY HEALTH', 56, 194);

    doc.font('Helvetica').fontSize(10).fillColor(navy)
        .text(report.analysis?.executiveSummary || '', 40, 232, { lineGap: 3 });

    // Domain health mini
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(navy).text('Domain health', 40);
    Object.entries(report.domainScores).forEach(([domain, score]) => {
        doc.moveDown(0.2);
        const y = doc.y;
        doc.font('Helvetica').fontSize(8.5).fillColor(navy).text(domain.replace(/^./, c=>c.toUpperCase()), 40, y, { width: 90 });
        doc.roundedRect(136, y + 1, 350, 8, 4).fill('#e1e6ea');
        doc.roundedRect(136, y + 1, 3.5 * clampReportScore(score), 8, 4).fill(score >= 80 ? '#16a34a' : score >= 60 ? orange : '#dc2626');
        doc.font('Helvetica-Bold').fontSize(8).fillColor(navy).text(`${clampReportScore(score)}%`, 495, y - 1, { width: 48, align: 'right' });
        doc.y = y + 20;
    });

    // Evidence samples
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(navy).text('Evidence samples');
    const samples = [
        { title: 'Weak MFA settings', detail: 'Some users have weak MFA policies.' },
        { title: 'Antivirus coverage', detail: 'All endpoints reported active AV.' },
        { title: 'Conditional access recommendation', detail: 'Apply CA to privileged roles.' }
    ];
    samples.forEach(item => {
        doc.circle(47, doc.y + 6, 2.2).fillColor('#52606d').fill();
        doc.font('Helvetica-Bold').fontSize(9).fillColor(navy).text(item.title, 56, doc.y, { width: contentWidth - 16 });
        doc.font('Helvetica').fontSize(8.5).fillColor(slate).text(item.detail, 56, doc.y + 2, { width: contentWidth - 16, lineGap: 1 });
        doc.moveDown(0.6);
    });

    // Footer
    doc.font('Helvetica').fontSize(7).fillColor('#7d8790')
        .text(`StackOps IT Solutions | StackCTRL | Evidence generated ${formatReportDate(report.generatedAt, true)}`, 40, 806, { width: 430 });
    doc.text(`Page 1`, 480, 806, { width: 75, align: 'right' });

    doc.end();

    await new Promise((res, rej) => {
        stream.on('finish', res);
        stream.on('error', rej);
    });
    console.log('Generated PDF:', outPath);
}

generateTestPdf().catch(err => { console.error(err); process.exit(1); });
