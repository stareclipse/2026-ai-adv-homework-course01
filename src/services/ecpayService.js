const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const ECPAY_STAGE_BASE_URL = 'https://payment-stage.ecpay.com.tw';
const ECPAY_PROD_BASE_URL = 'https://payment.ecpay.com.tw';

class EcpayError extends Error {
  constructor(message, statusCode = 502, code = 'ECPAY_ERROR', details = null) {
    super(message);
    this.name = 'EcpayError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function createEcpayConfig(env = process.env) {
  const merchantId = env.ECPAY_MERCHANT_ID || '3002607';
  const hashKey = env.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6';
  const hashIv = env.ECPAY_HASH_IV || 'EkRm7iFT261dpevs';
  const ecpayEnv = env.ECPAY_ENV || 'staging';

  return {
    merchantId,
    hashKey,
    hashIv,
    env: ecpayEnv,
  };
}

function getEcpayBaseUrl(config) {
  return config.env === 'production' || config.env === 'prod'
    ? ECPAY_PROD_BASE_URL
    : ECPAY_STAGE_BASE_URL;
}

function ecpayUrlEncode(source) {
  return encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27')
    .toLowerCase()
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
}

function normalizeParams(params) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(
        ([key, value]) =>
          key !== 'CheckMacValue' && value !== undefined && value !== null,
      )
      .map(([key, value]) => [key, String(value)]),
  );
}

function generateCheckMacValue(params, hashKey, hashIv, method = 'sha256') {
  const normalized = normalizeParams(params);
  const sortedEntries = Object.entries(normalized).sort(([a], [b]) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  const paramString = sortedEntries
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const raw = `HashKey=${hashKey}&${paramString}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw);

  return crypto
    .createHash(method)
    .update(encoded, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function verifyCheckMacValue(params, hashKey, hashIv, method = 'sha256') {
  const received = String(params.CheckMacValue || '');
  const calculated = generateCheckMacValue(params, hashKey, hashIv, method);
  const receivedBuffer = Buffer.from(received);
  const calculatedBuffer = Buffer.from(calculated);

  return (
    receivedBuffer.length === calculatedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
  );
}

function getTaipeiDateParts(now) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function formatMerchantTradeDate(now = new Date()) {
  const parts = getTaipeiDateParts(now);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function generateMerchantTradeNo(now = new Date()) {
  const parts = getTaipeiDateParts(now);
  const yymmdd = parts.year.slice(2) + parts.month + parts.day;
  const hhmmss = parts.hour + parts.minute + parts.second;
  const random = uuidv4().replace(/-/g, '').slice(0, 5).toUpperCase();
  return `F${yymmdd}${hhmmss}${random}`;
}

function sanitizeBaseUrl(baseUrl) {
  return (baseUrl || 'http://localhost:3001').replace(/\/+$/, '');
}

function buildItemName(items) {
  const itemName = items
    .map((item) => `${item.product_name} x ${item.quantity}`)
    .join('#');

  return Array.from(itemName).slice(0, 200).join('');
}

function buildCheckoutForm(input, config = createEcpayConfig()) {
  const baseUrl = sanitizeBaseUrl(input.baseUrl || process.env.BASE_URL);
  const action = `${getEcpayBaseUrl(config)}/Cashier/AioCheckOut/V5`;
  const params = {
    MerchantID: config.merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    MerchantTradeDate: formatMerchantTradeDate(input.now || new Date()),
    PaymentType: 'aio',
    TotalAmount: String(input.order.total_amount),
    TradeDesc: 'Flower Shop Order',
    ItemName: buildItemName(input.items),
    ReturnURL: `${baseUrl}/ecpay/notify`,
    ClientBackURL: `${baseUrl}/ecpay/client-back?orderId=${encodeURIComponent(input.order.id)}`,
    ClientRedirectURL: `${baseUrl}/ecpay/client-redirect?orderId=${encodeURIComponent(input.order.id)}`,
    ChoosePayment: 'ALL',
    EncryptType: '1',
  };
  params.CheckMacValue = generateCheckMacValue(
    params,
    config.hashKey,
    config.hashIv,
  );

  return {
    action,
    method: 'POST',
    params,
  };
}

function parseFormEncodedResponse(body) {
  const params = new URLSearchParams(body);
  return Object.fromEntries(params.entries());
}

async function postForm(url, params, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new EcpayError('fetch is not available in this Node.js runtime');
  }

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    throw new EcpayError(
      `ECPay API returned HTTP ${response.status}`,
      502,
      'ECPAY_HTTP_ERROR',
    );
  }

  return parseFormEncodedResponse(await response.text());
}

async function queryTradeInfo(
  merchantTradeNo,
  config = createEcpayConfig(),
  fetchImpl = globalThis.fetch,
) {
  const url = `${getEcpayBaseUrl(config)}/Cashier/QueryTradeInfo/V5`;
  const params = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000)),
  };
  params.CheckMacValue = generateCheckMacValue(
    params,
    config.hashKey,
    config.hashIv,
  );

  const result = await postForm(url, params, fetchImpl);
  if (!verifyCheckMacValue(result, config.hashKey, config.hashIv)) {
    throw new EcpayError(
      'ECPay query CheckMacValue verification failed',
      502,
      'ECPAY_VERIFY_FAILED',
    );
  }

  return result;
}

async function queryPaymentInfo(
  merchantTradeNo,
  config = createEcpayConfig(),
  fetchImpl = globalThis.fetch,
) {
  const url = `${getEcpayBaseUrl(config)}/Cashier/QueryPaymentInfo`;
  const params = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000)),
  };
  params.CheckMacValue = generateCheckMacValue(
    params,
    config.hashKey,
    config.hashIv,
  );

  const result = await postForm(url, params, fetchImpl);
  if (!verifyCheckMacValue(result, config.hashKey, config.hashIv)) {
    throw new EcpayError(
      'ECPay payment info CheckMacValue verification failed',
      502,
      'ECPAY_VERIFY_FAILED',
    );
  }

  return result;
}

function isOfflinePaymentType(paymentType) {
  return /^(ATM|CVS|BARCODE)/i.test(String(paymentType || ''));
}

module.exports = {
  EcpayError,
  buildCheckoutForm,
  createEcpayConfig,
  ecpayUrlEncode,
  formatMerchantTradeDate,
  generateCheckMacValue,
  generateMerchantTradeNo,
  isOfflinePaymentType,
  queryPaymentInfo,
  queryTradeInfo,
  verifyCheckMacValue,
};
