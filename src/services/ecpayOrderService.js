const db = require('../database');
const {
  EcpayError,
  createEcpayConfig,
  generateMerchantTradeNo,
  isOfflinePaymentType,
  queryPaymentInfo,
  queryTradeInfo,
} = require('./ecpayService');

const FAILED_TRADE_STATUSES = new Set([
  '10100058',
  '10100248',
  '10100254',
  '10200095',
  '10200163',
]);

function getOrderItems(orderId) {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
}

function parsePaymentInfo(value) {
  if (!value) return null;

  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (_err) {
    return null;
  }
}

function serializeOrder(order) {
  return {
    ...order,
    items: getOrderItems(order.id),
    ecpay_payment_info: parsePaymentInfo(order.ecpay_payment_info),
  };
}

function getOwnedOrder(orderId, userId) {
  return db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
}

function getOrderById(orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

function getOrderByMerchantTradeNo(merchantTradeNo) {
  return db.prepare('SELECT * FROM orders WHERE ecpay_merchant_trade_no = ?').get(merchantTradeNo);
}

function assignFreshMerchantTradeNo(orderId) {
  for (let i = 0; i < 5; i += 1) {
    const merchantTradeNo = generateMerchantTradeNo();

    try {
      db.prepare('UPDATE orders SET ecpay_merchant_trade_no = ? WHERE id = ?').run(merchantTradeNo, orderId);
      return merchantTradeNo;
    } catch (err) {
      if (!String(err.code || '').includes('SQLITE_CONSTRAINT')) {
        throw err;
      }
    }
  }

  throw new EcpayError('無法產生唯一的綠界交易編號', 500, 'ECPAY_MERCHANT_TRADE_NO_FAILED');
}

function sanitizeEcpayPayload(payload) {
  const { CheckMacValue, ...safePayload } = payload || {};
  return safePayload;
}

function mapTradeStatusToOrderStatus(tradeStatus) {
  if (String(tradeStatus) === '1') return 'paid';
  if (FAILED_TRADE_STATUSES.has(String(tradeStatus))) return 'failed';
  return 'pending';
}

function getPaymentResultFromOrder(order) {
  return {
    tradeStatus: order.ecpay_trade_status,
    paymentStatus: order.status,
    paymentInfo: parsePaymentInfo(order.ecpay_payment_info),
  };
}

function getPaymentMessage(paymentStatus) {
  if (paymentStatus === 'paid') return '付款成功';
  if (paymentStatus === 'failed') return '付款失敗';
  return '付款尚未完成';
}

function getPaymentRedirect(order) {
  if (order.status === 'paid') return 'success';
  if (order.status === 'failed') return 'failed';
  return 'returned';
}

async function reconcileOrderPayment(order, options = {}) {
  if (!order) {
    throw new EcpayError('訂單不存在', 404, 'NOT_FOUND');
  }

  if (!order.ecpay_merchant_trade_no) {
    throw new EcpayError('尚未建立 ECPay 付款', 400, 'PAYMENT_NOT_STARTED');
  }

  if (order.status !== 'pending' && !options.forceQuery) {
    return {
      order: serializeOrder(order),
      paymentResult: getPaymentResultFromOrder(order),
      message: getPaymentMessage(order.status),
    };
  }

  const config = options.config || createEcpayConfig();
  const result = await queryTradeInfo(order.ecpay_merchant_trade_no, config, options.fetchImpl);

  if (
    result.MerchantID !== config.merchantId ||
    result.MerchantTradeNo !== order.ecpay_merchant_trade_no ||
    String(result.TradeAmt) !== String(order.total_amount)
  ) {
    throw new EcpayError('ECPay query response does not match the local order', 502, 'ECPAY_ORDER_MISMATCH');
  }

  const paymentStatus = mapTradeStatusToOrderStatus(result.TradeStatus);
  let paymentInfo = parsePaymentInfo(order.ecpay_payment_info);

  if (paymentStatus === 'pending' && isOfflinePaymentType(result.PaymentType)) {
    try {
      paymentInfo = sanitizeEcpayPayload(
        await queryPaymentInfo(order.ecpay_merchant_trade_no, config, options.fetchImpl)
      );
    } catch (_err) {
      paymentInfo = paymentInfo || null;
    }
  }

  if (paymentStatus !== 'pending' || paymentInfo) {
    db.prepare(
      `UPDATE orders
       SET status = ?,
           ecpay_trade_no = COALESCE(?, ecpay_trade_no),
           ecpay_payment_type = COALESCE(?, ecpay_payment_type),
           ecpay_trade_status = ?,
           ecpay_payment_date = COALESCE(?, ecpay_payment_date),
           ecpay_payment_info = ?,
           ecpay_last_checked_at = datetime('now')
       WHERE id = ?`
    ).run(
      paymentStatus,
      result.TradeNo || null,
      result.PaymentType || null,
      result.TradeStatus || null,
      result.PaymentDate || null,
      paymentInfo ? JSON.stringify(paymentInfo) : null,
      order.id
    );
  } else {
    db.prepare('UPDATE orders SET ecpay_last_checked_at = datetime(\'now\') WHERE id = ?').run(order.id);
  }

  const updatedOrder = getOrderById(order.id);
  return {
    order: serializeOrder(updatedOrder),
    paymentResult: {
      tradeStatus: result.TradeStatus,
      paymentStatus,
      paymentInfo,
    },
    message: getPaymentMessage(paymentStatus),
  };
}

module.exports = {
  assignFreshMerchantTradeNo,
  getOrderById,
  getOrderByMerchantTradeNo,
  getOwnedOrder,
  getPaymentMessage,
  getPaymentRedirect,
  getPaymentResultFromOrder,
  getOrderItems,
  parsePaymentInfo,
  reconcileOrderPayment,
  serializeOrder,
};
