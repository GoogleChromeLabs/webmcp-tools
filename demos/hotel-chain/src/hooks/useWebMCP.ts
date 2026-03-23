import { useEffect, useRef } from 'react';

export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema?: any;
  execute: (input: any) => any;
}

/**
 * Hook to manage WebMCP tool registrations within a component lifecycle.
 * Centralizing this prevents tool leaks and ensures proper cleanup.
 */
export function useWebMCP(tools: WebMCPTool[]) {
  const registeredTools = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator.modelContext) {
      return;
    }

    const modelContext = window.navigator.modelContext;

    tools.forEach(tool => {
      try {
        modelContext.registerTool(tool);
        registeredTools.current.add(tool.name);
      } catch (error) {
        console.error(`Failed to register WebMCP tool "${tool.name}":`, error);
      }
    });

    return () => {
      registeredTools.current.forEach(name => {
        try {
          modelContext.unregisterTool(name);
        } catch (error) {
          console.error(`Failed to unregister WebMCP tool "${name}":`, error);
        }
      });
      registeredTools.current.clear();
    };
  }, [tools]);
}
