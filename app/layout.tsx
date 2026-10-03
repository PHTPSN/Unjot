import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unjot | Conversation",
  description: "A local-first language conversation with lexical lookup tools.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
