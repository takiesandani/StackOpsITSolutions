const axios = require('axios');

const DEFAULT_COUNTRY_CODE = '27';
const DEFAULT_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';
const DEFAULT_RECIPIENT = '27762609804';

const SEVERITY_LABELS = {
  critical: '[CRITICAL]',
  high: '[HIGH]',
  medium: '[MEDIUM]',
  low: '[LOW]'
};

function normalizeSeverity(value) {
  const severity = String(value || 'medium').toLowerCase();
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium' || severity === 'mid') return 'medium';
  return 'low';
}

function normalizeWhatsAppRecipient(value, defaultCountryCode = DEFAULT_COUNTRY_CODE) {
  const digits = String(value || DEFAULT_RECIPIENT).replace(/\D/g, '');
  if (!digits) return DEFAULT_RECIPIENT;
  if (digits.startsWith('0')) return `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
}

function formatDateTime(value, timeZone = 'Africa/Johannesburg') {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
  const dateText = new Intl.DateTimeFormat('en-ZA', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).format(safeDate);
  const timeText = new Intl.DateTimeFormat('en-ZA', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(safeDate);
  return { dateText, timeText };
}

function buildSecurityAlertMessage(alert = {}, options = {}) {
  const severity = normalizeSeverity(alert.severity);
  const { dateText, timeText } = formatDateTime(
    alert.eventTime || alert.timestamp || alert.created || alert.updated,
    options.timeZone
  );
  const issue = alert.issue || alert.title || alert.displayName || alert.name || 'Security alert';
  const assignedTo = alert.assignedTo || alert.owner || alert.assignee;
  const status = alert.status ? `\nStatus: ${alert.status}` : '';
  const source = alert.source || alert.category || alert.vendor;

  return [
    'Security Alert',
    '',
    `Severity: ${SEVERITY_LABELS[severity]} ${severity.toUpperCase()}`,
    `Date: ${dateText}`,
    `Time: ${timeText}`,
    `Issue: ${issue}`,
    assignedTo ? `Assigned to: ${assignedTo}` : 'Assigned to: Unassigned',
    source ? `Source: ${source}` : '',
    status.trim()
  ].filter(Boolean).join('\n');
}

async function sendWhatsAppText({ token, phoneNumberId, to, text, apiVersion = DEFAULT_GRAPH_VERSION }) {
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID is not configured');

  const recipient = normalizeWhatsAppRecipient(to);
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: text
      }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  return response.data;
}

async function sendSecurityAlert(alert, config) {
  const body = buildSecurityAlertMessage(alert, config);
  return sendWhatsAppText({
    token: config.token,
    phoneNumberId: config.phoneNumberId,
    to: config.recipient || DEFAULT_RECIPIENT,
    text: body,
    apiVersion: config.apiVersion
  });
}

module.exports = {
  buildSecurityAlertMessage,
  normalizeSeverity,
  normalizeWhatsAppRecipient,
  sendSecurityAlert,
  sendWhatsAppText
};
