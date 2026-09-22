"use client"
import { createContext } from "react"
export const WorkspaceSlots = createContext<{
  overview: HTMLDivElement | null; navigation: HTMLDivElement | null; toolbar: HTMLDivElement | null; inspector: HTMLDivElement | null;
  entitySelected: boolean; setEntitySelected: (selected: boolean) => void;
  onEntityActivate: () => void;
  setHasEntities: (has: boolean) => void; setEntityTitle: (title: string) => void;
} | null>(null)
