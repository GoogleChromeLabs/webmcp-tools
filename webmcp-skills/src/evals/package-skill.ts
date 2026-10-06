/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { validateSkill } from "./validate-skill.js";

export interface PackageResult {
  success: boolean;
  archivePath?: string;
  error?: string;
}

/**
 * Packages a skill directory into a distributable .skill archive (zip format).
 */
export function packageSkill(skillDir: string, outputDir: string = process.cwd()): PackageResult {
  const resolvedSkillDir = path.resolve(skillDir);
  const resolvedOutputDir = path.resolve(outputDir);

  // 1. Validate skill first
  const validation = validateSkill(resolvedSkillDir);
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed:\n  ${validation.errors.join("\n  ")}`,
    };
  }

  const skillName = path.basename(resolvedSkillDir);
  const archivePath = path.join(resolvedOutputDir, `${skillName}.skill`);

  fs.mkdirSync(resolvedOutputDir, { recursive: true });

  // Remove existing archive if present
  if (fs.existsSync(archivePath)) {
    fs.unlinkSync(archivePath);
  }

  try {
    // Use system zip utility with standard exclusions per agentskills.io
    // Exclude evals/, node_modules/, .DS_Store, *.pyc, __pycache__
    const parentDir = path.dirname(resolvedSkillDir);
    const folderName = path.basename(resolvedSkillDir);

    if (process.platform === "win32") {
      try {
        const excludeArgs = [
          "--exclude",
          "*/evals/*",
          "--exclude",
          "evals",
          "--exclude",
          "*/node_modules/*",
          "--exclude",
          "node_modules",
          "--exclude",
          "*.DS_Store",
          "--exclude",
          "*__pycache__*",
          "--exclude",
          "*.pyc",
        ];
        execFileSync(
          "tar.exe",
          ["-c", "-f", archivePath, "--format", "zip", "-C", parentDir, ...excludeArgs, folderName],
          {
            stdio: "pipe",
          },
        );
      } catch {
        const tempZip = path.join(resolvedOutputDir, `${skillName}-temp.zip`);
        if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
        const psCommand = `Compress-Archive -Path '${resolvedSkillDir}' -DestinationPath '${tempZip}' -Force; Move-Item -Path '${tempZip}' -Destination '${archivePath}' -Force`;
        execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], {
          stdio: "pipe",
        });
      }
    } else {
      const excludeArgs = [
        "-x",
        `*/evals/*`,
        `*/node_modules/*`,
        `*/.DS_Store`,
        `*/__pycache__/*`,
        `*.pyc`,
      ];

      execFileSync("zip", ["-r", "-q", archivePath, folderName, ...excludeArgs], {
        cwd: parentDir,
        stdio: "pipe",
      });
    }

    return {
      success: true,
      archivePath,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to create .skill archive: ${(err as Error).message}`,
    };
  }
}
