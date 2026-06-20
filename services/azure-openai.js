const axios = require('axios');
const { ClientSecretCredential } = require('@azure/identity');

const CONFIG_CACHE_MS = 5 * 60 * 1000;
const AZURE_AI_SCOPE = 'https://ai.azure.com/.default';
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_BASE_MS = 2000;
const DEFAULT_RETRY_MAX_MS = 60000;

function headerValue(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function getRetryDelayMs(error, attempt, baseDelayMs = DEFAULT_RETRY_BASE_MS, maxDelayMs = DEFAULT_RETRY_MAX_MS) {
    const headers = error?.response?.headers;
    const milliseconds = Number(headerValue(headers, 'retry-after-ms') || headerValue(headers, 'x-ms-retry-after-ms'));
    if (Number.isFinite(milliseconds) && milliseconds > 0) return Math.min(milliseconds, maxDelayMs);

    const retryAfter = headerValue(headers, 'retry-after');
    if (retryAfter !== null && retryAfter !== undefined && retryAfter !== '') {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxDelayMs);
        const retryAt = new Date(retryAfter).getTime();
        if (Number.isFinite(retryAt)) return Math.min(Math.max(0, retryAt - Date.now()), maxDelayMs);
    }

    const detail = String(error?.response?.data?.error?.message || error?.message || '');
    const secondsMatch = detail.match(/retry\s+after\s+(\d+(?:\.\d+)?)\s*seconds?/i);
    if (secondsMatch) return Math.min(Number(secondsMatch[1]) * 1000, maxDelayMs);
    const millisecondsMatch = detail.match(/retry\s+after\s+(\d+(?:\.\d+)?)\s*(?:ms|milliseconds?)/i);
    if (millisecondsMatch) return Math.min(Number(millisecondsMatch[1]), maxDelayMs);

    return Math.min(baseDelayMs * (2 ** attempt), maxDelayMs);
}

function normalizeV1Endpoint(value) {
    const endpoint = String(value || '').trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
    if (!endpoint) return '';
    const v1Index = endpoint.toLowerCase().indexOf('/openai/v1');
    if (v1Index >= 0) return endpoint.slice(0, v1Index + '/openai/v1'.length);
    return `${endpoint}/openai/v1`;
}

function extractResponseText(responseData) {
    if (typeof responseData?.output_text === 'string' && responseData.output_text.trim()) {
        return responseData.output_text.trim();
    }

    const textParts = [];
    for (const outputItem of responseData?.output || []) {
        for (const contentItem of outputItem?.content || []) {
            if (contentItem?.type === 'output_text' && typeof contentItem.text === 'string') {
                textParts.push(contentItem.text);
            }
        }
    }
    return textParts.join('\n').trim();
}

