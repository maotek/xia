import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xiaxia 23rd BDay Quiz - Made by MaoTek B.V.",
  description: "Live Kahoot-ish quiz with websocket players and admin controls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
