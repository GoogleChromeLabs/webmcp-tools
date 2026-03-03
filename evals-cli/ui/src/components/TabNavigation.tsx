/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FiSettings, FiGlobe } from "react-icons/fi";
import type { Tab } from "../types";
import styles from "./TabNavigation.module.css";

interface TabNavigationProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export function TabNavigation({ activeTab, setActiveTab }: TabNavigationProps) {
  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "local" ? styles.active : ""}`}
          onClick={() => setActiveTab("local")}
        >
          <FiSettings className={styles.icon} /> Local Tools
        </button>
        <button
          className={`${styles.tab} ${activeTab === "website" ? styles.active : ""}`}
          onClick={() => setActiveTab("website")}
        >
          <FiGlobe className={styles.icon} /> Website Tools
        </button>
      </div>
    </div>
  );
}
