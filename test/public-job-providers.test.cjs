const assert = require('node:assert/strict');
const test = require('node:test');
const { matches, matchesRequestedLocation } = require('../electron/public-job-providers.cjs');

test('public-feed matching requires the searched role signal in the title', () => {
  assert.equal(matches('Forward Deployed Engineer', { title: 'Forward Deployed AI Engineer', description: 'Build agentic systems', category: '' }), true);
  assert.equal(matches('Forward Deployed Engineer', { title: 'Head of Marketing', description: 'Partner with the forward deployed engineering team', category: '' }), false);
});

test('Arbeitnow keeps remote listings available alongside a Dallas search', () => {
  assert.equal(matchesRequestedLocation({ location: 'Berlin' }, { locationName: 'Dallas, TX' }, { remotePreference: 'any' }), false);
  assert.equal(matchesRequestedLocation({ location: 'Remote' }, { locationName: 'Dallas, TX' }, { remotePreference: 'any' }), true);
  assert.equal(matchesRequestedLocation({ location: 'Remote' }, { locationName: 'Dallas, TX' }, { remotePreference: 'remote' }), true);
  assert.equal(matchesRequestedLocation({ location: 'Dallas, TX' }, { locationName: 'Dallas, TX' }, { remotePreference: 'any' }), true);
});
