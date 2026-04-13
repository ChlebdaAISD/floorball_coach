import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Dumbbell } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const { login, isLoggingIn, loginError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(password);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20">
          <Dumbbell className="h-8 w-8 text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold">Prewencja i Forma</h1>
        <p className="text-sm text-slate-400">Twój osobisty trener AI</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Hasło"
          autoFocus
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center text-lg placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={isLoggingIn || !password}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {isLoggingIn ? "Logowanie..." : "Zaloguj się"}
        </button>
        {loginError && (
          <p className="text-center text-sm text-red-400">
            {loginError.message || "Błąd logowania"}
          </p>
        )}
      </form>
    </div>
  );
}
