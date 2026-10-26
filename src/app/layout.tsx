import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator Fan Hub",
  description: "A creator community where fans help shape what comes next."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="creator-credit">MADE BY ALMUDDATHTHIR</footer>
      </body>
    </html>
  );
}
