# Guided UI | WebMCP Demo

This demo illustrates a "Guided UI" using Vanilla JavaScript and the WebMCP protocol. The page features a dynamic, state-aware dashboard. Instead of a static tutorial, an AI Agent uses WebMCP tools to visually guide the user through a multi-step workflow based on their specific goal. 

## Features

- **Dynamic Discovery Dashboard**: A mock "cluttered" UI with 10 different action buttons. Crucially, most buttons start hidden or locked. Completing prerequisite actions reveals new paths in the UI.
- **Goal Input**: A text area where users can specify their ultimate goal (e.g., "I want to clean the data and generate a report").
- **State-Aware Guidance**: The AI Agent dynamically analyzes the user's goal and the *currently available* dashboard state using the `get_available_actions` tool. It must reason through the chain of commands to unlock the required features.
- **Synchronous WebMCP Tools**: The `highlight_ui_element` tool uses Promises to wait for the user to click the highlighted button before returning to the Agent. This enables a seamless loop where the Agent guides the user step-by-step, re-evaluating the newly revealed actions after each interaction until the ultimate goal is achieved.
- **Vanilla JS Foundations**: The entire experience is driven by Vanilla JS and CSS transitions, showing how robust WebMCP implementations can be without heavy frameworks.

## How it works

1. The user types their goal into the input field.
2. The user asks the WebMCP agent (e.g. via the WebMCP inspector extension) to guide them.
3. The Agent calls the `get_available_actions` tool to understand what buttons are currently visible in the DOM and what the user's goal is.
4. The Agent reasons out the next required step (even if the final button is hidden, it must know to trigger the visible prerequisite). 
5. The Agent calls the `highlight_ui_element` tool with the corresponding element ID and an instruction.
6. The webpage darkens the background and highlights the targeted button, fading it into focus and showing a tooltip with the Agent's instruction.
7. Execution of the tool is paused until the user clicks the highlighted button.
8. Upon clicking, the underlying JS toggles the button state and dynamically fades in any newly unlocked dependent buttons.
9. The `highlight_ui_element` tool resolves, explicitly telling the Agent to call `get_available_actions` again.
10. The loop continues until the user's ultimate goal is fulfilled.