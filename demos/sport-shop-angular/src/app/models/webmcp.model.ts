export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (params: any) => Promise<any>;
}

export interface WebMcpModelContext {
  registerTool(tool: WebMcpTool): void;
  unregisterTool(name: string): void;
}
