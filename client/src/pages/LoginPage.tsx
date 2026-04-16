import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const { login, register, isLoggingIn, loginError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      await login({ email, password });
    } else {
      await register({ email, username, password });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-between bg-black px-6 text-white pb-8">
      {/* Top section */}
      <div className="w-full flex justify-center pt-16">
        <h2 className="text-xs font-semibold tracking-[0.4em] uppercase text-white/40">P R E W E N C J A</h2>
      </div>

      <div className="z-10 flex w-full max-w-sm flex-col items-center justify-center flex-1">
        <div className="mb-12 flex flex-col items-center gap-3 text-center w-full">
          <h1 className="text-4xl font-semibold tracking-[0.2em] uppercase">
            {mode === "login" ? "Witaj" : "Rejestracja"}
          </h1>
          <p className="text-sm text-white/40 font-light tracking-wide">
            {mode === "login" ? "Zaloguj się, aby kontynuować" : "Utwórz nowe konto"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            className="rounded-full placeholder:text-white/20 focus-visible:ring-white/40"
          />
          {mode === "register" && (
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nazwa użytkownika"
              className="rounded-full placeholder:text-white/20 focus-visible:ring-white/40"
            />
          )}
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Hasło"
            className="rounded-full placeholder:text-white/20 focus-visible:ring-white/40"
          />
          <Button
            type="submit"
            disabled={isLoggingIn || !email || !password || (mode === "register" && !username)}
            className="w-full"
          >
            {isLoggingIn
              ? mode === "login" ? "Logowanie..." : "Rejestracja..."
              : mode === "login" ? "Zaloguj się →" : "Zarejestruj się →"}
          </Button>
        </form>

        {loginError && (
          <p className="text-center text-sm text-red-400 mt-6 font-light tracking-wide">
            {loginError.message || "Błąd logowania"}
          </p>
        )}

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-8 text-xs text-white/30 hover:text-white/60 transition-colors tracking-wide"
        >
          {mode === "login" ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się"}
        </button>
      </div>

      <div className="w-full flex justify-center pb-8 text-white/20 text-xs tracking-widest uppercase">
        Twój osobisty trener AI
      </div>
    </div>
  );
}
