const {
  buildCheckoutForm,
  generateCheckMacValue,
  verifyCheckMacValue,
} = require('../src/services/ecpayService');

describe('ECPay AIO service', () => {
  const config = {
    merchantId: '3002607',
    hashKey: 'pwFHCqoQZGmho4w6',
    hashIv: 'EkRm7iFT261dpevs',
    env: 'staging',
  };

  it('should generate the official SHA256 CheckMacValue test vector', () => {
    const params = {
      MerchantID: '3002607',
      MerchantTradeNo: 'Test1234567890',
      MerchantTradeDate: '2025/01/01 12:00:00',
      PaymentType: 'aio',
      TotalAmount: '100',
      TradeDesc: '測試',
      ItemName: '測試商品',
      ReturnURL: 'https://example.com/notify',
      ChoosePayment: 'ALL',
      EncryptType: '1',
    };

    expect(generateCheckMacValue(params, config.hashKey, config.hashIv))
      .toBe('291CBA324D31FB5A4BBBFDF2CFE5D32598524753AFD4959C3BF590C5B2F57FB2');
  });

  it('should verify CheckMacValue using a timing-safe comparison', () => {
    const params = {
      MerchantID: '3002607',
      MerchantTradeNo: 'Test1234567890',
      TotalAmount: '100',
    };
    params.CheckMacValue = generateCheckMacValue(params, config.hashKey, config.hashIv);

    expect(verifyCheckMacValue(params, config.hashKey, config.hashIv)).toBe(true);
    expect(verifyCheckMacValue({ ...params, TotalAmount: '101' }, config.hashKey, config.hashIv)).toBe(false);
  });

  it('should build an ALL payment checkout form without exposing secrets', () => {
    const result = buildCheckoutForm({
      order: { id: 'order-1', total_amount: 1680 },
      items: [
        { product_name: '粉色玫瑰花束', quantity: 1 },
        { product_name: '白色百合花禮盒', quantity: 2 },
      ],
      merchantTradeNo: 'F260423102030ABCD',
      baseUrl: 'http://localhost:3001',
      now: new Date('2026-04-23T02:20:30.000Z'),
    }, config);

    expect(result.action).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
    expect(result.method).toBe('POST');
    expect(result.params).toMatchObject({
      MerchantID: '3002607',
      MerchantTradeNo: 'F260423102030ABCD',
      MerchantTradeDate: '2026/04/23 10:20:30',
      PaymentType: 'aio',
      TotalAmount: '1680',
      TradeDesc: 'Flower Shop Order',
      ItemName: '粉色玫瑰花束 x 1#白色百合花禮盒 x 2',
      ReturnURL: 'http://localhost:3001/ecpay/notify',
      ClientBackURL: 'http://localhost:3001/ecpay/client-back?orderId=order-1',
      ClientRedirectURL: 'http://localhost:3001/ecpay/client-redirect?orderId=order-1',
      ChoosePayment: 'ALL',
      EncryptType: '1',
    });
    expect(result.params.CheckMacValue).toMatch(/^[A-F0-9]{64}$/);
    expect(result.params.HashKey).toBeUndefined();
    expect(result.params.HashIV).toBeUndefined();
  });
});
