/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const params = new URLSearchParams(window.location.search);
const isIframe = params.has('agentiframe');
const isPersistentWidget = params.has('agentpersistentwidget');

if (isIframe || isPersistentWidget) {
  document.getElementById('agent-container')?.remove();

  const isOpened = params.has('agentopened');
  const el = document.createElement(isPersistentWidget ? 'persistentwidget' : 'iframe');

  if (isPersistentWidget) {
    el.id = 'agent-persistentwidget';
    // Keep src deterministic across navigations so the browsing context persists.
    const searchParams = new URLSearchParams();
    if (params.has('sharedworker')) searchParams.set('sharedworker', '');
    if (params.has('agentopened')) searchParams.set('agentopened', '');
    const queryString = searchParams.toString();
    el.src = 'agent.html' + (queryString ? '?' + queryString : '');
  } else {
    el.src = 'agent.html' + window.location.search;
  }

  el.style.position = 'fixed';
  el.style.bottom = '0';
  el.style.right = '0';
  el.style.width = isOpened ? '414px' : '100px';
  el.style.height = isOpened ? '634px' : '100px';
  el.style.border = 'none';
  el.style.zIndex = '1000';
  document.body.appendChild(el);

  if (isPersistentWidget) {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'AGENT_VISIBILITY_CHANGE') {
        el.style.width = event.data.isOpen ? '414px' : '100px';
        el.style.height = event.data.isOpen ? '634px' : '100px';
        const url = new URL(window.location);
        if (event.data.isOpen) {
          url.searchParams.set('agentopened', '');
        } else {
          url.searchParams.delete('agentopened');
        }
        window.history.replaceState({}, '', url.toString().replace(/=(?=&|$)/g, ''));
      }
    });
  }
} else {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = 'agent.js';
  document.body.appendChild(script);
}