function createAzureOpenAIService({
    getSecret,
    logger = console,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    retryMaxMs = DEFAULT_RETRY_MAX_MS,
    wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
} = {}) {
    if (typeof getSecret !== 'function') {
        throw new Error('Azure OpenAI requires the StackCTRL secret loader');
    }

    let cachedConfig = null;
    let configExpiresAt = 0;
    let entraCredential = null;
    let cachedAccessToken = null;

    async function loadConfig() {
        if (cachedConfig && configExpiresAt > Date.now()) return cachedConfig;

        const [apiKey, endpoint, deployment, modelVersion, region] = await Promise.all([
            getSecret('AZURE_OPENAI_API_KEY'),
            getSecret('AZURE_OPENAI_ENDPOINT'),
            getSecret('AZURE_OPENAI_DEPLOYMENT'),
            getSecret('AZURE_OPENAI_MODEL_VERSION'),
            getSecret('AZURE_OPENAI_REGION')
        ]);

        const missing = [
            ['AZURE_OPENAI_ENDPOINT', endpoint],
            ['AZURE_OPENAI_DEPLOYMENT', deployment]
        ].filter(([, value]) => !value).map(([name]) => name);
        if (missing.length) {
            throw new Error(`Azure OpenAI is not configured. Missing: ${missing.join(', ')}`);
        }

        let entra = null;
        if (!apiKey) {
            const [tenantId, clientId, clientSecret] = await Promise.all([
                getSecret('AZURE_OPENAI_TENANT_ID'),
                getSecret('AZURE_OPENAI_CLIENT_ID'),
                getSecret('AZURE_OPENAI_CLIENT_SECRET')
            ]);
            const missingEntra = [
                ['AZURE_OPENAI_TENANT_ID', tenantId],
                ['AZURE_OPENAI_CLIENT_ID', clientId],
                ['AZURE_OPENAI_CLIENT_SECRET', clientSecret]
            ].filter(([, value]) => !value).map(([name]) => name);
            if (missingEntra.length) {
                throw new Error(`Azure OpenAI authentication is not configured. Add AZURE_OPENAI_API_KEY or: ${missingEntra.join(', ')}`);
            }
            entra = { tenantId, clientId, clientSecret };
        }

        cachedConfig = {
            apiKey: apiKey || null,
            endpoint: normalizeV1Endpoint(endpoint),
            deployment: String(deployment),
            modelVersion: modelVersion ? String(modelVersion) : null,
            region: region ? String(region) : null,
            entra
        };
        configExpiresAt = Date.now() + CONFIG_CACHE_MS;
        return cachedConfig;
    }

    async function getAuthorizationHeader(config) {
        if (config.apiKey) return `Bearer ${config.apiKey}`;
        if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60000) {
            return `Bearer ${cachedAccessToken.token}`;
        }
        if (!entraCredential) {
            entraCredential = new ClientSecretCredential(
                config.entra.tenantId,
                config.entra.clientId,
                config.entra.clientSecret
            );
        }
        const token = await entraCredential.getToken(AZURE_AI_SCOPE);
        cachedAccessToken = {
            token: token.token,
            expiresAt: token.expiresOnTimestamp || Date.now() + (30 * 60 * 1000)
        };
        return `Bearer ${token.token}`;
    }

    async function createChatCompletion({
        messages,
        temperature = 0.2,
        maxTokens = 1200,
        responseFormat = null
    }) {
        const config = await loadConfig();
        const authorization = await getAuthorizationHeader(config);
        const url = `${config.endpoint}/responses`;
        const body = {
            model: config.deployment,
            input: messages,
            temperature,
            max_output_tokens: maxTokens,
            store: false
        };

        if (responseFormat) body.text = { format: responseFormat };

        const retryLimit = Math.max(0, Math.min(10, Number(maxRetries) || 0));
        for (let attempt = 0; attempt <= retryLimit; attempt++) {
            try {
                const response = await axios.post(url, body, {
                    headers: {
                        Authorization: authorization,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                });

                const content = extractResponseText(response.data);
                if (!content) {
                    const refusal = (response.data?.output || [])
                        .flatMap(item => item?.content || [])
                        .find(item => item?.type === 'refusal')?.refusal;
                    throw new Error(refusal || 'Azure OpenAI returned an empty response');
                }

                return {
                    content,
                    deployment: config.deployment,
                    modelVersion: config.modelVersion,
                    region: config.region,
                    responseId: response.data?.id || null,
                    usage: response.data?.usage || null,
                    attempts: attempt + 1
                };
            } catch (error) {
                const status = error.response?.status;
                const requestId = headerValue(error.response?.headers, 'x-request-id') || headerValue(error.response?.headers, 'apim-request-id');
                const detail = error.response?.data?.error?.message || error.message || 'Unknown Azure OpenAI error';
                const shouldRetry = status === 429 && attempt < retryLimit;
                if (shouldRetry) {
                    const delayMs = getRetryDelayMs(error, attempt, retryBaseMs, retryMaxMs);
                    logger.warn?.('[Azure OpenAI] Rate limited; retrying request.', {
                        attempt: attempt + 1,
                        maxAttempts: retryLimit + 1,
                        delayMs,
                        requestId: requestId || null
                    });
                    await wait(delayMs);
                    continue;
                }

                logger.error('[Azure OpenAI] Request failed:', {
                    status: status || null,
                    requestId: requestId || null,
                    attempts: attempt + 1,
                    message: detail
                });
                throw new Error(`Azure OpenAI request failed${status ? ` (${status})` : ''} after ${attempt + 1} attempt(s): ${detail}`);
            }
        }

        throw new Error('Azure OpenAI request failed after retry limit was reached');
    }

    async function createJsonCompletion(options) {
        const result = await createChatCompletion({
            ...options,
            responseFormat: { type: 'json_object' }
        });

        try {
            return { ...result, data: JSON.parse(result.content) };
        } catch (error) {
            throw new Error(`Azure OpenAI returned invalid JSON: ${error.message}`);
        }
    }

    return {
        createChatCompletion,
        createJsonCompletion,
        loadConfig
    };
}

module.exports = {
    createAzureOpenAIService,
    extractResponseText,
    getRetryDelayMs,
    normalizeV1Endpoint
};
