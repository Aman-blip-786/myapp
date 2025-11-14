import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "myapp",
  description: "myapp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-xl font-bold">myapp</h1>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

