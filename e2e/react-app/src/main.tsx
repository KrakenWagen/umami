import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PostHogProvider } from 'posthog-js/react';
import { App } from './App';

const params = new URLSearchParams(window.location.search);
const token = params.get('token') ?? '';
const host = params.get('host') ?? '';

createRoot(document.getElementById('root')!).render(
  <PostHogProvider
    apiKey={token}
    options={{
      api_host: host,
      defaults: '2026-08-30',
      // This server has no flags, surveys, or remote config.
      advanced_disable_flags: true,
      disable_session_recording: true,
      disable_surveys: true,
      // Cypress sets navigator.webdriver, which posthog-js treats as a bot and drops.
      opt_out_useragent_filter: true,
    }}
  >
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </PostHogProvider>,
);
