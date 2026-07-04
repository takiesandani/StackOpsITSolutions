const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const {
    createAzureOpenAIService,
    DEFAULT_MAX_RETRIES,
    DEFAULT_RETRY_DELAYS_MS,
    extractResponseText,
    getRetryDelayMs,
    normalizeV1Endpoint
} = require('../services/azure-openai');

const azureSecrets = {
    AZURE_OPENAI_API_KEY: 'test-key',
    AZURE_OPENAI_ENDPOINT: 'https://stackctrl-ai-swe-prod.services.ai.azure.com/',
    AZURE_OPENAI_DEPLOYMENT: 'gpt-4.1-mini',
    AZURE_OPENAI_MODEL_VERSION: '2025-04-14',
    AZURE_OPENAI_REGION: 'swedencentral'
};

test('normalizes the Azure AI endpoint to openai/v1', () => {
    assert.equal(
        normalizeV1Endpoint('https://stackctrl-ai-swe-prod.services.ai.azure.com/'),
        'https://stackctrl-ai-swe-prod.services.ai.azure.com/openai/v1'
    );
    assert.equal(
        normalizeV1Endpoint('https://stackctrl-ai-swe-prod.services.ai.azure.com/openai/v1/'),
        'https://stackctrl-ai-swe-prod.services.ai.azure.com/openai/v1'
    );
});

test('uses the Azure v1 Responses API without an api-version parameter', async () => {
    const originalPost = axios.post;
    const requestedSecrets = [];
    let capturedRequest = null;
    axios.post = async (url, body, options) => {
        capturedRequest = { url, body, options };
        return {
            data: {
                id: 'resp_test',
                output: [{
                    type: 'message',
                    content: [{ type: 'output_text', text: '{"status":"ok"}' }]
                }],
                usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
            }
        };
    };

    try {
        const service = createAzureOpenAIService({
            getSecret: async name => {
                requestedSecrets.push(name);
                return azureSecrets[name] || null;
            },
            logger: { error() {} }
        });
        const result = await service.createJsonCompletion({
            messages: [
                { role: 'system', content: 'Return JSON.' },
                { role: 'user', content: 'Check status.' }
            ],
            maxTokens: 500,
            temperature: 0.1
        });

        assert.equal(capturedRequest.url, 'https://stackctrl-ai-swe-prod.services.ai.azure.com/openai/v1/responses');
        assert.equal(capturedRequest.body.model, 'gpt-4.1-mini');
        assert.equal(capturedRequest.body.max_output_tokens, 500);
        assert.equal(capturedRequest.body.store, false);
        assert.deepEqual(capturedRequest.body.text, { format: { type: 'json_object' } });
        assert.equal(capturedRequest.options.params, undefined);
        assert.equal(capturedRequest.options.headers.Authorization, 'Bearer test-key');
        assert.equal(requestedSecrets.includes('AZURE_OPENAI_API_VERSION'), false);
        assert.deepEqual(result.data, { status: 'ok' });
        assert.equal(result.deployment, 'gpt-4.1-mini');
        assert.equal(result.modelVersion, '2025-04-14');
    } finally {
        axios.post = originalPost;
    }
});

test('extracts text from Responses API output items', () => {
    assert.equal(extractResponseText({ output_text: 'direct' }), 'direct');
    assert.equal(extractResponseText({
        output: [{ content: [{ type: 'output_text', text: 'first' }, { type: 'output_text', text: 'second' }] }]
    }), 'first\nsecond');
});

test('Enterprise can receive invalid JSON text with truncation metadata while strict callers still fail', async () => {
    const originalPost = axios.post;
    const truncatedJson = '{"domainExecutiveSummary":"Analysis ended before Azure closed this string';
    axios.post = async () => ({
        data: {
            id: 'resp_truncated',
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
            output: [{ content: [{ type: 'output_text', text: truncatedJson }] }],
            usage: { input_tokens: 100, output_tokens: 5000, total_tokens: 5100 }
        }
    });

    try {
        const service = createAzureOpenAIService({
            getSecret: async name => azureSecrets[name] || null,
            logger: { error() {} }
        });
        await assert.rejects(
            service.createJsonCompletion({ messages: [{ role: 'user', content: 'Strict JSON.' }] }),
            error => {
                assert.match(error.message, /Azure OpenAI returned invalid JSON: Unterminated string/);
                assert.equal(error.azureMetadata.finishReason, 'length');
                assert.equal(error.azureMetadata.rawResponse, truncatedJson);
                return true;
            }
        );
        const enterpriseResult = await service.createJsonCompletion({
            messages: [{ role: 'user', content: 'Enterprise JSON.' }],
            allowInvalidJsonResponse: true
        });
        assert.equal(enterpriseResult.data, truncatedJson);
        assert.equal(enterpriseResult.invalidJson, true);
        assert.match(enterpriseResult.invalidJsonError, /Unterminated string/);
        assert.equal(enterpriseResult.finishReason, 'length');
        assert.equal(enterpriseResult.incompleteReason, 'max_output_tokens');
    } finally {
        axios.post = originalPost;
    }
});

