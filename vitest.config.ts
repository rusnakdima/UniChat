import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  plugins: [],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    globals: true,
    // Do NOT auto-restore mocks after each test — vi.restoreAllMocks() resets
    // vi.mock module return values (e.g. Angular Core Injector.create /
    // runInInjectionContext), breaking subsequent tests that need them.
    restoreMocks: false,
  },
  resolve: {
    alias: {
      '@app': resolve(__dirname, 'src/app'),
      '@components': resolve(__dirname, 'src/app/components'),
      '@directives': resolve(__dirname, 'src/app/directives'),
      '@features': resolve(__dirname, 'src/app/features'),
      '@entities': resolve(__dirname, 'src/app/entities'),
      '@services': resolve(__dirname, 'src/app/services'),
      '@core': resolve(__dirname, 'src/app/core'),
      '@shared': resolve(__dirname, 'src/app/shared'),
      '@store': resolve(__dirname, 'src/app/store'),
      '@pages': resolve(__dirname, 'src/app/pages'),
      '@utils': resolve(__dirname, 'src/app/utils'),
      '@tauri-front/shared': resolve(__dirname, '../tauri-front-shared/projects/shared/dist'),
    },
  },
});
