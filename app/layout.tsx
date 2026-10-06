import type { Metadata } from "next";
import "./globals.css";
import { InterfaceLanguageProvider } from "./use-interface-language.ts";
import { WorkspaceSidebarStateProvider } from "./workspace-sidebar-state.ts";

export const metadata: Metadata = {
  title: "Unjot | Conversation",
  description: "A local-first language conversation with lexical lookup tools.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><InterfaceLanguageProvider><WorkspaceSidebarStateProvider>{children}</WorkspaceSidebarStateProvider></InterfaceLanguageProvider></body>
    </html>
  );
}
