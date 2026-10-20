/** Sample intakes of the business templates (P6.14), shared by the shared, canvas and contract tests. */
export const BUSINESS_IDS = ['sales-account', 'partnership', 'vendor-selection', 'market-entry'] as const;
export type BusinessId = (typeof BUSINESS_IDS)[number];

/** A valid intake for each template (the first field is the subject). */
export const SAMPLE_INTAKE: Record<(typeof BUSINESS_IDS)[number], Record<string, string | string[]>> = {
  'sales-account': {
    company: 'Globex Logistics',
    website: 'globex.com',
    offer: 'A route-optimisation platform',
    goal: 'Demo',
    contacts: 'Ada Lovelace, VP Operations, https://linkedin.com/in/ada',
    sites: ['linkedin.com'],
    depth: 'standard',
  },
  partnership: {
    partner: 'Initech',
    website: 'initech.com',
    goal: 'Reach mid-market banks through their channel',
    kind: 'Channel / reseller',
    sites: ['crunchbase.com'],
    depth: 'standard',
  },
  'vendor-selection': {
    need: 'A customer support platform',
    requirements: 'Shared inbox, SSO, a public API and EU data residency',
    budget: '$40k per year',
    vendors: ['Zendesk', 'Intercom'],
    sites: ['g2.com'],
    depth: 'standard',
  },
  'market-entry': {
    country: 'Germany',
    offer: 'A B2B invoicing app for small firms',
    mode: 'Direct (local entity)',
    sites: ['linkedin.com'],
    depth: 'standard',
  },
};

