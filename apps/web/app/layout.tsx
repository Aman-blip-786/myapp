import "./globals.css";
import Navbar from "../components/Navbar";

export const metadata = {
  title: "myapp",
  description: "FreelanceOS MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
