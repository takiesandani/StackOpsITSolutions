const axios = require('axios');
const { ClientSecretCredential } = require('@azure/identity');

const CONFIG_CACHE_MS = 5 * 60 * 1000;
const AZURE_AI_SCOPE = 'https://ai.azure.com/.default';
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 120000];
const DEFAULT_RETRY_MAX_MS = 120000;

function headerValue(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    const directValue = headers[name] ?? headers[name.toLowerCase()];
    if (directValue !== undefined && directValue !== null) return directValue;
    const matchingKey = Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase());
    return matchingKey ? headers[matchingKey] : null;
}

function getRetryDelayMs(error, attempt, retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, maxDelayMs = DEFAULT_RETRY_MAX_MS) {
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

    const scheduledDelay = retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)] || DEFAULT_RETRY_DELAYS_MS.at(-1);
    return Math.min(scheduledDelay, maxDelayMs);
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

function extractResponseFinishReason(responseData) {
    const reason = responseData?.incomplete_details?.reason || null;
    if (reason === 'max_output_tokens') return 'length';
    if (responseData?.status === 'incomplete') return reason || 'incomplete';
    return responseData?.finish_reason || null;
}

function createAzureOpenAIService({
    getSecret,
    logger = console,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
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
        responseFormat = null,
        onStatusChange = null,
        maxRetriesOverride = null,
        retryDelaysMsOverride = null,
        retryMaxMsOverride = null,
        timeoutMs = 60000
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

        const requestSizeBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
        const configuredRetries = maxRetriesOverride == null ? maxRetries : maxRetriesOverride;
        const retryLimit = Math.max(0, Math.min(10, Number(configuredRetries) || 0));
        const effectiveRetryDelaysMs = Array.isArray(retryDelaysMsOverride) && retryDelaysMsOverride.length
            ? retryDelaysMsOverride
            : retryDelaysMs;
        const effectiveRetryMaxMs = Number(retryMaxMsOverride) > 0 ? Number(retryMaxMsOverride) : retryMaxMs;
        let lastRetryDelayMs = null;
        async function reportStatus(status, metadata = {}) {
            if (typeof onStatusChange !== 'function') return;
            try {
                await onStatusChange({
                    status,
                    model: config.deployment,
                    deployment: config.deployment,
                    requestSizeBytes,
                    ...metadata
                });
            } catch (error) {
                logger.error('[Azure OpenAI] Failed to record request status:', error.message);
            }
        }

        for (let attempt = 0; attempt <= retryLimit; attempt++) {
            await reportStatus('processing', { attempt: attempt + 1, retryCount: attempt });
            try {
                const response = await axios.post(url, body, {
                    headers: {
                        Authorization: authorization,
                        'Content-Type': 'application/json'
                    },
                    timeout: Math.max(10000, Number(timeoutMs) || 60000)
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
                    model: config.deployment,
                    deployment: config.deployment,
                    modelVersion: config.modelVersion,
                    region: config.region,
                    responseId: response.data?.id || null,
                    usage: response.data?.usage || null,
                    attempts: attempt + 1,
                    retryCount: attempt,
                    requestSizeBytes,
                    responseSizeBytes: Buffer.byteLength(JSON.stringify(response.data || {}), 'utf8'),
                    responseStatus: response.data?.status || null,
                    incompleteReason: response.data?.incomplete_details?.reason || null,
                    finishReason: extractResponseFinishReason(response.data)
                };
            } catch (error) {
                const status = error.response?.status;
                const requestId = headerValue(error.response?.headers, 'x-request-id') || headerValue(error.response?.headers, 'apim-request-id');
                const detail = error.response?.data?.error?.message || error.message || 'Unknown Azure OpenAI error';
                const shouldRetry = status === 429 && attempt < retryLimit;
                if (shouldRetry) {
                    const delayMs = getRetryDelayMs(error, attempt, effectiveRetryDelaysMs, effectiveRetryMaxMs);
                    lastRetryDelayMs = delayMs;
                    await reportStatus('rate_limited', {
                        attempt: attempt + 1,
                        retryCount: attempt + 1,
                        delayMs,
                        requestId: requestId || null
                    });
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
                const requestError = new Error(`Azure OpenAI request failed${status ? ` (${status})` : ''} after ${attempt + 1} attempt(s): ${detail}`);
                const recommendedRetryDelayMs = status === 429
                    ? getRetryDelayMs(error, attempt, effectiveRetryDelaysMs, effectiveRetryMaxMs)
                    : null;
                if (status === 429) {
                    await reportStatus('failed_rate_limited', {
                        attempt: attempt + 1,
                        retryCount: attempt,
                        delayMs: recommendedRetryDelayMs,
                        requestId: requestId || null
                    });
                }
                requestError.azureMetadata = {
                    model: config.deployment,
                    deployment: config.deployment,
                    statusCode: status || null,
                    rateLimited: status === 429,
                    retryAfterMs: recommendedRetryDelayMs,
                    lastRetryDelayMs,
                    requestSizeBytes,
                    responseSizeBytes: error.response?.data
                        ? Buffer.byteLength(JSON.stringify(error.response.data), 'utf8')
                        : null,
                    tokenUsage: null,
                    retryCount: attempt
                };
                throw requestError;
            }
        }

        throw new Error('Azure OpenAI request failed after retry limit was reached');
    }

    async function createJsonCompletion(options = {}) {
        const { allowInvalidJsonResponse = false, ...completionOptions } = options;
        const result = await createChatCompletion({
            ...completionOptions,
            responseFormat: { type: 'json_object' }
        });

        try {
            return { ...result, data: JSON.parse(result.content) };
        } catch (error) {
            if (allowInvalidJsonResponse) {
                return {
                    ...result,
                    data: result.content,
                    invalidJson: true,
                    invalidJsonError: error.message
                };
            }
            const invalidJsonError = new Error(`Azure OpenAI returned invalid JSON: ${error.message}`);
            invalidJsonError.azureMetadata = {
                model: result.model,
                deployment: result.deployment,
                requestSizeBytes: result.requestSizeBytes,
                responseSizeBytes: result.responseSizeBytes,
                tokenUsage: result.usage,
                retryCount: result.retryCount,
                rawResponse: result.content,
                finishReason: result.finishReason,
                incompleteReason: result.incompleteReason
            };
            throw invalidJsonError;
        }
    }

    async function getSafeConfiguration() {
        try {
            const config = await loadConfig();
            return {
                endpointConfigured: Boolean(config.endpoint),
                deployment: config.deployment,
                modelVersion: config.modelVersion,
                apiVersion: 'v1',
                region: config.region,
                authenticationMode: config.apiKey ? 'api_key' : 'entra_id'
            };
        } catch (error) {
            return {
                endpointConfigured: false,
                deployment: null,
                modelVersion: null,
                apiVersion: 'v1',
                region: null,
                authenticationMode: null,
                configurationError: error.message
            };
        }
    }

    return {
        createChatCompletion,
        createJsonCompletion,
        loadConfig,
        getSafeConfiguration
    };
}

module.exports = {
    createAzureOpenAIService,
    DEFAULT_MAX_RETRIES,
    DEFAULT_RETRY_DELAYS_MS,
    extractResponseText,
    getRetryDelayMs,
    normalizeV1Endpoint
};
