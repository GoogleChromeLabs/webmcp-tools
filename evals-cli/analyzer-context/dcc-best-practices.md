pull_date: 2026-07-21
source: https://developer.chrome.com/docs/ai/webmcp/best-practices

# WebMCP best practices

<table class="full-width" id="availability">
  <tr>
    <th>Explainer</th>
    <th>Web</th>
    <th>Extensions</th>
    <th>Chrome Status</th>
    <th>Intent</th>
  </tr>
  <tr>
  {% include "_includes/partials/ai/_webmcp.html" %}
  </tr>
</table>

[WebMCP](/docs/ai/webmcp) tool declaration should be clear, without a need for
developers or agents to look at outputs and retry. Whether you use the
Imperative API or Declarative API, follow these best practices:

- Before building, create a tool strategy.
- Use clear language and semantic HTML.
- Design your schemas and handle input.
- Build reliable tools.
- Test and debug.

We've written separately about [creating security-minded tools](/docs/ai/webmcp/secure-tools).

Note: For those building agents, read our
[security considerations for WebMCP](/docs/agents/security).

## Create a tool strategy

Just as you'd do for any software application, your first step should be to plan
your tool strategy:

- **Each tool should consist of a single function**. For example, one tool could
  be to direct the user to a specific form type, where another tool should match
  input fields with user information. Be careful not to create overlapping
  tools, as the agent may be confused as to what to use. Ask yourself:
  can I cover multiple tasks with the same function?
- **Manage tool registration**. Register tools when they're useful in a certain
  page state, then unregister when the tool is no longer usable.
  - [**Imperative API**](/docs/ai/webmcp/imperative-api): You can dynamically
    manage registration with `registerTool`.
  - [**Declarative API**](/docs/ai/webmcp/declarative-api): You can dynamically
    manage registration by adding or removing the tool attributes on a form,
    with `toolname` and `tooldescription`.
- **Reduce complexity:** For most applications, static registration should be
  the default approach.
- **Trust the agent to complete the task**. Instead of writing rigid or
  negative instructions, assume the agent is able to understand what is
  required to complete the task, rather than expecting the agent to manage an
  exact flow of steps.

While there isn't a maximum number of tools allowed, each tool takes up part of
the context window and adds to the time for completion. The more tools you
provide and the more the tools have overlap, the harder it is for the agent to
pick correctly. Experiment to determine what's right for your application.

This helps you build individual tools, without overlapping purpose, and manage
when these tools are available.

## Use clear language and semantic code

Use clear and precise language to name tools and describe their use. This helps
agents find what they need, understand what they find, and use that information
as the developer expects.

When writing tool names, distinguish execution from initiation, and use verbs
that describe exactly what happens. For example, `create-event` is a tool for
immediate event creation, but `start-event-creation-process` is a tool that
redirects the user to a form to create the event.

A clear description should describe what the tool does and when to use it. Rely
on positive language and preferences instead of negative language, such as
limitations.

<div class="wd-compare">
  <div class="compare-worse">Don't</div>
  <blockquote>"Don't use this tool for weather."</blockquote>
  <p class="wd-caption">
    Limitations should be implicit in a well-written description.
  </p>
</div>

<div class="wd-compare">
  <div class="compare-better">Do</div>

  <blockquote>"This tool can create a calendar event, scheduled for a specific
  date and time."</blockquote>

  <p class="wd-caption">Instead telling the model <i>what</i> to do, this
  language describes the actions the tool can take.</p>

</div>

## Minimize cognitive computing

Just as you should minimize cognitive load for humans completing complex tasks, you should also minimize cognitive computing for the model:

- **Accept raw user input**. Avoid asking the agent to perform math or transform the input strings. For example, if a user says, "11:00 to 15:00," the tool should accept this as a string. Avoid asking the model to calculate the minutes between these times.
- **Declare specific types for parameters**, such as string, number, or enum.
- **Explain why you've made certain choices**. What choice you've made should be self-explanatory. The why helps agents make better choices. For example, if you run an ecommerce shop, declare shipping type with natural language instead of using an ambiguous ID: `shipping="Express"` instead of `shipping_id=1`.

## Prioritize reliability

Agents and humans benefit from tools that behave as-expected:

- **Set a graceful failure for rate limits**. Tools should allow for reasonable
  repetition, such as for price comparison. If a tool is rate limited, return a
  meaningful error or advise the user to manually take on the task.
- **Update the interface state after functions are completed**. Agents may rely
  on the interface to plan next steps, while functions may take longer to
  complete than the interface load. The agent should confirm the function is
  complete once the interface has updated, or request an update again.
- **Validate strictly in code, loosely in schema**. Constraints and testing
  should be used for functions and code that have binary logic. While schema
  constraints can be helpful, they're not guaranteed. Add descriptive errors
  to your function code to allow the model to self-correct and retry with new,
  valid parameters.

## Eval testing and debugging

Create evaluation tests and make your tools available for debugging. Unlike deterministic unit tests, evaluations cannot be hard-coded, as outputs can take unanticipated forms.

Key Term: [_Evaluation-driven development_](https://web.dev/learn/ai/evaluation-driven-development) offers a repeatable, testable process for
improving outputs in small steps, catching regressions and aligning mode
behavior with user and product expectations.

- **Define the problem**. You can frame your problem like an API contract,
  including the input type, the output format, and any additional constraints.
- **Define a baseline and an ideal result**. Especially with text input, it's
  important to understand what types of results can get you the output you expect.
- **Determine how the output will be evaluated**. You're likely identifying and
  measuring subjective, qualitative results based on input quality, usefulness,
  and ability to accomplish the next task. There are a number of techniques you
  can use to evaluate output, including code-based checks for rule-based outputs
  (character limits) and [LLM-as-a-judge](https://web.dev/articles/test-llm-capabilities).

Avoid adding narrow rules to patch issues with a particular model. For example,
if you include a select field for [honorifics](https://wikipedia.org/wiki/English_honorifics), the model may make the wrong choice. Instead of adding
narrow rules to patch this issue, abstract and adjust your tool.
You may do best by setting this field as optional. Then, ask the agent to ask
the user which choice makes sense, to ensure the user is happy with the outcome.

## Engage and share feedback

WebMCP is under active discussion and subject to change in the future. If you
try these APIs and have feedback, we'd love to hear it.

- [Read the WebMCP explainer](https://github.com/webmachinelearning/webmcp),
  raise questions and participate in discussion.
- Review the implementation for Chrome on
  [Chrome Status](https://chromestatus.com/feature/5117755740913664).
- [Join the early preview program](http://goo.gle/chrome-ai-dev-preview-join)
  for an early look at new APIs and access to our mailing list.
- If you have feedback on Chrome's implementation, file a
  [Chromium bug](https://crbug.com/new?component=2021259).
