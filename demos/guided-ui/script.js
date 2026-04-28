/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Application State
const state = {
  newProject: false,
  connectServer: false,
  importTemplate: false,
  dbInitialized: false,
  credentialsEntered: false,
  templateSelected: false,
  templateCustomized: false,
  schemaFetched: false,
  dataCleaned: false,
  tablesJoined: false,
  filterApplied: false,
  trendsAnalyzed: false,
  reportGenerated: false,
  pdfExported: false,
  emailSent: false,
};

// Map DOM IDs to state properties
const buttonToStateMap = {
  'btn-new-project': 'newProject',
  'btn-connect-server': 'connectServer',
  'btn-import-template': 'importTemplate',
  'btn-init-db': 'dbInitialized',
  'btn-enter-credentials': 'credentialsEntered',
  'btn-select-template': 'templateSelected',
  'btn-customize-template': 'templateCustomized',
  'btn-fetch-schema': 'schemaFetched',
  'btn-clean-data': 'dataCleaned',
  'btn-join-tables': 'tablesJoined',
  'btn-apply-filter': 'filterApplied',
  'btn-analyze-trends': 'trendsAnalyzed',
  'btn-generate-report': 'reportGenerated',
  'btn-export-pdf': 'pdfExported',
  'btn-send-email': 'emailSent',
};

// Workflow tracking to prevent cross-contamination
let currentWorkflow = null; // 'new_project', 'connect_server', 'import_template'
const workflows = {
  'btn-new-project': 'new_project',
  'btn-connect-server': 'connect_server',
  'btn-import-template': 'import_template',
};

function updateVisibility() {
  // 1. Handle entry points (cross-contamination prevention)
  Object.keys(workflows).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    
    // If no workflow is active, show all entry points
    if (!currentWorkflow) {
      el.classList.remove('hidden-action');
    } 
    // If a workflow is active, ONLY show the chosen entry point
    else if (currentWorkflow === workflows[id]) {
      el.classList.remove('hidden-action');
    } 
    // Hide the other entry points
    else {
      el.classList.add('hidden-action');
    }
  });

  // 2. Helper to toggle visibility and cascade reset if dependencies fail
  const toggle = (id, condition) => {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (condition) {
      if (el.classList.contains('hidden-action')) {
        el.classList.remove('hidden-action');
        el.classList.add('revealed');
      }
    } else {
      el.classList.add('hidden-action');
      el.classList.remove('revealed');
      
      // Cascade reset
      if (state[buttonToStateMap[id]]) {
        state[buttonToStateMap[id]] = false;
        el.classList.remove('completed');
      }
    }
  };

  // --- Dynamic Path Routing ---
  
  // Branch A: New Project
  toggle('btn-init-db', currentWorkflow === 'new_project' && state.newProject);
  
  // Branch B: Connect
  toggle('btn-enter-credentials', currentWorkflow === 'connect_server' && state.connectServer);
  
  // Branch C: Import
  toggle('btn-select-template', currentWorkflow === 'import_template' && state.importTemplate);
  toggle('btn-customize-template', state.templateSelected);

  // Shared Path Entry (Branches A & B merge here)
  const hasSchemaSource = state.dbInitialized || state.credentialsEntered;
  toggle('btn-fetch-schema', hasSchemaSource);
  
  toggle('btn-clean-data', state.schemaFetched);
  toggle('btn-join-tables', state.schemaFetched);
  
  const hasCleanData = state.dataCleaned && state.tablesJoined;
  toggle('btn-apply-filter', hasCleanData);
  toggle('btn-analyze-trends', state.filterApplied);
  
  // Report Generation (Branches A, B, and C merge here)
  const canGenerateReport = state.trendsAnalyzed || state.templateCustomized;
  toggle('btn-generate-report', canGenerateReport);
  
  toggle('btn-export-pdf', state.reportGenerated);
  toggle('btn-send-email', state.reportGenerated);
}

// Handle manual clicks to toggle completion and trigger visibility updates
Object.keys(buttonToStateMap).forEach((id) => {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener('click', () => {
      // Manage Workflow Selection
      if (workflows[id]) {
        currentWorkflow = workflows[id];
      }
      
      // Toggle state
      const stateKey = buttonToStateMap[id];
      state[stateKey] = !state[stateKey];
      
      // Update UI
      if (state[stateKey]) {
        btn.classList.add('completed');
      } else {
        btn.classList.remove('completed');
        // Un-selecting a top-level workflow resets the board
        if (workflows[id]) {
          currentWorkflow = null;
        }
      }
      
      // Update visibility of dependent buttons
      updateVisibility();
    });
  }
});

// Reset Button Logic
const resetBtn = document.getElementById('btn-reset');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    // Reset all state variables
    Object.keys(state).forEach((key) => { state[key] = false; });
    currentWorkflow = null;
    
    // Remove completed styling from all buttons
    document.querySelectorAll('.action-btn').forEach((btn) => {
      btn.classList.remove('completed');
    });
    
    updateVisibility();
  });
}

