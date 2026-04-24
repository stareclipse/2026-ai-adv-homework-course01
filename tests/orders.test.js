const { v4: uuidv4 } = require('uuid');
const db = require('../src/database');
const { app, request, registerUser } = require('./setup');
const {
  generateCheckMacValue,
} = require('../src/services/ecpayService');

describe('Orders API', () => {
  let userToken;
  let productId;
  let orderId;

  beforeAll(async () => {
    // Register a user for order tests
    const { token } = await registerUser();
    userToken = token;

    productId = uuidv4();
    db.prepare(
      'INSERT INTO products (id, name, description, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(productId, '訂單測試商品', 'for order tests', 1680, 999, null);
  });

  async function addItemToCart(quantity = 1) {
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity });
  }

  async function createOrderForPaymentTest() {
    await addItemToCart();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '金流測試收件人',
        recipientEmail: 'payment-test@example.com',
        recipientAddress: '台北市金流測試路 789 號',
      });

    return res.body.data;
  }

  it('should create an order from cart', async () => {
    await addItemToCart();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data).toHaveProperty('status', 'pending');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);

    orderId = res.body.data.id;
  });

  it('should fail to create order with empty cart', async () => {
    // The cart was already cleared by the previous order
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

  it('should fail to create order without auth', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should get order list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('orders');
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('should get order detail', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', orderId);
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('should create an ECPay ALL checkout form for a pending order', async () => {
    const paymentOrder = await createOrderForPaymentTest();

    const res = await request(app)
      .post(`/api/orders/${paymentOrder.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('action', 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
    expect(res.body.data).toHaveProperty('method', 'POST');
    expect(res.body.data.params).toMatchObject({
      MerchantID: '3002607',
      PaymentType: 'aio',
      TotalAmount: String(paymentOrder.total_amount),
      ChoosePayment: 'ALL',
      EncryptType: '1',
    });
    expect(res.body.data.params.MerchantTradeNo).toMatch(/^[A-Za-z0-9]{1,20}$/);
    expect(res.body.data.params.CheckMacValue).toMatch(/^[A-F0-9]{64}$/);
    expect(res.body.data.params.HashKey).toBeUndefined();
    expect(res.body.data.params.HashIV).toBeUndefined();
  });

  it('should issue a fresh ECPay merchant trade number for each checkout attempt', async () => {
    const paymentOrder = await createOrderForPaymentTest();

    const firstRes = await request(app)
      .post(`/api/orders/${paymentOrder.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);

    const secondRes = await request(app)
      .post(`/api/orders/${paymentOrder.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.params.MerchantTradeNo)
      .not.toBe(firstRes.body.data.params.MerchantTradeNo);
  });

  it('should query ECPay and mark the order paid only after verified TradeStatus is paid', async () => {
    const paymentOrder = await createOrderForPaymentTest();
    await request(app)
      .post(`/api/orders/${paymentOrder.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);

    const detailRes = await request(app)
      .get(`/api/orders/${paymentOrder.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    const merchantTradeNo = detailRes.body.data.ecpay_merchant_trade_no;

    const ecpayResponse = {
      MerchantID: '3002607',
      MerchantTradeNo: merchantTradeNo,
      StoreID: '',
      TradeNo: '2304241234567890',
      TradeAmt: String(paymentOrder.total_amount),
      PaymentDate: '2026/04/23 10:30:00',
      PaymentType: 'Credit_CreditCard',
      HandlingCharge: '0',
      PaymentTypeChargeFee: '0',
      TradeDate: '2026/04/23 10:20:30',
      TradeStatus: '1',
      ItemName: '測試商品',
      CustomField1: '',
      CustomField2: '',
      CustomField3: '',
      CustomField4: '',
    };
    ecpayResponse.CheckMacValue = generateCheckMacValue(
      ecpayResponse,
      'pwFHCqoQZGmho4w6',
      'EkRm7iFT261dpevs'
    );

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => new URLSearchParams(ecpayResponse).toString(),
    }));

    try {
      const res = await request(app)
        .post(`/api/orders/${paymentOrder.id}/ecpay/query`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('error', null);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.ecpay_trade_no).toBe('2304241234567890');
      expect(res.body.data.ecpay_payment_type).toBe('Credit_CreditCard');
      expect(res.body.data.paymentResult).toMatchObject({
        tradeStatus: '1',
        paymentStatus: 'paid',
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it.each(['10100248', '10100254', '10100058'])('should map TradeStatus %s to failed', async (tradeStatus) => {
    const paymentOrder = await createOrderForPaymentTest();
    await request(app)
      .post(`/api/orders/${paymentOrder.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);

    const detailRes = await request(app)
      .get(`/api/orders/${paymentOrder.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    const merchantTradeNo = detailRes.body.data.ecpay_merchant_trade_no;

    const ecpayResponse = {
      MerchantID: '3002607',
      MerchantTradeNo: merchantTradeNo,
      StoreID: '',
      TradeNo: '2304241234567891',
      TradeAmt: String(paymentOrder.total_amount),
      PaymentDate: '',
      PaymentType: 'Credit_CreditCard',
      HandlingCharge: '0',
      PaymentTypeChargeFee: '0',
      TradeDate: '2026/04/24 11:10:00',
      TradeStatus: tradeStatus,
      ItemName: '測試商品',
      CustomField1: '',
      CustomField2: '',
      CustomField3: '',
      CustomField4: '',
    };
    ecpayResponse.CheckMacValue = generateCheckMacValue(
      ecpayResponse,
      'pwFHCqoQZGmho4w6',
      'EkRm7iFT261dpevs'
    );

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => new URLSearchParams(ecpayResponse).toString(),
    }));

    try {
      const res = await request(app)
        .post(`/api/orders/${paymentOrder.id}/ecpay/query`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('failed');
      expect(res.body.data.paymentResult).toMatchObject({
        tradeStatus,
        paymentStatus: 'failed',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should reject the legacy simulated payment endpoint', async () => {
    const paymentOrder = await createOrderForPaymentTest();

    const res = await request(app)
      .patch(`/api/orders/${paymentOrder.id}/pay`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'success' });

    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({
      data: null,
      error: 'PAYMENT_FLOW_REMOVED',
    });
  });

  it('should return 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/orders/non-existent-order-id')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });
});
