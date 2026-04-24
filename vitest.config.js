import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.js'],
    exclude: ['.tmp-ref-*/**', 'node_modules/**'],
    fileParallelism: false,
    sequence: {
      files: [
        'tests/ecpayService.test.js',
        'tests/ecpayRoutes.test.js',
        'tests/auth.test.js',
        'tests/products.test.js',
        'tests/cart.test.js',
        'tests/orders.test.js',
        'tests/adminProducts.test.js',
        'tests/adminOrders.test.js',
      ],
    },
    hookTimeout: 10000,
  },
});
