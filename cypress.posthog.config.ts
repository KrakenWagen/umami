import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/posthog-sdk.cy.ts',
    excludeSpecPattern: [],
  },
  env: {
    umami_user: 'admin',
    umami_password: 'umami',
    umami_user_id: '41e2b680-648e-4b09-bcd7-3e2b10c06264',
  },
});
