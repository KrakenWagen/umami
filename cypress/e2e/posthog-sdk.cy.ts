import { uuid } from '../../src/lib/crypto';

const fixtureOrigin = 'http://127.0.0.1:5173';

type StoredEvent = {
  eventName: string | null;
  urlPath: string;
  eventType: number | string;
};

describe('PostHog browser SDK', () => {
  const websiteId = uuid();

  before(() => {
    cy.login(Cypress.env('umami_user'), Cypress.env('umami_password'));
    cy.then(() => {
      cy.request({
        method: 'POST',
        url: '/api/websites',
        headers: {
          'Content-Type': 'application/json',
          Authorization: Cypress.env('authorization'),
        },
        body: {
          id: websiteId,
          name: 'PostHog fixture',
          domain: '127.0.0.1',
        },
      }).then(response => {
        expect(response.status).to.eq(200);
      });
    });
  });

  after(() => {
    cy.deleteWebsite(websiteId);
  });

  it('stores navigations and a custom event from the react app', () => {
    const host = `${Cypress.config().baseUrl}/posthog`;

    // posthog-js flushes its queue to /e/. posthog-node uses /batch/. Same handler.
    cy.intercept('POST', /\/posthog\/(?:e|batch)\/?(?:\?|$)/).as('capture');

    // Electron and HeadlessChrome are classified as bots and the collector drops them.
    cy.wrap(
      Cypress.automation('remote:debugger:protocol', {
        command: 'Emulation.setUserAgentOverride',
        params: {
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      }),
    );

    cy.origin(fixtureOrigin, { args: { websiteId, host } }, ({ websiteId, host }) => {
      cy.intercept('POST', /\/posthog\/(?:e|batch)\/?(?:\?|$)/).as('flush');
      cy.visit(`/?token=${websiteId}&host=${encodeURIComponent(host)}`);
      cy.get('[data-test=link-pricing]').click();
      cy.get('[data-test=link-docs]').click();
      cy.get('[data-test=button-signup]').click();
      // The SDK flushes about 3s after the first event. Wait for that POST
      // before the document unloads and the rest goes out as a beacon.
      cy.wait('@flush', { timeout: 20000 });
    });

    cy.wait('@capture', { timeout: 20000 });

    const startAt = Date.now() - 60_000;
    const endAt = Date.now() + 60_000;

    const readEvents = (attempt = 0) => {
      cy.request({
        url: `/api/websites/${websiteId}/events`,
        qs: { startAt, endAt, pageSize: 50 },
        headers: { Authorization: Cypress.env('authorization') },
      }).then(response => {
        const events = response.body.data as StoredEvent[];
        const names = events.map(event => event.eventName);
        const paths = events.map(event => event.urlPath);
        const ready =
          names.includes('signed up') && paths.includes('/pricing') && paths.includes('/docs');

        if (!ready) {
          expect(attempt, `stored events ${names.join(', ')}`).to.be.lessThan(15);
          cy.then(() => readEvents(attempt + 1));
          return;
        }

        const pricing = events.find(
          event => event.urlPath === '/pricing' && Number(event.eventType) === 1,
        );
        const docs = events.find(
          event => event.urlPath === '/docs' && Number(event.eventType) === 1,
        );
        const signup = events.find(event => event.eventName === 'signed up');

        expect(pricing?.eventName ?? null).to.equal(null);
        expect(docs?.eventName ?? null).to.equal(null);
        expect(Number(signup?.eventType)).to.eq(2);

        cy.request({
          url: `/api/websites/${websiteId}/event-data/events`,
          qs: { startAt, endAt, event: 'signed up' },
          headers: { Authorization: Cypress.env('authorization') },
        }).then(properties => {
          const rows = properties.body as { propertyName: string; propertyValue: string }[];
          const plan = rows.find(row => row.propertyName === 'plan');
          expect(plan?.propertyValue).to.eq('pro');
        });

        cy.get('@capture.all').should(interceptions => {
          expect(interceptions.length).to.be.greaterThan(0);
          expect(interceptions.length).to.be.lessThan(events.length);
        });
      });
    };

    readEvents();
  });
});
