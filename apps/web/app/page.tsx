import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Welcome to myapp</h1>

        <p className="mb-6 text-gray-600">
          Click below to log in and access your dashboard.
        </p>

        <Link
          href="/login"
          className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 transition"
        >
          Login
        </Link>
      </div>
    </div>
  );
}
