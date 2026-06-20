const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const {
    createAzureOpenAIService,
    extractResponseText,
    normalizeV1Endpoint
} = require('../services/azure-openai');

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
    const secrets = {
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://stackctrl-ai-swe-prod.services.ai.azure.com/',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4.1-mini',
        AZURE_OPENAI_MODEL_VERSION: '2025-04-14',
        AZURE_OPENAI_REGION: 'swedencentral'
    };
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
                return secrets[name] || null;
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
