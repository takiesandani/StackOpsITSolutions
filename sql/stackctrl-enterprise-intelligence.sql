-- StackCTRL Enterprise Deep Reporting Pipeline
-- Run this file manually in Google MySQL before enabling enterprise admin actions or automation.

CREATE TABLE IF NOT EXISTS StackCTRLEnterpriseReportRuns (
    ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    CompanyID BIGINT NOT NULL,
    SnapshotID BIGINT NULL,
    PeriodType VARCHAR(30) NOT NULL,
    PeriodStart DATETIME NOT NULL,
    PeriodEnd DATETIME NOT NULL,
    Status VARCHAR(50) NOT NULL DEFAULT 'pending',
    Mode VARCHAR(100) NOT NULL,
    DeduplicationKey VARCHAR(255) NULL,
    StartedAt DATETIME NULL,
    CompletedAt DATETIME NULL,
    ErrorMessage TEXT NULL,
    TotalInputTokens BIGINT NOT NULL DEFAULT 0,
    TotalOutputTokens BIGINT NOT NULL DEFAULT 0,
    TotalTokens BIGINT NOT NULL DEFAULT 0,
    TotalRequestBytes BIGINT NOT NULL DEFAULT 0,
    TotalResponseBytes BIGINT NOT NULL DEFAULT 0,
    RetryCount INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID),
    KEY ix_enterprise_runs_company_period (CompanyID, PeriodType, PeriodStart),
    KEY ix_enterprise_runs_snapshot (SnapshotID),
    KEY ix_enterprise_runs_status (Status, StartedAt),
    UNIQUE KEY uq_enterprise_runs_deduplication (DeduplicationKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS StackCTRLTenantDomainIntelligence (
    ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    CompanyID BIGINT NOT NULL,
    SnapshotID BIGINT NOT NULL,
    RunID BIGINT UNSIGNED NOT NULL,
    DomainKey VARCHAR(100) NOT NULL,
    DomainName VARCHAR(180) NOT NULL,
    PeriodType VARCHAR(30) NOT NULL,
    PeriodStart DATETIME NOT NULL,
    PeriodEnd DATETIME NOT NULL,
    HealthScore DECIMAL(6,2) NULL,
    RiskScore DECIMAL(6,2) NULL,
    RiskLevel VARCHAR(50) NULL,
    InputSizeBytes BIGINT NOT NULL DEFAULT 0,
    ResponseSizeBytes BIGINT NOT NULL DEFAULT 0,
    InputTokens BIGINT NOT NULL DEFAULT 0,
    OutputTokens BIGINT NOT NULL DEFAULT 0,
    TotalTokens BIGINT NOT NULL DEFAULT 0,
    RetryCount INT NOT NULL DEFAULT 0,
    Status VARCHAR(50) NOT NULL,
    AnalysisJson JSON NULL,
    DomainExecutiveSummary LONGTEXT NULL,
    TechnicalSummary LONGTEXT NULL,
    BusinessImpact LONGTEXT NULL,
    CurrentPosture LONGTEXT NULL,
    EvidenceSummary LONGTEXT NULL,
    ScoreJustification LONGTEXT NULL,
    ControlAssessment JSON NULL,
    FindingsJson JSON NULL,
    RisksJson JSON NULL,
    RecommendationsJson JSON NULL,
    TrendAnalysisJson JSON NULL,
    YesterdayVsTodayJson JSON NULL,
    MissingDataWarningsJson JSON NULL,
    AssumptionsJson JSON NULL,
    ConfidenceScore DECIMAL(8,5) NULL,
    ErrorMessage TEXT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID),
    UNIQUE KEY uq_enterprise_domain_run (RunID, DomainKey),
    KEY ix_enterprise_domain_company_period (CompanyID, PeriodType, PeriodStart),
    KEY ix_enterprise_domain_snapshot (SnapshotID),
    KEY ix_enterprise_domain_status (Status, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS StackCTRLEnterpriseSynthesis (
    ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    CompanyID BIGINT NOT NULL,
    SnapshotID BIGINT NULL,
    RunID BIGINT UNSIGNED NOT NULL,
    PeriodType VARCHAR(30) NOT NULL,
    PeriodStart DATETIME NOT NULL,
    PeriodEnd DATETIME NOT NULL,
    Status VARCHAR(50) NOT NULL,
    ExecutiveSummaryJson JSON NULL,
    BoardReportJson JSON NULL,
    ManagementReportJson JSON NULL,
    RiskRegisterJson JSON NULL,
    RecommendationsJson JSON NULL,
    TrendAnalysisJson JSON NULL,
    ComplianceReviewJson JSON NULL,
    GovernanceReviewJson JSON NULL,
    DomainScorecardJson JSON NULL,
    MaturityAssessmentJson JSON NULL,
    BusinessImpactSummary LONGTEXT NULL,
    TopDecisionsRequiredJson JSON NULL,
    Next30DaysPlanJson JSON NULL,
    Next90DaysPlanJson JSON NULL,
    EvidenceJustificationJson JSON NULL,
    LimitationsJson JSON NULL,
    PowerBISummaryJson JSON NULL,
    InputSizeBytes BIGINT NOT NULL DEFAULT 0,
    ResponseSizeBytes BIGINT NOT NULL DEFAULT 0,
    InputTokens BIGINT NOT NULL DEFAULT 0,
    OutputTokens BIGINT NOT NULL DEFAULT 0,
    TotalTokens BIGINT NOT NULL DEFAULT 0,
    RetryCount INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID),
    UNIQUE KEY uq_enterprise_synthesis_run (RunID),
    KEY ix_enterprise_synthesis_company_period (CompanyID, PeriodType, PeriodStart),
    KEY ix_enterprise_synthesis_snapshot (SnapshotID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS StackCTRLIntelligenceEvidenceAudit (
    ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    CompanyID BIGINT NOT NULL,
    SnapshotID BIGINT NOT NULL,
    RunID BIGINT UNSIGNED NOT NULL,
    DomainKey VARCHAR(100) NOT NULL,
    StackCTRLDataCount INT NOT NULL DEFAULT 0,
    SentToAzureCount INT NOT NULL DEFAULT 0,
    OmittedCount INT NOT NULL DEFAULT 0,
    MetricsIncludedCount INT NOT NULL DEFAULT 0,
    EvidenceIncludedCount INT NOT NULL DEFAULT 0,
    EvidenceOmittedCount INT NOT NULL DEFAULT 0,
    HistoricalComparisonsIncluded INT NOT NULL DEFAULT 0,
    AzureMentionedDomain TINYINT(1) NOT NULL DEFAULT 0,
    RisksReturnedCount INT NOT NULL DEFAULT 0,
    RecommendationsReturnedCount INT NOT NULL DEFAULT 0,
    TrendsReturnedCount INT NOT NULL DEFAULT 0,
    InputSizeBytes BIGINT NOT NULL DEFAULT 0,
    OutputSizeBytes BIGINT NOT NULL DEFAULT 0,
    InputTokens BIGINT NOT NULL DEFAULT 0,
    OutputTokens BIGINT NOT NULL DEFAULT 0,
    RetryCount INT NOT NULL DEFAULT 0,
    Status VARCHAR(50) NOT NULL,
    AzureInputSummaryJson JSON NULL,
    OmittedSummaryJson JSON NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID),
    UNIQUE KEY uq_enterprise_evidence_run_domain (RunID, DomainKey),
    KEY ix_enterprise_evidence_company_snapshot (CompanyID, SnapshotID),
    KEY ix_enterprise_evidence_status (Status, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS StackCTRLEnterpriseIntelligenceItems (
    ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    CompanyID BIGINT NOT NULL,
    SnapshotID BIGINT NULL,
    RunID BIGINT UNSIGNED NOT NULL,
    DomainKey VARCHAR(100) NOT NULL,
    DomainName VARCHAR(180) NOT NULL,
    PeriodType VARCHAR(30) NOT NULL,
    PeriodStart DATETIME NOT NULL,
    PeriodEnd DATETIME NOT NULL,
    ItemType VARCHAR(50) NOT NULL,
    Title VARCHAR(255) NOT NULL,
    Description LONGTEXT NULL,
    Severity VARCHAR(50) NULL,
    Priority VARCHAR(50) NULL,
    Status VARCHAR(50) NULL,
    Likelihood VARCHAR(80) NULL,
    Impact VARCHAR(120) NULL,
    BusinessImpact LONGTEXT NULL,
    EvidenceSummary LONGTEXT NULL,
    Recommendation LONGTEXT NULL,
    SuggestedOwner VARCHAR(180) NULL,
    SuggestedDueDate DATE NULL,
    Direction VARCHAR(50) NULL,
    CurrentValue DECIMAL(20,4) NULL,
    PreviousValue DECIMAL(20,4) NULL,
    ChangePercent DECIMAL(20,4) NULL,
    ComparisonPeriod VARCHAR(50) NULL,
    SourceStage VARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID),
    KEY ix_enterprise_items_company_type (CompanyID, ItemType, CreatedAt),
    KEY ix_enterprise_items_run_domain (RunID, DomainKey, ItemType),
    KEY ix_enterprise_items_snapshot (SnapshotID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS StackCTRLKnowledgeBase (
    ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    DomainKey VARCHAR(100) NOT NULL,
    Title VARCHAR(255) NOT NULL,
    SourceType VARCHAR(100) NULL,
    SourceUrl VARCHAR(1000) NULL,
    ContentSummary LONGTEXT NOT NULL,
    BestPracticeJson JSON NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (ID),
    KEY ix_stackctrl_knowledge_domain (DomainKey, IsActive, UpdatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Enterprise run telemetry. No prompt packages or raw snapshot fields are exposed.
CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_EnterpriseRuns AS
SELECT run.ID AS RunID, run.CompanyID, company.CompanyName, snapshot.TenantKey AS TenantID,
       run.SnapshotID, run.PeriodType, run.PeriodStart, run.PeriodEnd, DATE(run.PeriodEnd) AS ReportDate,
       run.Status, run.Mode, run.StartedAt, run.CompletedAt,
       TIMESTAMPDIFF(SECOND, run.StartedAt, run.CompletedAt) AS DurationSeconds,
       run.TotalInputTokens, run.TotalOutputTokens, run.TotalTokens,
       run.TotalRequestBytes, run.TotalResponseBytes, run.RetryCount, run.ErrorMessage, run.CreatedAt
FROM StackCTRLEnterpriseReportRuns run
INNER JOIN Companies company ON company.ID = run.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = run.SnapshotID;

-- One row per domain analysis with readable enterprise narratives and scores.
CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_DomainIntelligence AS
SELECT domain.ID AS DomainIntelligenceID, domain.CompanyID, company.CompanyName,
       snapshot.TenantKey AS TenantID, domain.SnapshotID, domain.RunID,
       domain.DomainKey, domain.DomainName, domain.PeriodType, domain.PeriodStart, domain.PeriodEnd,
       DATE(domain.PeriodEnd) AS ReportDate, domain.HealthScore, domain.RiskScore, domain.RiskLevel,
       domain.Status, domain.DomainExecutiveSummary, domain.TechnicalSummary, domain.BusinessImpact,
       domain.CurrentPosture, domain.EvidenceSummary, domain.ScoreJustification,
       COALESCE(
           NULLIF(JSON_UNQUOTE(JSON_EXTRACT(domain.ControlAssessment, '$.summary')), 'null'),
           NULLIF(JSON_UNQUOTE(JSON_EXTRACT(domain.ControlAssessment, '$.assessment')), 'null')
       ) AS ControlAssessmentSummary,
       JSON_LENGTH(JSON_EXTRACT(domain.ControlAssessment, '$.confirmed')) AS ConfirmedControlsCount,
       JSON_LENGTH(JSON_EXTRACT(domain.ControlAssessment, '$.unknown')) AS UnknownControlsCount,
       JSON_LENGTH(JSON_EXTRACT(domain.ControlAssessment, '$.gaps')) AS ControlGapsCount,
       JSON_LENGTH(domain.MissingDataWarningsJson) AS MissingDataWarningCount,
       JSON_LENGTH(domain.AssumptionsJson) AS AssumptionCount,
       domain.ConfidenceScore, domain.InputSizeBytes, domain.ResponseSizeBytes,
       domain.InputTokens, domain.OutputTokens, domain.TotalTokens, domain.RetryCount,
       domain.ErrorMessage, domain.CreatedAt
FROM StackCTRLTenantDomainIntelligence domain
INNER JOIN Companies company ON company.ID = domain.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = domain.SnapshotID;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_DomainFindings AS
SELECT item.ID AS FindingID, item.CompanyID, company.CompanyName, snapshot.TenantKey AS TenantID,
       item.SnapshotID, item.RunID, item.DomainKey, item.DomainName, item.PeriodType,
       item.PeriodStart, item.PeriodEnd, DATE(item.PeriodEnd) AS ReportDate,
       item.Title, item.Description, item.Severity, item.Status, item.BusinessImpact,
       item.EvidenceSummary, item.SourceStage, item.CreatedAt
FROM StackCTRLEnterpriseIntelligenceItems item
INNER JOIN Companies company ON company.ID = item.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = item.SnapshotID
WHERE item.ItemType = 'finding';

CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_DomainRisks AS
SELECT item.ID AS RiskID, item.CompanyID, company.CompanyName, snapshot.TenantKey AS TenantID,
       item.SnapshotID, item.RunID, item.DomainKey, item.DomainName, item.PeriodType,
       item.PeriodStart, item.PeriodEnd, DATE(item.PeriodEnd) AS ReportDate,
       item.Title AS RiskTitle, item.Description, item.Severity, item.Likelihood, item.Impact,
       item.BusinessImpact, item.EvidenceSummary, item.Recommendation, item.SourceStage, item.CreatedAt
FROM StackCTRLEnterpriseIntelligenceItems item
INNER JOIN Companies company ON company.ID = item.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = item.SnapshotID
WHERE item.ItemType = 'risk';

CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_DomainRecommendations AS
SELECT item.ID AS RecommendationID, item.CompanyID, company.CompanyName, snapshot.TenantKey AS TenantID,
       item.SnapshotID, item.RunID, item.DomainKey, item.DomainName, item.PeriodType,
       item.PeriodStart, item.PeriodEnd, DATE(item.PeriodEnd) AS ReportDate,
       item.Title, item.Description AS Detail, item.Priority, item.BusinessImpact AS BusinessReason,
       item.SuggestedOwner, item.SuggestedDueDate, item.Status, item.SourceStage, item.CreatedAt
FROM StackCTRLEnterpriseIntelligenceItems item
INNER JOIN Companies company ON company.ID = item.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = item.SnapshotID
WHERE item.ItemType = 'recommendation';

CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_DomainTrends AS
SELECT item.ID AS TrendID, item.CompanyID, company.CompanyName, snapshot.TenantKey AS TenantID,
       item.SnapshotID, item.RunID, item.DomainKey, item.DomainName, item.PeriodType,
       item.PeriodStart, item.PeriodEnd, DATE(item.PeriodEnd) AS ReportDate,
       item.Title AS MetricName, item.Direction, item.CurrentValue, item.PreviousValue,
       item.ChangePercent, item.ComparisonPeriod, item.Description AS Explanation,
       item.SourceStage, item.CreatedAt
FROM StackCTRLEnterpriseIntelligenceItems item
INNER JOIN Companies company ON company.ID = item.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = item.SnapshotID
WHERE item.ItemType = 'trend';

CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_DomainEvidenceAudit AS
SELECT audit.ID AS EvidenceAuditID, audit.CompanyID, company.CompanyName,
       snapshot.TenantKey AS TenantID, audit.SnapshotID, audit.RunID,
       audit.DomainKey, domain.DomainName, domain.PeriodType, domain.PeriodStart, domain.PeriodEnd,
       DATE(domain.PeriodEnd) AS ReportDate, audit.StackCTRLDataCount, audit.SentToAzureCount,
       audit.OmittedCount, audit.MetricsIncludedCount, audit.EvidenceIncludedCount,
       audit.EvidenceOmittedCount, audit.HistoricalComparisonsIncluded,
       audit.AzureMentionedDomain, audit.RisksReturnedCount, audit.RecommendationsReturnedCount,
       audit.TrendsReturnedCount, audit.InputSizeBytes, audit.OutputSizeBytes,
       audit.InputTokens, audit.OutputTokens, audit.RetryCount, audit.Status, audit.CreatedAt
FROM StackCTRLIntelligenceEvidenceAudit audit
INNER JOIN Companies company ON company.ID = audit.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = audit.SnapshotID
LEFT JOIN StackCTRLTenantDomainIntelligence domain
       ON domain.RunID = audit.RunID AND domain.DomainKey = audit.DomainKey;

-- Final synthesis is flattened into safe narrative columns. Synthesis JSON remains internal to StackCTRL.
CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_EnterpriseSynthesis AS
SELECT synthesis.ID AS SynthesisID, synthesis.CompanyID, company.CompanyName,
       snapshot.TenantKey AS TenantID, synthesis.SnapshotID, synthesis.RunID,
       synthesis.PeriodType, synthesis.PeriodStart, synthesis.PeriodEnd, DATE(synthesis.PeriodEnd) AS ReportDate,
       synthesis.Status,
       COALESCE(
           NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.ExecutiveSummaryJson, '$.summary')), 'null'),
           NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.ExecutiveSummaryJson, '$.overview')), 'null')
       ) AS EnterpriseExecutiveSummary,
       synthesis.BusinessImpactSummary,
       COALESCE(
           NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.MaturityAssessmentJson, '$.level')), 'null'),
           NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.PowerBISummaryJson, '$.maturity_level')), 'null')
       ) AS MaturityLevel,
       CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.PowerBISummaryJson, '$.risk_score')), 'null') AS DECIMAL(6,2)) AS OverallRiskScore,
       NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.PowerBISummaryJson, '$.risk_level')), 'null') AS OverallRiskLevel,
       synthesis.InputSizeBytes, synthesis.ResponseSizeBytes, synthesis.InputTokens,
       synthesis.OutputTokens, synthesis.TotalTokens, synthesis.RetryCount, synthesis.CreatedAt
