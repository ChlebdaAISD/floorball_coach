import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, Check, X, Bot, User } from "lucide-react";
import { cn, apiRequest } from "@/lib/utils";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import type { ChatMessage } from "@shared/schema";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["chat"],
    queryFn: () => apiRequest("/api/chat?limit=50"),
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest<ChatMessage>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onMutate: async (newContent) => {
      setInput("");
      await queryClient.cancelQueries({ queryKey: ["chat"] });
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(["chat"]);

      const optimisticMessage: ChatMessage = {
        id: Math.random(),
        role: "user",
        content: newContent,
        createdAt: new Date() as any,
        planSuggestion: null
      };

      queryClient.setQueryData<ChatMessage[]>(["chat"], (old) => [...(old || []), optimisticMessage]);
      return { previousMessages };
    },
    onError: (_err, _newContent, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["chat"], context.previousMessages);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chat"] });
      // Invalidate calendar in case AI made changes
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending]);

  const handleSend = () => {
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
  };

  const applyMutation = useMutation({
    mutationFn: (suggestion: any) =>
      apiRequest("/api/calendar/apply-suggestion", {
        method: "POST",
        body: JSON.stringify(suggestion),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
  });

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      {/* Header */}
      <div className="border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-bold">Trener AI</h1>
        <p className="text-xs text-slate-500">
          Rozmawiaj o treningach, kontuzjach, samopoczuciu
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !sendMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="mb-3 h-10 w-10 text-blue-400/50" />
            <p className="text-sm text-slate-500">
              Cześć! Jestem Twoim trenerem AI. Opowiedz mi jak się czujesz,
              zapytaj o plan treningowy, lub zgłoś kontuzję.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {[
                "Jak wygląda mój plan na ten tydzień?",
                "Boli mnie kolano po treningu",
                "Zmień plan na lżejszy",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { sendMutation.mutate(suggestion); }}
                  className="rounded-full bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onApply={(s) => applyMutation.mutate(s)}
            />
          ))}

          {sendMutation.isPending && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20">
                <Bot className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                <span className="animate-pulse">Analizuje...</span>
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 px-4 py-3">
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
            placeholder="Napisz do trenera..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50 disabled:hover:bg-blue-600"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onApply,
}: {
  message: ChatMessage;
  onApply: (suggestion: any) => void;
}) {
  const isUser = message.role === "user";
  const [isApplied, setIsApplied] = useState(false);

  const suggestion = message.planSuggestion as any;

  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
        <div
          className={cn(
            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
            isUser ? "bg-slate-700" : "bg-blue-500/20",
          )}
        >
          {isUser ? (
            <User className="h-4 w-4 text-slate-300" />
          ) : (
            <Bot className="h-4 w-4 text-blue-400" />
          )}
        </div>

        <div className={cn("max-w-[85%]", isUser && "text-right")}>
          <div
            className={cn(
              "inline-block rounded-2xl px-4 py-3 text-sm shadow-sm",
              isUser
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-200 border border-slate-700/50",
            )}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>

            {!isUser && suggestion && !isApplied && (
              <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Sugerowane zmiany w kalendarzu:
                </p>
                <div className="space-y-1.5">
                  {(suggestion.changes || []).map((c: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <div className={cn(
                        "mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0",
                        c.action === "cancel" ? "bg-red-500" : c.action === "add" ? "bg-green-500" : "bg-blue-500"
                      )} />
                      <span>
                        <span className="font-bold">
                          {c.action === "cancel" ? "Odwołaj" : c.action === "add" ? "Dodaj" : "Zmień"}:
                        </span>{" "}
                        {c.title || c.date} {c.reason && <span className="text-slate-500 italic"> — {c.reason}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      onApply(suggestion);
                      setIsApplied(true);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" /> Akceptuj
                  </button>
                  <button
                    onClick={() => setIsApplied(true)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-700 py-2 text-xs font-bold text-slate-300 hover:bg-slate-600 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> Odrzuć
                  </button>
                </div>
              </div>
            )}

            {isApplied && !isUser && suggestion && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500 italic">
                <Check className="h-3 w-3" /> Sugestia przetworzona
              </div>
            )}
          </div>

          <p className="mt-1 text-[10px] text-slate-600">
            {format(new Date(message.createdAt), "HH:mm", { locale: pl })}
          </p>
        </div>
      </div>
    </div>
  );
}
