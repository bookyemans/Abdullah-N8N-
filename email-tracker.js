/*
 * DEPRECATED: Email-open tracking is now handled server-side by
 * functions/pixel.html.js at /pixel.html.
 * Do not load this legacy browser script in production: email clients do not
 * execute JavaScript inside an <img> resource, and client-side counters are not
 * reliable across devices. Kept as a migration marker for older deployments.
 */
(function () {
  'use strict';
  if (typeof window !== 'undefined' && window.console) {
    console.info('[EmailTracker] Legacy client tracker is deprecated; use the /pixel.html image endpoint.');
  }
})();
