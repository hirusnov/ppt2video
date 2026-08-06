import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PPT2VIDEO — PPTX to MP4 with AI Vietnamese TTS",
  description:
    "Convert PowerPoint presentations to MP4 videos with AI-powered Vietnamese text-to-speech using Edge TTS or Kokoro-Vietnamese.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-zinc-100`}>
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#18181b",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#f4f4f5",
            },
          }}
        />
      </body>
    </html>
  );
}
