const express = require('express');
const {
  getOrderById,
  getOrderByMerchantTradeNo,
  getPaymentRedirect,
  reconcileOrderPayment,
} = require('../services/ecpayOrderService');

const router = express.Router();

function buildOrderRedirect(orderId, payment) {
  return `/orders/${encodeURIComponent(orderId)}?payment=${payment}`;
}

async function reconcileAndRedirect(req, res, statusCode) {
  const orderId = req.query.orderId;

  if (!orderId) {
    return res.status(400).type('text/plain').send('orderId is required');
  }

  const order = getOrderById(orderId);
  if (!order || !order.ecpay_merchant_trade_no) {
    return res.redirect(statusCode, buildOrderRedirect(orderId, 'returned'));
  }

  try {
    const result = await reconcileOrderPayment(order);
    return res.redirect(statusCode, buildOrderRedirect(order.id, getPaymentRedirect(result.order)));
  } catch (_err) {
    return res.redirect(statusCode, buildOrderRedirect(order.id, 'returned'));
  }
}

router.get('/client-back', async (req, res) => {
  return reconcileAndRedirect(req, res, 302);
});

router.post('/client-redirect', async (req, res) => {
  return reconcileAndRedirect(req, res, 303);
});

router.post('/notify', async (req, res) => {
  try {
    const merchantTradeNo = String(req.body?.MerchantTradeNo || '').trim();
    const order = merchantTradeNo ? getOrderByMerchantTradeNo(merchantTradeNo) : null;

    if (order) {
      await reconcileOrderPayment(order);
    }
  } catch (_err) {
    // Public notify endpoint always acknowledges receipt.
  }

  return res.status(200).type('text/plain').send('1|OK');
});

module.exports = router;
