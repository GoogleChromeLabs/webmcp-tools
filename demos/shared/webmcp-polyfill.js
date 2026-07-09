/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

(function () {
  if (window.document.modelContext) {
    return;
  }

  window.__webmcp_registered_tools = window.__webmcp_registered_tools || new Map();

  function getLocalTools(win) {
    const tools = [];

    // 1. Imperative tools registered on this window
    if (win.__webmcp_registered_tools) {
      for (const tool of win.__webmcp_registered_tools.values()) {
        tools.push(tool);
      }
    }

    // 2. Declarative tools (forms) on this window
    const forms = win.document.querySelectorAll('form[toolname]');
    for (const form of forms) {
      const name = form.getAttribute('toolname');
      const description = form.getAttribute('tooldescription') || '';

      // Build inputSchema
      const properties = {};
      const required = [];
      const elements = form.querySelectorAll('input[name], select[name], textarea[name]');
      for (const el of elements) {
        const propName = el.name;
        const propDesc = el.getAttribute('toolparamdescription') || '';
        let type = 'string';
        let enumValues = undefined;

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

      const inputSchema = {
        type: 'object',
        properties,
      };
      if (required.length > 0) {
        inputSchema.required = required;
      }

      tools.push({
        name,
        description,
        inputSchema: JSON.stringify(inputSchema),
        window: win,
        origin: win.origin,
        _form: form,
      });
    }

    return tools;
  }

  function getRemoteTools(win) {
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).substring(2);
      const timer = setTimeout(() => {
        window.removeEventListener('message', listener);
        resolve([]);
      }, 500);

      const listener = (event) => {
        const { data } = event;
        if (data && data.type === 'WEBMCP_GET_TOOLS_RESPONSE' && data.requestId === requestId) {
          clearTimeout(timer);
          window.removeEventListener('message', listener);
          const toolsWithWindow = (data.tools || []).map((t) => ({
            ...t,
            window: win,
            _isRemote: true,
          }));
          resolve(toolsWithWindow);
        }
      };

      window.addEventListener('message', listener);
      win.postMessage({ type: 'WEBMCP_GET_TOOLS_REQUEST', requestId }, '*');
    });
  }

  class ModelContext extends EventTarget {
    #ontoolchange = null;

    get ontoolchange() {
      return this.#ontoolchange;
    }

    set ontoolchange(handler) {
      if (this.#ontoolchange) {
        this.removeEventListener('toolchange', this.#ontoolchange);
      }
      this.#ontoolchange = handler;
      if (handler) {
        this.addEventListener('toolchange', handler);
      }
    }

    async registerTool(tool, options = {}) {
      if (!tool || typeof tool !== 'object') {
        throw new DOMException('Invalid tool object', 'TypeError');
      }

      const name = tool.name;
      const description = tool.description;

      if (!name || typeof name !== 'string') {
        throw new DOMException('Invalid tool name', 'InvalidStateError');
      }
      if (!description || typeof description !== 'string') {
        throw new DOMException('Invalid tool description', 'InvalidStateError');
      }

      // Name length must be between 1 and 128, only ASCII alphanumeric, _, -, and .
      const nameRegex = /^[a-zA-Z0-9_.-]{1,128}$/;
      if (!nameRegex.test(name)) {
        throw new DOMException('Invalid tool name format', 'InvalidStateError');
      }

      if (window.__webmcp_registered_tools.has(name)) {
        throw new DOMException(`Tool "${name}" is already registered`, 'InvalidStateError');
      }

      let stringifiedInputSchema = '';
      if (tool.inputSchema) {
        try {
          stringifiedInputSchema = JSON.stringify(tool.inputSchema);
        } catch (e) {
          throw new TypeError('Failed to stringify inputSchema');
        }
      }

      const signal = options.signal;
      if (signal) {
        if (signal.aborted) {
          throw signal.reason || new DOMException('Aborted', 'AbortError');
        }
        signal.addEventListener('abort', () => {
          this.#unregisterTool(name);
        });
      }

      // Store a normalized tool copy with a stringified inputSchema
      const normalizedTool = {
        name,
        description,
        inputSchema: stringifiedInputSchema,
        window: window,
        origin: window.origin,
        annotations: tool.annotations,
        _execute: tool.execute,
      }

      window.__webmcp_registered_tools.set(name, normalizedTool);
      this.dispatchEvent(new Event('toolchange'));
    }

    #unregisterTool(name) {
      if (window.__webmcp_registered_tools.delete(name)) {
        this.dispatchEvent(new Event('toolchange'));
      }
    }

    async getTools(options = {}) {
      const allWindows = new Set([window]);
      if (window.parent) {
        allWindows.add(window.parent);
        try {
          for (let i = 0; i < window.parent.frames.length; i++) {
            allWindows.add(window.parent.frames[i]);
          }
        } catch (e) { }
      }
      try {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          if (iframe.contentWindow) {
            allWindows.add(iframe.contentWindow);
          }
        }
      } catch (e) { }

      const allTools = [];
      const remoteToolPromises = [];

      for (const win of allWindows) {
        if (win === window) {
          allTools.push(...getLocalTools(window));
        } else {
          remoteToolPromises.push(getRemoteTools(win));
        }
      }
      const remoteToolsResults = await Promise.all(remoteToolPromises);
      for (const remoteTools of remoteToolsResults) {
        allTools.push(...remoteTools);
      }
      const uniqueTools = [];
      const seenNames = new Set();
      for (const t of allTools) {
        if (!seenNames.has(t.name)) {
          seenNames.add(t.name);
          uniqueTools.push(t);
        }
      }

      const origins = Array.isArray(options?.fromOrigins) ? new Set(options.fromOrigins) : null;

      const filteredTools = uniqueTools.filter((t) =>
        t.origin === window.origin || (origins && origins.size > 0 && origins.has(t.origin))
      );

      return filteredTools;
    }

    async executeTool(tool, args) {
      const win = tool.window || window;

      if (tool._isRemote) {
        return new Promise((resolve, reject) => {
          const requestId = Math.random().toString(36).substring(2);
          const listener = (event) => {
            const { data } = event;
            if (data && data.type === 'WEBMCP_EXECUTE_TOOL_RESPONSE' && data.requestId === requestId) {
              window.removeEventListener('message', listener);
              if (data.success) {
                resolve(data.result);
              } else {
                reject(new Error(data.error));
              }
            }
          };
          window.addEventListener('message', listener);
          win.postMessage({
            type: 'WEBMCP_EXECUTE_TOOL_REQUEST',
            requestId,
            name: tool.name,
            args,
          }, '*');
        });
      }

      if (win !== window && win.document && win.document.modelContext && win.document.modelContext.executeTool) {
        return win.document.modelContext.executeTool(tool, args);
      }

      let parsedArgs = args;
      if (typeof args === 'string') {
        try {
          parsedArgs = JSON.parse(args);
        } catch (e) { }
      }

      // 1. Check if it's an imperative tool registered here
      if (win.__webmcp_registered_tools && win.__webmcp_registered_tools.has(tool.name)) {
        const registeredTool = win.__webmcp_registered_tools.get(tool.name);
        return registeredTool._execute(parsedArgs);
      }

      // 2. Check if it's a declarative tool
      const form = tool._form || win.document.querySelector(`form[toolname="${tool.name}"]`);
      if (!form) {
        throw new Error(`Tool ${tool.name} not found`);
      }

      // Apply styling classes
      form.classList.add('tool-form-active');
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        submitBtn.classList.add('tool-submit-active');
      }

      // Fill form fields
      for (const [key, value] of Object.entries(parsedArgs)) {
        const input = form.elements[key] || form.querySelector(`[name="${key}"]`);
        if (input) {
          if (input.tagName === 'SELECT') {
            input.value = value;
          } else if (input.type === 'checkbox') {
            input.checked = !!value;
          } else if (input.type === 'radio') {
            const radio = form.querySelector(`input[name="${key}"][value="${value}"]`);
            if (radio) radio.checked = true;
          } else {
            input.value = value;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Dispatch toolactivated event on the target window
      const activatedEvent = new Event('toolactivated');
      activatedEvent.toolName = tool.name;
      win.dispatchEvent(activatedEvent);

      return new Promise((resolve) => {
        let resolved = false;
        let observer;

        const cleanup = () => {
          form.classList.remove('tool-form-active');
          if (submitBtn) {
            submitBtn.classList.remove('tool-submit-active');
          }
          form.removeEventListener('reset', onReset);
          form.removeEventListener('submit', onSubmit, { capture: true });
          if (observer) {
            observer.disconnect();
          }
        };

        const onReset = () => {
          resolved = true;
          cleanup();
          const cancelEvent = new Event('toolcancel');
          cancelEvent.toolName = tool.name;
          win.dispatchEvent(cancelEvent);
          resolve(null);
        };
        form.addEventListener('reset', onReset);

        const onSubmit = (e) => {
          if (resolved) return;
          e.agentInvoked = true;
          e.respondWith = (val) => {
            if (val && typeof val.then === 'function') {
              val.then((actualVal) => {
                resolved = true;
                cleanup();
                resolve(actualVal);
              }).catch((err) => {
                resolved = true;
                cleanup();
                resolve({ error: err.message || err });
              });
            } else {
              resolved = true;
              cleanup();
              resolve(val);
            }
          };
        };
        form.addEventListener('submit', onSubmit, { capture: true });

        observer = new MutationObserver((mutations) => {
          let formRemoved = !win.document.body.contains(form);
          let attributesChanged = false;

          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.target === form) {
              if (mutation.attributeName === 'toolname' || mutation.attributeName === 'tooldescription') {
                attributesChanged = true;
              }
            }
          }

          if (formRemoved || attributesChanged) {
            resolved = true;
            cleanup();
            const cancelEvent = new Event('toolcancel');
            cancelEvent.toolName = tool.name;
            win.dispatchEvent(cancelEvent);
            resolve(null);
          }
        });
        observer.observe(form, { attributes: true });
        if (form.parentNode) {
          observer.observe(form.parentNode, { childList: true });
        }

        if (form.hasAttribute('toolautosubmit')) {
          const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
          form.dispatchEvent(submitEvent);

          // Timeout only for autosubmit (in case site has a bug and doesn't call respondWith)
          setTimeout(() => {
            if (!resolved) {
              cleanup();
              resolve(null);
            }
          }, 5000);
        } else {
          if (submitBtn) {
            submitBtn.focus();
          }
        }
      });
    }
  }

  function polyfillCSSPseudoClasses(win) {
    const styles = [];

    const processCSSText = (text) => {
      const regexForm = /:tool-form-active/g;
      const regexSubmit = /:tool-submit-active/g;
      const newText = text
        .replace(regexForm, '.tool-form-active')
        .replace(regexSubmit, '.tool-submit-active');
      return newText !== text ? newText : null;
    };

    // 1. Process existing stylesheets in document
    for (const sheet of Array.from(win.document.styleSheets)) {
      if (sheet.href) {
        // Always fetch external stylesheets to get raw CSS before browser parses and discards invalid selectors
        fetch(sheet.href)
          .then((res) => res.text())
          .then((text) => {
            const processed = processCSSText(text);
            if (processed) {
              const styleEl = win.document.createElement('style');
              styleEl.textContent = processed;
              win.document.head.appendChild(styleEl);
            }
          })
          .catch(() => { });
      } else {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (rules) {
            for (const rule of Array.from(rules)) {
              const ruleText = rule.cssText;
              const processed = processCSSText(ruleText);
              if (processed) {
                styles.push(processed);
              }
            }
          }
        } catch (e) { }
      }
    }

    // 2. Process inline style tags
    for (const styleTag of Array.from(win.document.querySelectorAll('style'))) {
      const processed = processCSSText(styleTag.textContent);
      if (processed) {
        styles.push(processed);
      }
    }

    if (styles.length > 0) {
      const styleEl = win.document.createElement('style');
      styleEl.textContent = styles.join('\n');
      win.document.head.appendChild(styleEl);
    }
  }

  const modelContext = new ModelContext();

  Object.defineProperty(window.document, 'modelContext', {
    value: modelContext,
    writable: false,
    configurable: true,
  });

  window.addEventListener('message', async ({ data, source }) => {
    if (data.type === 'WEBMCP_GET_TOOLS_REQUEST') {
      const localTools = getLocalTools(window);
      const serializableTools = localTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        origin: t.origin,
        annotations: t.annotations,
      }));
      source.postMessage(
        {
          type: 'WEBMCP_GET_TOOLS_RESPONSE',
          requestId: data.requestId,
          tools: serializableTools,
        },
        '*'
      );
    }

    if (data.type === 'WEBMCP_EXECUTE_TOOL_REQUEST') {
      const { name, args, requestId } = data;
      try {
        const localTools = getLocalTools(window);
        const tool = localTools.find((t) => t.name === name);
        if (!tool) {
          throw new Error(`Tool ${name} not found`);
        }
        const result = await modelContext.executeTool(tool, args);
        source.postMessage(
          {
            type: 'WEBMCP_EXECUTE_TOOL_RESPONSE',
            requestId,
            success: true,
            result,
          },
          '*'
        );
      } catch (err) {
        source.postMessage(
          {
            type: 'WEBMCP_EXECUTE_TOOL_RESPONSE',
            requestId,
            success: false,
            error: err.message || String(err),
          },
          '*'
        );
      }
    }
  });

  if (window.document.readyState === 'loading') {
    window.document.addEventListener('DOMContentLoaded', () => polyfillCSSPseudoClasses(window));
  } else {
    polyfillCSSPseudoClasses(window);
  }
})();
