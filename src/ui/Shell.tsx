"use client";
/**
 * The signed-in frame: the sidebar beside the page. Below `md` the sidebar is a drawer, opened from the
 * mobile bar; this context is the one switch both of them read.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

const Ctx = createContext<{ open: boolean; setOpen: (o: boolean) => void }>({ open: false, setOpen: () => {} });

export function ShellProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export const useDrawer = () => useContext(Ctx);
