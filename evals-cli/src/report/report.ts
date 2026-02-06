/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from "../types/config.js";
import { Message, TestResult, TestResults } from "../types/evals.js";
import { matchesArgument } from "../matcher.js";

export function renderReport(config: Config, testResults: TestResults): string {
  return `
<!DOCTYPE html>
<head>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">    
    <style>
        body {
            font-family: "Roboto", sans-serif;        
        }
        .pass {
            color: green;
        }
        .fail {
            color: red;
        }
        .error {
            color: orange;
        }
    </style>
</head>
<body>
    <h1>Eval Results</h1>
    <div>
        <h2>Test configuration</h2>
        ${renderConfiguration(config)}
    </div>
    <div>
        <h2>Results</h2>
        <h3>Summary</h3>
        <div>
            ${renderEvalsSummary(testResults)}
        </div>
        <div>
            <h3>Details</h3>
            ${renderDetails(testResults.results)}
        </div>
    </div>
</body>    
`;
}

function renderEvalsSummary(testResults: TestResults): string {
  const passRate = (
    (testResults.passCount / (testResults.passCount + testResults.failCount)) *
    100
  ).toFixed(1);
  return `
        <ul>
            <li>Evals count: <code>${testResults.testCount}</code></li>
            <li>Pass count: <code>${testResults.passCount}</code></li>
            <li>Fail count: <code>${testResults.failCount}</code></li>
            <li>Error count: <code>${testResults.errorCount}</code></li>
            <li>Pass rate: <code>${passRate}%</code>
            </li>            
        </ul>`;
}

function renderConfiguration(config: Config): string {
  return `
<ul>
    <li>Tool definitions: <code>${config.toolSchemaFile}</code></li>
    <li>Evals: <code>${config.evalsFile}</li>
    <li>Backend: <code>${config.backend}</code></li>
    <li>Model: <code>${config.model}</code></li>
</ul>`;
}

function renderDetails(testResults: Array<TestResult>): string {
  return `<ul>${testResults.map((t, i) => renderDetail(i, t)).join("")}</ul>`;
}

function renderDetail(testNumber: number, testResult: TestResult): string {
  const functionNameOutcome =
    testResult.test.expectedCall?.functionName ===
    testResult.response?.functionName
      ? "pass"
      : "fail";

  const argsOutcome = matchesArgument(
    testResult.test.expectedCall?.arguments,
    testResult.response?.args,
  )
    ? "pass"
    : "fail";
  return `<li>
        <details>
            <summary>
                <span>Test #${testNumber}:</span>
                <span class="${testResult.outcome}">${testResult.outcome.toUpperCase()}</span>
            </summary>
            <div>
                <details>
                    <summary>Messages</summary>
                    ${renderMessages(testResult.test.messages)}
                </details>

                <div>
                    <h4><a href="#result-${testNumber}">Result</a></h4>
                    <table>
                        <tr>
                            <th></th>
                            <th>Expected</th>
                            <th>Actual</th>
                            <th>Pass</th>
                        </tr>
                        <tr>
                            <th>Function</th>
                            <td><code>${testResult.test.expectedCall?.functionName || null}</code></td>
                            <td><code>${testResult.response?.functionName || null}</code></td>
                            <td class="${functionNameOutcome}">
                                ${functionNameOutcome.toUpperCase()}
                            </td>
                        </tr>
                        <tr>
                            <th>Arguments</th>
                            <td>
                                <code>
                                    <pre>${JSON.stringify(testResult.test.expectedCall?.arguments || null, null, 2)}</pre>
                                </code>
                            </td>
                            <td>
                                <code>
                                    <pre>${JSON.stringify(testResult.response?.args || null, null, 2)}</pre>
                                </code>
                            </td>
                            <td class="${argsOutcome}">${argsOutcome.toUpperCase()}</td></tr>
                        </tr>
                    </table>
                </div>
            </div>
        </details>
    </li>`;
}

function renderMessages(messages: Array<Message>): string {
  return `<ul>${messages.map(renderMessage).join("")}</ul>`;
}

function renderMessage(message: Message): string {
  let content;
  switch (message.type) {
    case "message":
      content = message.content;
      break;
    case "functioncall":
      content = `<pre>${JSON.stringify(
        { function: message.name, args: message.arguments },
        null,
        2,
      )}</pre>`;
      break;
    case "functionresponse":
      content = `<pre>${JSON.stringify(
        { function: message.name, args: message.response },
        null,
        2,
      )}</pre>`;
      break;
  }
  return `
    <li>
        <div>${message.role} - ${message.type}<div>
        <div>${content}<div>
    </li>`;
}