// Suggestion Chips Logic
document.querySelectorAll('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', (e) => {
    e.preventDefault();
    const goalInput = document.getElementById('goal-input');
    if (goalInput) {
      goalInput.value = chip.textContent.trim();
      // Dispatch events in case other scripts monitor this
      goalInput.dispatchEvent(new Event('input', { bubbles: true }));
      goalInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Visual feedback
      goalInput.style.backgroundColor = '#f0fdf4';
      goalInput.style.transition = 'background-color 0.3s ease';
      
      // Flash the text color too for extra visibility
      goalInput.style.color = '#15803d';
      
      setTimeout(() => {
        goalInput.style.backgroundColor = '';
        goalInput.style.color = '';
      }, 500);
    }
  });
});

// Initialize UI state on load
updateVisibility();

// Handle external tool cancel events
window.addEventListener('toolcancel', () => {
  setAgentThinking(false);
});

// Helper for highlighting an element
function showHighlight(elementId, instruction) {
  const el = document.getElementById(elementId);
  const backdrop = document.getElementById('backdrop');
  const tooltip = document.getElementById('tooltip');

  // Verify the element exists and is visible
  if (!el || el.classList.contains('hidden-action') || !backdrop || !tooltip) {
    return false;
  }

  backdrop.classList.remove('hidden');
  el.classList.add('highlighted');

  tooltip.innerText = instruction;
  const rect = el.getBoundingClientRect();
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.bottom + 15 + window.scrollY}px`;
  tooltip.classList.remove('hidden');
  
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return true;
}

function hideHighlight(elementId) {
  const el = document.getElementById(elementId);
  const backdrop = document.getElementById('backdrop');
  const tooltip = document.getElementById('tooltip');

  if (el) el.classList.remove('highlighted');
  if (backdrop) backdrop.classList.add('hidden');
  if (tooltip) tooltip.classList.add('hidden');
}

// --- Agent UI State Management ---
function setAgentThinking(isThinking, message = 'WebMCP Agent is thinking...') {
  const statusEl = document.getElementById('agent-status');
  const textEl = document.querySelector('.status-text');
  if (statusEl && textEl) {
    if (isThinking) {
      statusEl.classList.remove('hidden');
      textEl.innerText = message;
    } else {
      statusEl.classList.add('hidden');
    }
  }
}

// Helper to get visible buttons for the Agent payload
function getVisibleButtons() {
  const buttons = [];
  Object.keys(buttonToStateMap).forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden-action')) {
      buttons.push({
        id,
        label: el.innerText.trim().replace(/\n.*$/, ''),
        completed: state[buttonToStateMap[id]]
      });
    }
  });
  return buttons;
}

// --- WebMCP Tool Registration ---
if (window.navigator.modelContext) {
  document.body.classList.add('webmcp-supported');

  navigator.modelContext.registerTool({
    name: 'survey_ui_state',
    description: 'Get a list of currently VISIBLE and interactable dashboard buttons, along with the user\'s ultimate goal. Call this to map user intent to the correct entry path, or after any interaction to discover newly revealed paths.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: () => {
      setAgentThinking(true, 'Agent is surveying the UI...');
      const goalText = document.getElementById('goal-input').value.trim();
      
      return {
        ultimate_goal: goalText || 'No specific goal entered yet.',
        active_workflow: currentWorkflow || 'none_selected',
        visible_buttons: getVisibleButtons(),
        current_state: state
      };
    },
  });

  navigator.modelContext.registerTool({
    name: 'highlight_ui_element',
    description: 'Highlight a specific visible dashboard button to guide the user. Execution pauses until the user clicks the highlighted button.',
    inputSchema: {
      type: 'object',
      properties: {
        element_id: { 
          type: 'string', 
          description: 'The ID of the HTML button to highlight. MUST be one of the button IDs returned by survey_ui_state.' 
        },
        instruction: { 
          type: 'string', 
          description: 'A dynamically generated short instruction explaining to the user exactly why clicking this button helps achieve their unique goal.' 
        }
      },
      required: ['element_id', 'instruction'],
    },
    execute: ({ element_id, instruction }) => {
      return new Promise((resolve, reject) => {
        // Agent is done thinking, waiting for user
        setAgentThinking(false);
        
        const success = showHighlight(element_id, instruction);
        if (!success) {
          return resolve(`Failed to highlight: Element with id '${element_id}' not found or is currently hidden/locked.`);
        }

        const el = document.getElementById(element_id);

        const onClick = () => {
          hideHighlight(element_id);
          el.removeEventListener('click', onClick);
          
          // User clicked, hand control back to Agent, show thinking UI again
          setAgentThinking(true, 'Agent is processing the next step...');
          
          // Force a microtask delay to ensure UI updates before reading visible buttons
          setTimeout(() => {
            const goalText = document.getElementById('goal-input').value.trim();
            const visibleButtonsList = getVisibleButtons().map(b => `'${b.id}' (${b.label})`).join(', ');
            
            // Contextual Handshaking string returned directly to the Agent
            resolve(`User clicked ${element_id}. Here is the new list of visible buttons: ${visibleButtonsList}. What is the next step to reach the goal: "${goalText}"?`);
          }, 0);
        };

        el.addEventListener('click', onClick);
      });
    },
  });

  navigator.modelContext.registerTool({
    name: 'finish_guidance',
    description: 'Call this tool when the user\'s ultimate goal has been successfully achieved to end the guidance session and update the UI.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { 
          type: 'string', 
          description: 'A congratulatory message to the user.' 
        }
      },
      required: ['message'],
    },
    execute: ({ message }) => {
      setAgentThinking(false);
      alert(`Guidance Complete: ${message}`);
      return 'Guidance session ended successfully.';
    },
  });
}
