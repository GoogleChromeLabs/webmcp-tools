/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "../utils/api";
import type { ToolDef } from "../types";

export function useWebsiteTools() {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [fetchingTools, setFetchingTools] = useState(false);

  const fetchToolsForWebsite = async (websiteUrl: string) => {
    if (!websiteUrl) return;
    setFetchingTools(true);
    setTools([]);
    try {
      const response = await fetch(api.fetchTools(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch tools: ${response.statusText}`);
      }
      const data = await response.json();
      setTools(data.tools || []);
      toast.success(`Fetched ${data.tools?.length || 0} tools`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        toast.error(`Error fetching tools: ${e.message}`);
      } else {
        toast.error("An unknown error occurred while fetching tools");
      }
    } finally {
      setFetchingTools(false);
    }
  };

  return { tools, fetchingTools, fetchToolsForWebsite };
}
