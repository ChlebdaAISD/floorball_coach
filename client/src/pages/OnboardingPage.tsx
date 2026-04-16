import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, Bot, Sparkles } from "lucide-react";
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
  const [hasKickedOff, setHasKickedOff] = useState(false);

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
      setInput("");
      if (content) {
        await queryClient.cancelQueries({ queryKey: ["onboarding-messages"] });
        const previous = queryClient.getQueryData<ChatMessage[]>(["onboarding-messages"]);
        const optimistic: ChatMessage = {
          id: Math.random(),
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
        return { previous };
      }
    },
    onError: (_err, _content, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["onboarding-messages"], ctx.previous);
      }
    },
    onSuccess: (data) => {
      setTopicsCovered(data.topicsCovered || {});
      if (data.isComplete) {
        // Refresh auth so App picks up onboardingComplete=true
        queryClient.invalidateQueries({ queryKey: ["auth"] });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-messages"] });
    },
  });

  // Kick off the conversation on first render if there are no messages
  useEffect(() => {
    if (!hasKickedOff && messages.length === 0 && !sendMutation.isPending) {
      setHasKickedOff(true);
      sendMutation.mutate(null);
    }
  }, [messages.length, hasKickedOff, sendMutation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending]);

  const handleSend = () => {
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
  };

  const coveredCount = TOPICS.filter((t) => topicsCovered[t.key]).length;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div
        className="relative flex w-full max-w-[430px] flex-col overflow-hidden bg-black md:rounded-[32px] md:border md:border-white/[0.08] md:shadow-2xl"
        style={{ height: "min(100vh, 900px)" }}
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
                  "h-1 flex-1 rounded-full transition-colors",
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
