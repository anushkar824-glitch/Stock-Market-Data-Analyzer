
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarketScope | Stock Market Analyzer",
  description:
    "A professional stock market analytics platform for stock analysis, technical indicators, portfolio tracking and backtesting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
