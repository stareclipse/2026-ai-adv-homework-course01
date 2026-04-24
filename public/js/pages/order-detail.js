const { createApp, ref, onMounted, onBeforeUnmount } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    const paymentResult = ref(el.dataset.paymentResult || null);

    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);
    const checking = ref(false);
    const autoRetryTimeoutId = ref(null);
    const autoRetryStep = ref(0);
    const autoRetryDelays = [30000, 120000, 600000];

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    const paymentMessages = {
      success: { text: '付款成功！感謝您的購買。', cls: 'bg-sage/10 text-sage border border-sage/20' },
      paid: { text: '付款成功！感謝您的購買。', cls: 'bg-sage/10 text-sage border border-sage/20' },
      pending: { text: '付款尚未完成，可稍後再查詢付款狀態。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
      failed: { text: '付款失敗，請重試。', cls: 'bg-red-50 text-red-600 border border-red-100' },
      returned: { text: '已返回商店，系統已先向綠界確認目前狀態。若仍待付款，請依下方資訊完成付款後再手動查詢。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
      error: { text: '付款狀態查詢失敗，請手動查詢或稍後再試。', cls: 'bg-red-50 text-red-600 border border-red-100' },
    };

    function submitForm(action, params) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = action;
      form.style.display = 'none';

      Object.keys(params).forEach(function (key) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = params[key];
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    }

    function stopAutoRetry() {
      if (autoRetryTimeoutId.value) {
        clearTimeout(autoRetryTimeoutId.value);
        autoRetryTimeoutId.value = null;
      }
    }

    function syncPaymentResultBanner(source) {
      if (!order.value) return;

      if (order.value.status === 'paid') {
        paymentResult.value = 'success';
        return;
      }

      if (order.value.status === 'failed') {
        paymentResult.value = 'failed';
        return;
      }

      if (source === 'returned') {
        paymentResult.value = 'returned';
        return;
      }

      if (source === 'pending' || source === 'error') {
        paymentResult.value = source;
        return;
      }

      paymentResult.value = null;
    }

    function shouldAutoRetry() {
      return Boolean(
        order.value &&
        order.value.status === 'pending' &&
        !order.value.ecpay_payment_info &&
        paymentResult.value === 'returned' &&
        autoRetryStep.value < autoRetryDelays.length
      );
    }

    function scheduleAutoRetry() {
      if (!shouldAutoRetry()) return;

      stopAutoRetry();
      const delay = autoRetryDelays[autoRetryStep.value];
      autoRetryStep.value += 1;

      autoRetryTimeoutId.value = setTimeout(async function () {
        if (!shouldAutoRetry()) return;

        try {
          await queryPaymentStatus(false, { keepReturnedBanner: true });
        } catch (_err) {
          // queryPaymentStatus already handles the state transition.
        }

        if (shouldAutoRetry()) {
          scheduleAutoRetry();
        }
      }, delay);
    }

    async function startEcpayPayment() {
      if (!order.value || paying.value || order.value.status !== 'pending') return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay/checkout', {
          method: 'POST'
        });
        // 提交表單會導向到綠界，不會立即返回，所以不需要重設 paying.value
        submitForm(res.data.action, res.data.params);
      } catch (e) {
        paying.value = false;
        Notification.show(e?.data?.message || '建立綠界付款失敗', 'error');
      }
    }

    async function queryPaymentStatus(showToast, options = {}) {
      if (!order.value || checking.value) return;
      checking.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay/query', {
          method: 'POST'
        });

        order.value = res.data;
        if (order.value.status === 'pending' && options.keepReturnedBanner) {
          syncPaymentResultBanner('returned');
        } else if (order.value.status === 'pending') {
          syncPaymentResultBanner('pending');
        } else {
          syncPaymentResultBanner(order.value.status);
        }

        if (order.value.status !== 'pending' || order.value.ecpay_payment_info) {
          stopAutoRetry();
        }

        if (showToast) Notification.show(res.message, order.value.status === 'paid' ? 'success' : 'info');
      } catch (e) {
        stopAutoRetry();
        syncPaymentResultBanner('error');
        if (showToast) Notification.show(e?.data?.message || '付款狀態查詢失敗', 'error');
      } finally {
        checking.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;

        if (paymentResult.value === 'success' || paymentResult.value === 'failed') {
          syncPaymentResultBanner(paymentResult.value);
        } else if (paymentResult.value === 'returned') {
          syncPaymentResultBanner('returned');
          autoRetryStep.value = 0;
          if (!order.value.ecpay_payment_info) {
            scheduleAutoRetry();
          }
        } else {
          syncPaymentResultBanner(null);
        }
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    onBeforeUnmount(() => {
      stopAutoRetry();
    });

    return {
      order,
      loading,
      paying,
      checking,
      paymentResult,
      statusMap,
      paymentMessages,
      startEcpayPayment,
      queryPaymentStatus
    };
  }
}).mount('#app');
