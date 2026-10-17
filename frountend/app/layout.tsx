import type { Metadata } from "next";
import { AppProviders } from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "waterX Dashboard | Smart Plant Water Management",
  description: "A local dashboard for managing plant profiles and viewing WaterX simulation records.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
