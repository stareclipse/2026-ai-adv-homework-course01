const { v4: uuidv4 } = require('uuid');
const db = require('../src/database');
const { app, request, registerUser } = require('./setup');
const { generateCheckMacValue } = require('../src/services/ecpayService');

function buildTradeQueryResponse(overrides = {}) {
  const response = {
    MerchantID: '3002607',
    MerchantTradeNo: overrides.MerchantTradeNo,
    StoreID: '',
    TradeNo: overrides.TradeNo || '2404241234567890',
    TradeAmt: String(overrides.TradeAmt),
    PaymentDate: overrides.PaymentDate || '',
    PaymentType: overrides.PaymentType || 'Credit_CreditCard',
    HandlingCharge: '0',
    PaymentTypeChargeFee: '0',
    TradeDate: '2026/04/24 10:20:30',
    TradeStatus: overrides.TradeStatus || '1',
    ItemName: '測試商品',
    CustomField1: '',
    CustomField2: '',
    CustomField3: '',
    CustomField4: '',
  };
  response.CheckMacValue = generateCheckMacValue(
    response,
    'pwFHCqoQZGmho4w6',
    'EkRm7iFT261dpevs'
  );
  return response;
}

function buildPaymentInfoResponse(merchantTradeNo) {
  const response = {
    MerchantID: '3002607',
    MerchantTradeNo: merchantTradeNo,
    TradeNo: '2404241234567890',
    PaymentNo: 'CVS123456789',
    PaymentURL: 'https://example.com/pay',
    ExpireDate: '2026/04/30 23:59:59',
  };
  response.CheckMacValue = generateCheckMacValue(
    response,
    'pwFHCqoQZGmho4w6',
    'EkRm7iFT261dpevs'
  );
  return response;
}

function createMerchantTradeNo() {
  return `F${Date.now().toString().slice(-10)}${uuidv4().replace(/-/g, '').slice(0, 9).toUpperCase()}`.slice(0, 20);
}

describe('Public ECPay routes', () => {
  let userId;
  let productId;

  beforeAll(async () => {
    const { user } = await registerUser();
    userId = user.id;
    productId = uuidv4();

    db.prepare(
      'INSERT INTO products (id, name, description, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(productId, 'ECPay 路由測試商品', 'for public routes', 990, 999, null);
  });

  function createOrder() {
    const orderId = uuidv4();
    db.prepare(
      `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(orderId, `ORD-TEST-${Date.now()}`, userId, '路由測試收件人', 'route@example.com', '台北市路由測試路 1 號', 990);

    db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), orderId, productId, 'ECPay 路由測試商品', 990, 1);

    return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  }

  it('should redirect /ecpay/client-back to success after a verified paid result', async () => {
    const order = createOrder();
    const merchantTradeNo = createMerchantTradeNo();
    db.prepare('UPDATE orders SET ecpay_merchant_trade_no = ? WHERE id = ?').run(merchantTradeNo, order.id);

    const queryResponse = buildTradeQueryResponse({
      MerchantTradeNo: merchantTradeNo,
      TradeAmt: order.total_amount,
      TradeStatus: '1',
      PaymentType: 'Credit_CreditCard',
      PaymentDate: '2026/04/24 10:30:00',
    });

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => new URLSearchParams(queryResponse).toString(),
    }));

    try {
      const res = await request(app)
        .get(`/ecpay/client-back?orderId=${order.id}`)
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/orders/${order.id}?payment=success`);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should store offline payment info on /ecpay/client-redirect and redirect to returned', async () => {
    const order = createOrder();
    const merchantTradeNo = createMerchantTradeNo();
    db.prepare('UPDATE orders SET ecpay_merchant_trade_no = ? WHERE id = ?').run(merchantTradeNo, order.id);

    const queryResponse = buildTradeQueryResponse({
      MerchantTradeNo: merchantTradeNo,
      TradeAmt: order.total_amount,
      TradeStatus: '0',
      PaymentType: 'CVS_CVS',
    });
    const paymentInfoResponse = buildPaymentInfoResponse(merchantTradeNo);

    const originalFetch = global.fetch;
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => new URLSearchParams(queryResponse).toString(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => new URLSearchParams(paymentInfoResponse).toString(),
      });

    try {
      const res = await request(app)
        .post(`/ecpay/client-redirect?orderId=${order.id}`)
        .type('form')
        .send({ MerchantTradeNo: merchantTradeNo })
        .redirects(0);

      expect(res.status).toBe(303);
      expect(res.headers.location).toBe(`/orders/${order.id}?payment=returned`);

      const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      expect(updatedOrder.status).toBe('pending');
      expect(JSON.parse(updatedOrder.ecpay_payment_info)).toMatchObject({
        PaymentNo: 'CVS123456789',
        PaymentURL: 'https://example.com/pay',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should always return 1|OK from /ecpay/notify and reconcile the order when possible', async () => {
    const order = createOrder();
    const merchantTradeNo = createMerchantTradeNo();
    db.prepare('UPDATE orders SET ecpay_merchant_trade_no = ? WHERE id = ?').run(merchantTradeNo, order.id);

    const queryResponse = buildTradeQueryResponse({
      MerchantTradeNo: merchantTradeNo,
      TradeAmt: order.total_amount,
      TradeStatus: '1',
      PaymentType: 'Credit_CreditCard',
      PaymentDate: '2026/04/24 10:35:00',
    });

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => new URLSearchParams(queryResponse).toString(),
    }));

    try {
      const res = await request(app)
        .post('/ecpay/notify')
        .type('form')
        .send({ MerchantTradeNo: merchantTradeNo });

      expect(res.status).toBe(200);
      expect(res.text).toBe('1|OK');

      const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      expect(updatedOrder.status).toBe('paid');
      expect(updatedOrder.ecpay_trade_status).toBe('1');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
