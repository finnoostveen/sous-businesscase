import type { ReactNode } from "react";

export const metadata = {
  title: "SOUS Spotlight-assistent",
  description: "Chat over je Spotlight-performance",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
