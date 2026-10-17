import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "waterX Dashboard | Smart Plant Water Management",
  description: "A demonstration dashboard for smart plant water management.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
