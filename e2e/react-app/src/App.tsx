import { Link, Route, Routes } from 'react-router-dom';
import { usePostHog } from 'posthog-js/react';

export function App() {
  return (
    <>
      <nav>
        <Link to="/" data-test="link-home">
          Home
        </Link>
        <Link to="/pricing" data-test="link-pricing">
          Pricing
        </Link>
        <Link to="/docs" data-test="link-docs">
          Docs
        </Link>
      </nav>
      <Routes>
        <Route path="/" element={<Page title="Home" />} />
        <Route path="/pricing" element={<Page title="Pricing" />} />
        <Route path="/docs" element={<Docs />} />
      </Routes>
    </>
  );
}

function Page({ title }: { title: string }) {
  return (
    <main>
      <h1>{title}</h1>
    </main>
  );
}

function Docs() {
  const posthog = usePostHog();

  return (
    <main>
      <h1>Docs</h1>
      <button
        type="button"
        data-test="button-signup"
        onClick={() => posthog.capture('signed up', { plan: 'pro' })}
      >
        Sign up
      </button>
    </main>
  );
}
