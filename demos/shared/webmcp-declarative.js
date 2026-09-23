/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Declarative WebMCP layer.
 *
 * The vendored webmcp-polyfill.js implements the imperative WebMCP API only
 * (registerTool / getTools / executeTool). This file adds the experimental
 * declarative surface that Chrome prototypes, on top of that API rather than
 * as a fork of it:
 *
 *   - `<form toolname tooldescription>` is exposed as a tool.
 *   - `toolparamdescription` on form controls feeds the generated inputSchema.
 *   - `toolautosubmit` submits the form without waiting for the user.
 *   - The submit event gains `agentInvoked` and `respondWith()`.
 *   - `toolactivated` / `toolcancel` events fire on `window`.
 *   - `:tool-form-active` / `:tool-submit-active` are rewritten to classes.
 *
 * Load it AFTER webmcp-polyfill.js:
 *
 *   <script src="../shared/webmcp-polyfill.js"></script>
 *   <script src="../shared/webmcp-declarative.js"></script>
 *
 * It is also safe to load on browsers with native WebMCP support: if the
 * browser already handles declarative forms itself, registration is skipped
 * for tools it has already claimed.
 */

(function () {
  const modelContext = document.modelContext;
  if (!modelContext) {
    // No native support and the polyfill declined to install, which happens
    // outside a secure context. Serve the demos over https:// or localhost.
    return;
  }

  const FORM_ACTIVE_CLASS = 'tool-form-active';
  const SUBMIT_ACTIVE_CLASS = 'tool-submit-active';
  const AUTOSUBMIT_TIMEOUT_MS = 5000;

  /** @type {Map<HTMLFormElement, {name: string, signature: string, controller: AbortController}>} */
  const registrations = new Map();

  /**
   * Forms whose registration was rejected, keyed by the signature that failed.
   * Prevents retrying, and re-warning about, an unchanged form on every mutation.
   * @type {WeakMap<HTMLFormElement, string>}
   */
  const rejected = new WeakMap();

  // ---------------------------------------------------------------------------
  // Schema generation
  // ---------------------------------------------------------------------------

  function buildInputSchema(form) {
    const properties = {};
    const required = [];

    // Hidden inputs are not agent-fillable, and pages commonly append them at
    // runtime (from URL params, CSRF tokens, ...). Including them would leak
    // implementation detail into the schema and churn the registration.
    const elements = form.querySelectorAll(
      'input[name]:not([type="hidden"]), select[name], textarea[name]'
    );
    for (const el of elements) {
      const propName = el.name;
      const propDesc = el.getAttribute('toolparamdescription') || '';
      let type = 'string';
      let enumValues;

      if (el.tagName === 'SELECT') {
        type = 'string';
        enumValues = Array.from(el.options).map((opt) => opt.value || opt.text);
      } else if (el.type === 'number' || el.type === 'range') {
        type = 'number';
      } else if (el.type === 'checkbox') {
        type = 'boolean';
      }

      const property = { type };
      if (propDesc) {
        property.description = propDesc;
      }
      if (enumValues) {
        property.enum = enumValues;
      }
      properties[propName] = property;

      if (el.hasAttribute('required')) {
        required.push(propName);
      }
    }

    const inputSchema = { type: 'object', properties };
    if (required.length > 0) {
      inputSchema.required = required;
    }
    return inputSchema;
  }

  function describe(form) {
    const name = form.getAttribute('toolname');
    const description = form.getAttribute('tooldescription') || '';
    const inputSchema = buildInputSchema(form);
    return {
      name,
      description,
      inputSchema,
      // Re-register whenever anything the agent can observe changes.
      signature: JSON.stringify([name, description, inputSchema]),
    };
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  function fillForm(form, args) {
    for (const [key, value] of Object.entries(args)) {
      const input = form.elements[key] || form.querySelector(`[name="${CSS.escape(key)}"]`);
      if (!input) {
        continue;
      }
      if (input.tagName === 'SELECT') {
        input.value = value;
      } else if (input.type === 'checkbox') {
        input.checked = !!value;
      } else if (input.type === 'radio' || (input.length && input[0]?.type === 'radio')) {
        const radio = form.querySelector(
          `input[name="${CSS.escape(key)}"][value="${CSS.escape(String(value))}"]`
        );
        if (radio) {
          radio.checked = true;
        }
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function notify(type, toolName) {
    const event = new Event(type);
    event.toolName = toolName;
    window.dispatchEvent(event);
  }

  function executeForm(form, toolName, args, options) {
    fillForm(form, args || {});

    form.classList.add(FORM_ACTIVE_CLASS);
    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      submitBtn.classList.add(SUBMIT_ACTIVE_CLASS);
    }

    notify('toolactivated', toolName);

    return new Promise((resolve, reject) => {
      let settled = false;
      let observer;
      let autosubmitTimer;

      const cleanup = () => {
        form.classList.remove(FORM_ACTIVE_CLASS);
        if (submitBtn) {
          submitBtn.classList.remove(SUBMIT_ACTIVE_CLASS);
        }
        form.removeEventListener('reset', onReset);
        form.removeEventListener('submit', onSubmit, { capture: true });
        observer?.disconnect();
        clearTimeout(autosubmitTimer);
      };

      const cancel = (reason) => {
        if (settled) return;
        settled = true;
        cleanup();
        notify('toolcancel', toolName);
        if (reason) {
          reject(reason);
        } else {
          resolve(null);
        }
      };

      const succeed = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const signal = options?.signal;
      if (signal) {
        if (signal.aborted) {
          cleanup();
          reject(signal.reason || new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener(
          'abort',
          () => cancel(signal.reason || new DOMException('Aborted', 'AbortError')),
          { once: true }
        );
      }

      const onReset = () => cancel();
      form.addEventListener('reset', onReset);

      const onSubmit = (e) => {
        if (settled) return;
        e.agentInvoked = true;
        e.respondWith = (value) => {
          Promise.resolve(value).then(succeed, (err) => succeed({ error: err?.message || String(err) }));
        };
      };
      form.addEventListener('submit', onSubmit, { capture: true });

      // Removing the form, or renaming the tool mid-flight, cancels the call.
      observer = new MutationObserver((mutations) => {
        const formRemoved = !form.isConnected;
        const renamed = mutations.some(
          (m) =>
            m.type === 'attributes' &&
            m.target === form &&
            (m.attributeName === 'toolname' || m.attributeName === 'tooldescription')
        );
        if (formRemoved || renamed) {
          cancel();
        }
      });
      observer.observe(form, { attributes: true });
      if (form.parentNode) {
        observer.observe(form.parentNode, { childList: true });
      }

      if (form.hasAttribute('toolautosubmit')) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        // Guard against pages that never call respondWith().
        autosubmitTimer = setTimeout(() => {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(null);
          }
        }, AUTOSUBMIT_TIMEOUT_MS);
      } else if (submitBtn) {
        submitBtn.focus();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Registration lifecycle
  // ---------------------------------------------------------------------------

  function unregister(form) {
    const registration = registrations.get(form);
    if (!registration) return;
    registrations.delete(form);
    // registerTool() rejects its own promise on abort; that rejection is handled
    // where the registration was created.
    registration.controller.abort();
  }

  function register(form) {
    const { name, description, inputSchema, signature } = describe(form);

    if (!name) {
      return;
    }
    if (!description) {
      rejected.set(form, signature);
      console.warn(
        `[webmcp-declarative] Skipping form[toolname="${name}"]: ` +
          'a tool description cannot be empty. Add a tooldescription attribute.'
      );
      return;
    }

    const controller = new AbortController();
    registrations.set(form, { name, signature, controller });

    modelContext
      .registerTool(
        {
          name,
          description,
          inputSchema,
          execute: (args, options) => executeForm(form, name, args, options),
        },
        { signal: controller.signal }
      )
      .catch((error) => {
        if (controller.signal.aborted) {
          return; // Expected: the form changed or went away.
        }
        registrations.delete(form);
        rejected.set(form, signature);
        if (error?.name === 'InvalidStateError') {
          const clash = [...registrations].some(([, r]) => r.name === name);
          if (!clash) {
            // Already exposed by the browser, which handles declarative forms
            // natively. Nothing to polyfill.
            return;
          }
        }
        console.warn(`[webmcp-declarative] Could not register form[toolname="${name}"]:`, error);
      });
  }

  function sync() {
    const forms = new Set(document.querySelectorAll('form[toolname]'));

    // Drop registrations whose form disappeared or whose shape changed.
    for (const [form, registration] of [...registrations]) {
      if (!forms.has(form) || describe(form).signature !== registration.signature) {
        unregister(form);
      }
    }

    for (const form of forms) {
      if (registrations.has(form)) {
        continue;
      }
      // Do not retry, or re-warn about, a form that already failed unchanged.
      if (rejected.get(form) === describe(form).signature) {
        continue;
      }
      register(form);
    }
  }

  // Run immediately so that forms above this script tag are registered before
  // deferred module scripts call getTools().
  sync();

  let pending = false;
  const scheduleSync = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      sync();
    });
  };

  new MutationObserver(scheduleSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'toolname',
      'tooldescription',
      'toolparamdescription',
      'name',
      'required',
      'type',
    ],
  });

  // ---------------------------------------------------------------------------
  // :tool-form-active / :tool-submit-active
  // ---------------------------------------------------------------------------

  function rewriteCSSText(text) {
    const rewritten = text
      .replace(/:tool-form-active/g, `.${FORM_ACTIVE_CLASS}`)
      .replace(/:tool-submit-active/g, `.${SUBMIT_ACTIVE_CLASS}`);
    return rewritten !== text ? rewritten : null;
  }

  function appendStyle(css) {
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function polyfillPseudoClasses() {
    const inlineRewrites = [];

    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.href) {
        // External sheets must be refetched: the parser has already dropped the
        // rules it considered invalid, so cssRules no longer contains them.
        fetch(sheet.href)
          .then((res) => res.text())
          .then((text) => {
            const rewritten = rewriteCSSText(text);
            if (rewritten) {
              appendStyle(rewritten);
            }
          })
          .catch(() => {});
        continue;
      }
      try {
        for (const rule of Array.from(sheet.cssRules || [])) {
          const rewritten = rewriteCSSText(rule.cssText);
          if (rewritten) {
            inlineRewrites.push(rewritten);
          }
        }
      } catch {
        // Cross-origin sheet without CORS; nothing to rewrite.
      }
    }

    for (const styleTag of Array.from(document.querySelectorAll('style'))) {
      const rewritten = rewriteCSSText(styleTag.textContent);
      if (rewritten) {
        inlineRewrites.push(rewritten);
      }
    }

    if (inlineRewrites.length > 0) {
      appendStyle(inlineRewrites.join('\n'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      sync();
      polyfillPseudoClasses();
    });
  } else {
    polyfillPseudoClasses();
  }
})();
