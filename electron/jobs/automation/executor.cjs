'use strict';

function createSafeExecutor({ browser } = {}) {
  if (!browser || typeof browser.advance !== 'function') throw new Error('A browser adapter is required.');
  return async function executeSafeStep(plan) {
    if (plan.actionType !== 'handoff') return { status: 'blocked', reason: 'unsupported_safe_action' };
    // applicationBrowser.advance owns the exact-label, visible-only safety
    // check. This adapter only permits the non-submission handoff action.
    return browser.advance({ handoffOnly: true });
  };
}

module.exports = { createSafeExecutor };
