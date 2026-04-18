import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { Send, Loader2, Check, X, Bot, User, Settings } from "lucide-react";
import { cn, apiRequest } from "@/lib/utils";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import type { ChatMessage } from "@shared/schema";
import { Button } from "@/components/ui/Button";
import { useSettings } from "@/contexts/SettingsContext";
import { useSetTopNav } from "@/contexts/TopNavContext";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const { openSettings } = useSettings();
  const queryClient = useQueryClient();

  useSetTopNav(
    () => ({
      label: "Asystent",
      title: "Trener AI",
      right: (
        <button
          onClick={openSettings}
          className="rounded-full border border-white/20 p-3 text-white/50 hover:text-white hover:border-white/40 transition-colors"
        >
          <Settings size={18} strokeWidth={1} />
        </button>
      ),
    }),
    [openSettings],
  );

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["chat"],
    queryFn: () => apiRequest("/api/chat?limit=50"),
  });

  const sendMutation = useMutation<ChatMessage, Error, string, { previousMessages?: ChatMessage[] }>({
    mutationKey: ["chat-send"],
    onMutate: async (newContent) => {
      setInput("");
      await queryClient.cancelQueries({ queryKey: ["chat"] });
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(["chat"]);

      const optimisticMessage: ChatMessage = {
        id: Math.random(),
        userId: 0,
        role: "user",
        content: newContent,
        createdAt: new Date() as any,
        planSuggestion: null,
        suggestionStatus: null,
        contextType: "chat",
        extractedData: null,
      };

      queryClient.setQueryData<ChatMessage[]>(["chat"], (old) => [...(old || []), optimisticMessage]);
      return { previousMessages };
    },
    onError: (_err, _newContent, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["chat"], context.previousMessages);
      }
    },
  });

  const isSending = useIsMutating({ mutationKey: ["chat-send"] }) > 0;

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    stickToBottomRef.current = true;
    sendMutation.mutate(input.trim());
  };

  const handleSuggestion = (suggestion: string) => {
    const trimmed = suggestion.trim();
    if (!trimmed || isSending) return;
    stickToBottomRef.current = true;
    sendMutation.mutate(trimmed);
  };

  const applyMutation = useMutation({
    mutationFn: ({ messageId, suggestion }: { messageId: number; suggestion: any }) =>
      apiRequest("/api/calendar/apply-suggestion", {
        method: "POST",
        body: JSON.stringify({ ...suggestion, messageId }),
      }),
    onMutate: async ({ messageId }) => {
      await queryClient.cancelQueries({ queryKey: ["chat"] });
      const previous = queryClient.getQueryData<ChatMessage[]>(["chat"]);
      queryClient.setQueryData<ChatMessage[]>(["chat"], (old) =>
        (old || []).map((m) => (m.id === messageId ? { ...m, suggestionStatus: "accepted" } : m)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["chat"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chat"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (messageId: number) =>
      apiRequest(`/api/chat/messages/${messageId}/reject-suggestion`, { method: "POST" }),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ["chat"] });
      const previous = queryClient.getQueryData<ChatMessage[]>(["chat"]);
      queryClient.setQueryData<ChatMessage[]>(["chat"], (old) =>
        (old || []).map((m) => (m.id === messageId ? { ...m, suggestionStatus: "rejected" } : m)),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["chat"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
  });

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-black text-white">
      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 scrollbar-none"
      >
        {messages.length === 0 && !isSending && (
          <div className="flex h-full flex-col items-center justify-center text-center px-4">
            <div className="mb-6 h-16 w-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <Bot size={28} strokeWidth={1} className="text-white/60" />
            </div>
            <h2 className="text-xl font-semibold mb-3 tracking-wide">O co chcesz zapytać?</h2>
            <p className="text-sm text-white/30 font-light max-w-[240px] mb-10">
              Opowiedz mi jak się czujesz, zapytaj o plan treningowy lub zgłoś kontuzję.
            </p>
            <div className="flex flex-col w-full gap-3">
              {[
                "Jak wygląda mój plan na ten tydzień?",
                "Boli mnie kolano po treningu",
                "Zmień plan na lżejszy",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestion(suggestion)}
                  className="rounded-2xl border border-white/[0.12] bg-[#111111] p-4 text-sm text-white/50 text-left font-light transition-colors hover:border-white/25 hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onApply={(suggestion) => applyMutation.mutate({ messageId: msg.id, suggestion })}
              onReject={() => rejectMutation.mutate(msg.id)}
            />
          ))}

          {isSending && (
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
            placeholder="Napisz do trenera..."
            rows={1}
            style={{ minHeight: '44px', maxHeight: '120px' }}
            className="flex-1 resize-none rounded-[22px] border border-white/[0.15] bg-[#111111] px-5 py-3 text-sm placeholder:text-white/20 font-light focus:border-white/30 focus:outline-none transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full bg-[#c5e063] text-black transition-all disabled:opacity-40 disabled:scale-95 active:scale-95 hover:bg-[#d4ef72]"
          >
            <Send size={16} strokeWidth={1} className="ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onApply,
  onReject,
}: {
  message: ChatMessage;
  onApply: (suggestion: any) => void;
  onReject: () => void;
}) {
  const isUser = message.role === "user";
  const suggestion = message.planSuggestion as any;
  const status = message.suggestionStatus ?? null;

  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div className={cn("flex items-end gap-2 w-full max-w-[90%]", isUser ? "flex-row-reverse" : "flex-row")}>
        {!isUser && (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 mb-1">
            <Bot size={16} strokeWidth={1} className="text-white/50" />
          </div>
        )}

        <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
          <div
            className={cn(
              "px-5 py-3.5 text-sm font-light leading-relaxed",
              isUser
                ? "bg-[#f0ede8] text-black rounded-2xl rounded-br-sm inline-block"
                : "bg-[#111111] border border-white/[0.1] text-white/80 rounded-2xl rounded-bl-sm",
            )}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>

            {!isUser && suggestion && status === null && (
              <div className="mt-5 space-y-3 border-t border-white/[0.08] pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  Sugerowane zmiany na ten tydzień
                </p>
                <div className="space-y-2">
                  {(suggestion.changes || []).map((c: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 bg-black/40 border border-white/[0.08] p-3 rounded-xl">
                      <div className={cn(
                        "mt-[3px] h-2 w-2 rounded-full flex-shrink-0 ring-4",
                        c.action === "cancel" ? "bg-red-400 ring-red-400/20" : c.action === "add" ? "bg-[#c5e063] ring-[#c5e063]/20" : "bg-white/40 ring-white/10"
                      )} />
                      <div className="flex flex-col gap-0.5 mt-[-2px]">
                        <span className="text-xs font-medium text-white">
                          {c.action === "cancel" ? "Odwołaj" : c.action === "add" ? "Dodaj" : "Zmień"}: {c.title || c.date}
                        </span>
                        {c.reason && <span className="text-[10px] text-white/30 leading-snug">{c.reason}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => onApply(suggestion)}
                    className="flex-1"
                  >
                    <Check size={14} strokeWidth={1} className="mr-1.5" /> Akceptuj
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onReject}
                    className="flex-1"
                  >
                    <X size={14} strokeWidth={1} className="mr-1.5" /> Odrzuć
                  </Button>
                </div>
              </div>
            )}

            {!isUser && suggestion && status === "accepted" && (
              <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/[0.08] px-3 py-2 text-[10px] text-white/30 font-medium">
                <Check size={12} strokeWidth={1} className="text-[#c5e063]" /> Zmiany zostały zastosowane
              </div>
            )}

            {!isUser && suggestion && status === "rejected" && (
              <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/[0.08] px-3 py-2 text-[10px] text-white/30 font-medium">
                <X size={12} strokeWidth={1} className="text-white/40" /> Sugestia odrzucona
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