test('waits for Azure Retry-After and retries a throttled request', async () => {
    const originalPost = axios.post;
    const delays = [];
    const warnings = [];
    const statuses = [];
    let calls = 0;
    axios.post = async () => {
        calls += 1;
        if (calls === 1) {
            const error = new Error('rate limited');
            error.response = {
                status: 429,
                headers: { 'retry-after-ms': '25', 'x-request-id': 'request-429' },
                data: { error: { message: 'Rate limit exceeded.' } }
            };
            throw error;
        }
        return {
            data: {
                id: 'resp_retry',
                output: [{ content: [{ type: 'output_text', text: '{"status":"recovered"}' }] }]
            }
        };
    };

    try {
        const service = createAzureOpenAIService({
            getSecret: async name => azureSecrets[name] || null,
            maxRetries: 2,
            wait: async milliseconds => { delays.push(milliseconds); },
            logger: { warn(message, details) { warnings.push({ message, details }); }, error() {} }
        });
        const result = await service.createJsonCompletion({
            messages: [{ role: 'user', content: 'Analyse.' }],
            onStatusChange: async status => { statuses.push(status); }
        });

        assert.equal(calls, 2);
        assert.deepEqual(delays, [25]);
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].details.requestId, 'request-429');
        assert.equal(result.attempts, 2);
        assert.equal(result.retryCount, 1);
        assert.ok(result.requestSizeBytes > 0);
        assert.ok(result.responseSizeBytes > 0);
        assert.deepEqual(result.data, { status: 'recovered' });
        assert.deepEqual(statuses.map(status => status.status), ['processing', 'rate_limited', 'processing']);
        assert.equal(statuses[1].retryCount, 1);
    } finally {
        axios.post = originalPost;
    }
});

test('stops retrying after the configured 429 retry budget', async () => {
    const originalPost = axios.post;
    const delays = [];
    let calls = 0;
    axios.post = async () => {
        calls += 1;
        const error = new Error('rate limited');
        error.response = {
            status: 429,
            headers: {},
            data: { error: { message: 'Capacity is temporarily unavailable.' } }
        };
        throw error;
    };

    try {
        const service = createAzureOpenAIService({
            getSecret: async name => azureSecrets[name] || null,
            maxRetries: 2,
            retryMaxMs: 1000,
            wait: async milliseconds => { delays.push(milliseconds); },
            logger: { warn() {}, error() {} }
        });

        await assert.rejects(
            service.createJsonCompletion({ messages: [{ role: 'user', content: 'Analyse.' }] }),
            error => {
                assert.match(error.message, /429.*after 3 attempt\(s\)/);
                assert.equal(error.azureMetadata.rateLimited, true);
                assert.equal(error.azureMetadata.statusCode, 429);
                assert.equal(error.azureMetadata.retryAfterMs, 1000);
                assert.equal(error.azureMetadata.lastRetryDelayMs, 1000);
                assert.equal(error.azureMetadata.retryCount, 2);
                return true;
            }
        );
        assert.equal(calls, 3);
        assert.deepEqual(delays, [1000, 1000]);
    } finally {
        axios.post = originalPost;
    }
});

test('parses Azure textual retry delays when headers are unavailable', () => {
    assert.equal(getRetryDelayMs({
        response: { data: { error: { message: 'Please retry after 12 seconds.' } } }
    }, 0), 12000);
});

test('reads Retry-After headers case-insensitively and applies the enterprise cap', () => {
    assert.equal(getRetryDelayMs({ response: { headers: { 'Retry-After': '900' } } }, 0, [1000], 15 * 60 * 1000), 900000);
    assert.equal(getRetryDelayMs({ response: { headers: { 'X-MS-RETRY-AFTER-MS': '1200000' } } }, 0, [1000], 15 * 60 * 1000), 900000);
});

test('uses the production fallback retry schedule', () => {
    assert.equal(DEFAULT_MAX_RETRIES, 5);
    assert.deepEqual(DEFAULT_RETRY_DELAYS_MS, [5000, 15000, 30000, 60000, 120000]);
    assert.equal(getRetryDelayMs({}, 0), 5000);
    assert.equal(getRetryDelayMs({}, 1), 15000);
    assert.equal(getRetryDelayMs({}, 2), 30000);
    assert.equal(getRetryDelayMs({}, 3), 60000);
    assert.equal(getRetryDelayMs({}, 4), 120000);
});

test('retries ECONNRESET with connection backoff and succeeds on the third attempt', async () => {
    const originalPost = axios.post;
    const delays = [];
    let calls = 0;
    axios.post = async () => {
        calls += 1;
        if (calls < 3) {
            const error = new Error('read ECONNRESET');
            error.code = 'ECONNRESET';
            throw error;
        }
        return {
            data: {
                id: 'resp_connection_retry',
                output: [{ content: [{ type: 'output_text', text: '{"status":"recovered"}' }] }]
            }
        };
    };

    try {
        const service = createAzureOpenAIService({
            getSecret: async name => azureSecrets[name] || null,
            maxRetries: 2,
            wait: async milliseconds => { delays.push(milliseconds); },
            logger: { warn() {}, error() {} }
        });
        const result = await service.createJsonCompletion({
            messages: [{ role: 'user', content: 'Analyse.' }],
            connectionRetryDelaysMsOverride: [0, 10000, 30000]
        });
        assert.equal(calls, 3);
        assert.equal(result.attempts, 3);
        assert.equal(result.retryCount, 2);
        assert.deepEqual(result.data, { status: 'recovered' });
        assert.equal(delays.length, 2);
    } finally {
        axios.post = originalPost;
    }
});
