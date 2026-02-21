/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import toast from 'react-hot-toast';
import { api } from '../utils/api';

export interface LogEntry {
  msg: string;
  type: string;
  isLink?: boolean;
  linkUrl?: string;
}

export function useEvalsRunner() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const logsRef = useRef<LogEntry[]>([]);

  const handleRun = async (parsedConfig: Record<string, unknown>) => {
    setLogs([]);
    logsRef.current = [];
    setRunning(true);

    const checkAbort = new AbortController();

    try {
      await fetchEventSource(api.runEvals(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedConfig),
        signal: checkAbort.signal,
        async onopen(response) {
          if (!response.ok) {
            throw new Error(`Failed to start run: ${response.statusText}`);
          }
        },
        onmessage(msg) {
          if (msg.event === 'close') return;
          try {
             // SSE parsing is safe with fetch-event-source
             const data = JSON.parse(msg.data);
             let newLogs: LogEntry[] = [];
             if (data.type === 'start') {
               newLogs.push({ msg: `Started evaluation: ${data.total} tests total.`, type: 'info' });
             } else if (data.type === 'progress') {
                const r = data.result;
                const logType = r.outcome === 'pass' ? 'success' : 'error';
                newLogs.push({ msg: `[${data.testNumber}] Test ${r.outcome}: Expected ${r.test.expectedCall.functionName}, got ${r.response?.functionName}`, type: logType });
             } else if (data.type === 'completed') {
                const res = data.results;
                newLogs.push({ msg: `\nCompleted! Passed: ${res.passCount}, Failed: ${res.failCount}, Errors: ${res.errorCount}`, type: 'info' });
               const reportUrl = data.reportFile ? `/${data.reportFile}` : '/report.html';
               newLogs.push({ msg: `\nReport generated. `, type: 'info', isLink: true, linkUrl: reportUrl });
                setRunning(false);
                checkAbort.abort();
             } else if (data.type === 'error') {
                newLogs.push({ msg: `ERROR: ${data.message}`, type: 'error' });
                setRunning(false);
                checkAbort.abort();
             }
             
             if (newLogs.length > 0) {
                 // Batch updates to reduce re-renders
                 logsRef.current = [...logsRef.current, ...newLogs];
                 setLogs([...logsRef.current]);
             }
          } catch(e) {
             console.error("Failed to parse message", e);
          }
        },
        onerror(err) {
          if (err instanceof Error) {
            toast.error(`Stream error: ${err.message}`);
          } else {
            toast.error(`Stream error`);
          }
          setRunning(false);
          checkAbort.abort();
          throw err;
        },
        onclose() {
          setRunning(false);
        }
      });
    } catch (e: unknown) {
      if (e instanceof Error) {
        if (e.message.includes('abort')) return;
        toast.error(`Error: ${e.message}`);
        setLogs(l => [...l, { msg: `Error: ${e.message}`, type: 'error'}]);
      } else {
         toast.error(`An unknown error occurred`);
      }
      setRunning(false);
    }
  };

  return { logs, running, handleRun };
}
