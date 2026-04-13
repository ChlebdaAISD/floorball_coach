import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const { login, isLoggingIn, loginError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(password);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-between bg-black px-6 text-white pb-8">
      {/* Top section */}
      <div className="w-full flex justify-center pt-16">
        <h2 className="text-xs font-semibold tracking-[0.4em] uppercase text-white/40">P R E W E N C J A</h2>
      </div>

      <div className="z-10 flex w-full max-w-sm flex-col items-center justify-center flex-1">
        <div className="mb-12 flex flex-col items-center gap-3 text-center w-full">
          <h1 className="text-4xl font-semibold tracking-[0.2em] uppercase">Witaj</h1>
          <p className="text-sm text-white/40 font-light tracking-wide">Zaloguj się, aby kontynuować</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wpisz hasło..."
            autoFocus
            className="text-center rounded-full placeholder:text-white/20 focus-visible:ring-white/40"
          />
          <Button
            type="submit"
            disabled={isLoggingIn || !password}
            className="w-full"
          >
            {isLoggingIn ? "Logowanie..." : "Zaloguj się →"}
          </Button>
        </form>

        {loginError && (
          <p className="text-center text-sm text-red-400 mt-6 font-light tracking-wide">
            {loginError.message || "Błąd logowania"}
          </p>
        )}
      </div>

      <div className="w-full flex justify-center pb-8 text-white/20 text-xs tracking-widest uppercase">
        Twój osobisty trener AI
      </div>
    </div>
  );
}
