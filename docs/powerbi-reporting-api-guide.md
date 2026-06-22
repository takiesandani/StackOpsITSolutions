# StackCTRL Power BI Reporting API — Beginner Guide

This guide explains the reporting API as if you are learning Node.js for the first time.

## 1. What is an API?

An API is a controlled door into an application.

Think of StackCTRL as a school:

- MySQL is the records room.
- A Power BI view is a prepared report from the records room.
- The API endpoint is a labelled service window.
- The API key is the access card required at the window.
- Power BI is the person requesting the prepared report.

Power BI never enters the MySQL records room. It asks the API for a specific prepared dataset.

## 2. The four pieces of this Node.js API

### The dataset map

File: `services/powerbi-reporting.js`

The map connects a public endpoint to one approved SQL view:

```js
{
    path: 'risk-register',
    view: 'vw_PowerBI_RiskRegister'
}
```

The caller cannot provide a table name. This prevents someone from requesting an unsafe table.

### The service

The service performs the database work:

```js
const [rows] = await pool.query(sql, params);
```

`sql` contains `?` placeholders and `params` contains the values. This is called a parameterized query.

```sql
WHERE CompanyID = ?
```

The database treats the supplied CompanyID as data, not as SQL instructions. This helps prevent SQL injection.

### The router

File: `routes/powerbi-reporting.js`

The router receives an HTTP request:

```js
router.get('/:dataset', async (req, res) => {
    const result = await reportingService.readDataset(req.params.dataset, req.query);
    res.json(result);
});
```

`req` is the incoming request. `res` is the response sent back to Power BI.

### Server registration

File: `server.js`

This line gives every reporting route the `/api/powerbi` prefix:

```js
app.use('/api/powerbi', createPowerBIReportingRouter({
    reportingService: powerBIReportingService
}));
```

The final risk URL becomes:

```text
https://stackopsit.co.za/api/powerbi/risk-register
```

## 3. How API-key security works

StackCTRL accepts either of these two methods.

Header authentication:

```text
X-PowerBI-API-Key: your-secret-value
```

Fabric Dataflow Gen2-compatible query authentication:

```text
?apiKey=your-secret-value
```

If both are supplied, access succeeds when either value is correct.

StackCTRL retrieves the expected value from Google Secret Manager:

```text
POWERBI_REPORTING_API_KEY
```

The value is never stored in source code.

Generate a strong value locally:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy the generated value into a Google Secret Manager secret named `POWERBI_REPORTING_API_KEY`.

Do not paste the value into GitHub, JavaScript frontend files, screenshots, or chat messages.

## 4. What happens when Power BI requests data?

Example request:

```text
GET /api/powerbi/risk-register?companyId=1&periodType=daily&limit=100
```

Behind the scenes:

1. Express receives the request.
2. The router reads `X-PowerBI-API-Key` and the optional `apiKey` query parameter.
3. The service compares it with the Google secret.
4. `risk-register` is matched to `vw_PowerBI_RiskRegister`.
5. CompanyID, PeriodType, limit, and offset are validated.
6. A parameterized `SELECT` query runs.
7. The rows are returned as JSON.

Example response:

```json
{
  "success": true,
  "dataset": "risk-register",
  "count": 1,
  "limit": 100,
  "offset": 0,
  "data": [
    {
      "CompanyID": 1,
      "RiskTitle": "Incomplete MFA coverage",
      "Domain": "Identity",
      "Severity": "high"
    }
  ]
}
```

## 5. Testing with PowerShell

Keep the real key private:

```powershell
$headers = @{ "X-PowerBI-API-Key" = "YOUR_PRIVATE_KEY" }
Invoke-RestMethod -Uri "https://stackopsit.co.za/api/powerbi/health" -Headers $headers
```

Test a dataset:

```powershell
Invoke-RestMethod -Uri "https://stackopsit.co.za/api/powerbi/intelligence-summary?companyId=1&limit=100" -Headers $headers
```

Fabric-friendly query authentication:

```powershell
$key = "YOUR_PRIVATE_KEY"
Invoke-RestMethod -Uri "https://stackopsit.co.za/api/powerbi/intelligence-summary?apiKey=$key&companyId=1&limit=500"
```

Expected health result:

```json
{
  "success": true,
  "status": "available",
  "database": "connected",
  "viewsChecked": 20,
  "viewsExpected": 20
}
```

## 6. Connecting Power BI

Create a Power BI parameter called `PowerBIReportingApiKey`. Mark it as sensitive where possible.

Open Power Query and use:

```powerquery
let
    Response = Json.Document(
        Web.Contents(
            "https://stackopsit.co.za/api/powerbi/risk-register",
            [
                Headers = [#"X-PowerBI-API-Key" = PowerBIReportingApiKey],
                Query = [companyId = "1", periodType = "daily", limit = "5000", offset = "0"]
            ]
        )
    ),
    Rows = Response[data],
    Result = Table.FromRecords(Rows)
in
    Result
```

If Fabric Dataflow Gen2 rejects the connection before custom headers can be configured, use the query parameter:

```powerquery
let
    Response = Json.Document(
        Web.Contents(
            "https://stackopsit.co.za/api/powerbi/intelligence-summary",
            [
                Query = [
                    apiKey = PowerBIReportingApiKey,
                    companyId = "1",
                    limit = "500"
                ]
            ]
        )
    ),
    Rows = Response[data],
    Result = Table.FromRecords(Rows)
in
    Result
```

For more than 5,000 rows, request additional pages by increasing `offset`:

- Page 1: `limit=5000&offset=0`
- Page 2: `limit=5000&offset=5000`
- Page 3: `limit=5000&offset=10000`

## 7. Useful documentation URLs

```text
https://stackopsit.co.za/api/powerbi/openapi.json?apiKey=<POWERBI_KEY>
https://stackopsit.co.za/api/powerbi/docs?apiKey=<POWERBI_KEY>
```

Swagger's **Authorize** button accepts the Power BI API key and lets an approved developer test endpoints.

## 8. Deployment checklist

1. Install `sql/stackctrl-powerbi-views.sql` in the production database.
2. Run `sql/stackctrl-powerbi-views-smoke-test.sql`.
3. Create the Google secret `POWERBI_REPORTING_API_KEY`.
4. Optionally set `POWERBI_REPORTING_BASE_URL` for another environment.
5. Build and deploy the Node.js application.
6. Call `/api/powerbi/health` with the API key.
7. Connect Power BI to the dataset endpoints.

## 9. Safety rules to remember

- Never create an endpoint that accepts a table name from the URL.
- Never build SQL by joining user input into a query string.
- Never return `ContextJson` or `CompactContextJson`.
- Never put an API key in frontend JavaScript.
- Use query authentication only over HTTPS and never share a URL containing the real key.
- Keep reporting endpoints read-only.
- Always limit and paginate large results.
