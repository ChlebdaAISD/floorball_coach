import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, Bot, Sparkles, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { cn, apiRequest } from "@/lib/utils";
import type { ChatMessage } from "@shared/schema";

const TOPICS = [
  { key: "sport", label: "Sport" },
  { key: "goals", label: "Cele" },
  { key: "body", label: "Dane" },
  { key: "injuries", label: "Kontuzje" },
  { key: "season", label: "Sezon" },
  { key: "availability", label: "Dostępność" },
  { key: "schedule", label: "Grafik" },
];

interface OnboardingResponse {
  message: ChatMessage;
  topicsCovered: Record<string, boolean>;
  isComplete: boolean;
}

export default function OnboardingPage() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [topicsCovered, setTopicsCovered] = useState<Record<string, boolean>>({});
  const hasKickedOffRef = useRef(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [lastFailedContent, setLastFailedContent] = useState<string | null>(null);

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["onboarding-messages"],
    queryFn: () => apiRequest("/api/onboarding/messages"),
  });

  const sendMutation = useMutation({
    mutationFn: (content: string | null) =>
      apiRequest<OnboardingResponse>("/api/onboarding/chat", {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onMutate: async (content) => {
      setLastFailedContent(null);
      setInput("");
      if (content) {
        await queryClient.cancelQueries({ queryKey: ["onboarding-messages"] });
        const previous = queryClient.getQueryData<ChatMessage[]>(["onboarding-messages"]);
        const optimistic: ChatMessage = {
          id: Math.random(),
          userId: 0,
          role: "user",
          content,
          createdAt: new Date() as any,
          planSuggestion: null,
          contextType: "onboarding",
          extractedData: null,
        };
        queryClient.setQueryData<ChatMessage[]>(["onboarding-messages"], (old) => [
          ...(old || []),
          optimistic,
        ]);
        return { previous, content };
      }
      return { previous: undefined, content: null };
    },
    onError: (_err, content, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["onboarding-messages"], ctx.previous);
      }
      // Save the content so user can retry
      if (content) setLastFailedContent(content);
    },
    onSuccess: (data) => {
      setTopicsCovered(data.topicsCovered || {});
      if (data.isComplete) {
        setIsCompleted(true);
        // Don't invalidate auth yet — wait for user to click "Przejdź do aplikacji"
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-messages"] });
    },
  });

  // Kick off the conversation on first render if there are no messages.
  // Use a ref (not state) so double-invocation under StrictMode/fast re-renders
  // cannot race through the guard before the flag is observed.
  useEffect(() => {
    if (hasKickedOffRef.current) return;
    if (messages.length > 0) {
      hasKickedOffRef.current = true;
      return;
    }
    if (!sendMutation.isPending) {
      hasKickedOffRef.current = true;
      sendMutation.mutate(null);
    }
  }, [messages.length, sendMutation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending]);

  const handleSend = () => {
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
  };

  const handleRetry = () => {
    const content = lastFailedContent;
    setLastFailedContent(null);
    sendMutation.mutate(content);
  };

  const handleEnterApp = () => {
    queryClient.invalidateQueries({ queryKey: ["auth"] });
  };

  const coveredCount = TOPICS.filter((t) => topicsCovered[t.key]).length;

  // Completion screen
  if (isCompleted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div
          className="relative flex w-full max-w-[430px] flex-col items-center justify-center overflow-hidden bg-black md:rounded-[32px] md:border md:border-white/[0.08] md:shadow-2xl px-8 text-center"
          style={{ height: "min(100dvh, 900px)" }}
        >
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#c5e063]/10 border border-[#c5e063]/20 mb-6">
            <CheckCircle2 size={32} strokeWidth={1} className="text-[#c5e063]" />
          </div>

          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={12} strokeWidth={1.5} className="text-[#c5e063]" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Gotowe
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white mb-3">
            Profil gotowy!
          </h1>
          <p className="text-sm text-white/40 font-light leading-relaxed mb-8">
            Twój trener AI zna już Twój sport, cele i możliwości treningowe. Na tej podstawie będzie personalizować plany i porady specjalnie dla Ciebie.
          </p>

          {/* Covered topics summary */}
          <div className="flex flex-wrap gap-1.5 justify-center mb-10">
            {TOPICS.filter((t) => topicsCovered[t.key]).map((t) => (
              <span
                key={t.key}
                className="rounded-full bg-[#c5e063]/10 border border-[#c5e063]/20 px-3 py-1 text-xs text-[#c5e063]/80"
              >
                {t.label}
              </span>
            ))}
          </div>

          <button
            onClick={handleEnterApp}
            className="w-full rounded-2xl bg-[#c5e063] px-6 py-4 text-sm font-semibold text-black transition-all hover:bg-[#d4ef72] active:scale-[0.98]"
          >
            Przejdź do aplikacji
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div
        className="relative flex w-full max-w-[430px] flex-col overflow-hidden bg-black md:rounded-[32px] md:border md:border-white/[0.08] md:shadow-2xl"
        style={{ height: "min(100dvh, 900px)" }}
      >
        {/* Header with progress */}
        <div className="shrink-0 border-b border-white/[0.06] px-5 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} strokeWidth={1.5} className="text-[#c5e063]" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
              Powitanie
            </span>
          </div>
          <h1 className="text-lg font-semibold text-white mb-4">Poznajmy się</h1>
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {TOPICS.map((t) => (
              <div
                key={t.key}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-500",
                  topicsCovered[t.key] ? "bg-[#c5e063]" : "bg-white/10",
                )}
                title={t.label}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-white/30 font-light">
            {coveredCount}/{TOPICS.length} tematów
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-none">
          <div className="space-y-5">
            {messages.map((msg) => (
              <OnboardingBubble key={msg.id} message={msg} />
            ))}
            {sendMutation.isPending && (
              <div className="flex items-end gap-3 mt-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10">
                  <Bot size={16} strokeWidth={1} className="text-white/50" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-[#111111] border border-white/[0.1] px-5 py-3 text-sm text-white/40 font-light">
                  <Loader2 size={14} strokeWidth={1} className="animate-spin text-white/30" />
                  <span className="animate-pulse">Analizuje...</span>
                </div>
              </div>
            )}

            {/* Error state with retry */}
            {sendMutation.isError && !sendMutation.isPending && (
              <div className="flex items-start gap-3 mt-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                  <AlertCircle size={14} strokeWidth={1.5} className="text-red-400" />
                </div>
                <div className="flex flex-col gap-2 rounded-2xl rounded-bl-sm bg-red-500/5 border border-red-500/20 px-4 py-3">
                  <p className="text-sm text-red-300/80 font-light">
                    Coś poszło nie tak. Spróbuj ponownie.
                  </p>
                  {lastFailedContent && (
                    <button
                      onClick={handleRetry}
                      className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
                    >
                      <RotateCcw size={11} strokeWidth={1.5} />
                      Wyślij ponownie
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div ref={messagesEndRef} className="h-8" />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-white/[0.06] bg-black/90 backdrop-blur-xl px-4 py-4">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Odpowiedz trenerowi..."
              rows={1}
              style={{ minHeight: "44px", maxHeight: "120px" }}
              className="flex-1 resize-none rounded-[22px] border border-white/[0.15] bg-[#111111] px-5 py-3 text-sm placeholder:text-white/20 font-light focus:border-white/30 focus:outline-none transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              className="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full bg-[#c5e063] text-black transition-all disabled:opacity-40 disabled:scale-95 active:scale-95 hover:bg-[#d4ef72]"
            >
              <Send size={16} strokeWidth={1} className="ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OnboardingBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "flex items-end gap-2 w-full max-w-[90%]",
          isUser ? "flex-row-reverse" : "flex-row",
        )}
      >
        {!isUser && (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 mb-1">
            <Bot size={16} strokeWidth={1} className="text-white/50" />
          </div>
        )}
        <div
          className={cn(
            "px-5 py-3.5 text-sm font-light leading-relaxed",
            isUser
              ? "bg-[#f0ede8] text-black rounded-2xl rounded-br-sm inline-block"
              : "bg-[#111111] border border-white/[0.1] text-white/80 rounded-2xl rounded-bl-sm",
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  );
}
