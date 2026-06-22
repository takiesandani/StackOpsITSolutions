-- Run this migration once before reinstalling the Power BI views.
-- StackCTRL stores the two new domain health values on each completed reporting period.

ALTER TABLE StackCTRLIntelligencePeriods
    ADD COLUMN OperationsHealth DECIMAL(6,2) NULL AFTER ComplianceHealth,
    ADD COLUMN ApplicationsHealth DECIMAL(6,2) NULL AFTER OperationsHealth;

-- Azure trends retain the historical baseline used for each comparison.
ALTER TABLE StackCTRLTenantTrendAnalysis
    ADD COLUMN ComparisonPeriod VARCHAR(50) NULL AFTER Direction;

