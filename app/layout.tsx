import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recipe Hunter",
  description: "Your personal recipe assistant — answers only from your uploaded files",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
