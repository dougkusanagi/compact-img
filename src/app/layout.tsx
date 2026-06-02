import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compact Img",
  description: "Compactador de imagens em lote, 100% local no navegador."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
