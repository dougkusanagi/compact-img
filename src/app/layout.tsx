import type { Metadata } from "next";
import { VersionedImageCompressor } from "@/components/versioned-image-compressor";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compact Img",
  description: "Compactador desktop de imagens em lote, 100% local.",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <VersionedImageCompressor />
        {children}
      </body>
    </html>
  );
}