FROM StackCTRLEnterpriseSynthesis synthesis
INNER JOIN Companies company ON company.ID = synthesis.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = synthesis.SnapshotID;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_EnterpriseBoardReport AS
SELECT synthesis.ID AS SynthesisID, synthesis.CompanyID, company.CompanyName,
       snapshot.TenantKey AS TenantID, synthesis.SnapshotID, synthesis.RunID,
       synthesis.PeriodType, synthesis.PeriodStart, synthesis.PeriodEnd, DATE(synthesis.PeriodEnd) AS ReportDate,
       COALESCE(
           NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.BoardReportJson, '$.summary')), 'null'),
           NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.BoardReportJson, '$.boardSummary')), 'null'),
           NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.ExecutiveSummaryJson, '$.summary')), 'null')
       ) AS BoardSummary,
       NULLIF(JSON_UNQUOTE(JSON_EXTRACT(synthesis.BoardReportJson, '$.riskNarrative')), 'null') AS RiskNarrative,
       synthesis.BusinessImpactSummary, synthesis.Status, synthesis.CreatedAt
FROM StackCTRLEnterpriseSynthesis synthesis
INNER JOIN Companies company ON company.ID = synthesis.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = synthesis.SnapshotID;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_PowerBI_EnterpriseManagementActions AS
SELECT item.ID AS ActionID, item.CompanyID, company.CompanyName, snapshot.TenantKey AS TenantID,
       item.SnapshotID, item.RunID, item.DomainKey, item.DomainName, item.PeriodType,
       item.PeriodStart, item.PeriodEnd, DATE(item.PeriodEnd) AS ReportDate,
       item.ItemType AS ActionType, item.Title, item.Description, item.Priority, item.Status,
       item.BusinessImpact AS BusinessReason, item.SuggestedOwner, item.SuggestedDueDate,
       item.SourceStage, item.CreatedAt
FROM StackCTRLEnterpriseIntelligenceItems item
INNER JOIN Companies company ON company.ID = item.CompanyID
LEFT JOIN StackCTRLTenantEvidenceSnapshots snapshot ON snapshot.ID = item.SnapshotID
WHERE item.ItemType IN ('management_action', 'decision');
