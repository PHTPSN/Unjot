"use client";

import { createContext, createElement, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type WorkspaceSidebarState = {
  collapsedProjectIds: ReadonlySet<string>;
  expandProject: (projectId: string) => void;
  toggleProject: (projectId: string) => void;
};

const WorkspaceSidebarStateContext = createContext<WorkspaceSidebarState | null>(null);

export function WorkspaceSidebarStateProvider({ children }: { children: ReactNode }) {
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(() => new Set());
  const expandProject = useCallback((projectId: string) => {
    setCollapsedProjectIds(current => {
      if (!current.has(projectId)) return current;
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
  }, []);
  const toggleProject = useCallback((projectId: string) => {
    setCollapsedProjectIds(current => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ collapsedProjectIds, expandProject, toggleProject }), [collapsedProjectIds, expandProject, toggleProject]);

  return createElement(WorkspaceSidebarStateContext.Provider, { value }, children);
}

export function useWorkspaceSidebarState() {
  const context = useContext(WorkspaceSidebarStateContext);
  if (!context) throw new Error("useWorkspaceSidebarState must be used within WorkspaceSidebarStateProvider.");
  return context;
}
