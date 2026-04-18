import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { Send, Loader2, Check, X, Bot, Settings, History, ArrowLeft } from "lucide-react";
import { cn, apiRequest } from "@/lib/utils";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import type { ChatMessage } from "@shared/schema";
import { Button } from "@/components/ui/Button";
import { useSettings } from "@/contexts/SettingsContext";
import { useSetTopNav } from "@/contexts/TopNavContext";

type HistoryDay = { day: string; message_count: number };

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingDay, setViewingDay] = useState<string | null>(null);
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-full border border-white/20 p-3 text-white/50 hover:text-white hover:border-white/40 transition-colors"
            aria-label="Historia rozmów"
          >
            <History size={18} strokeWidth={1} />
          </button>
          <button
            onClick={openSettings}
            className="rounded-full border border-white/20 p-3 text-white/50 hover:text-white hover:border-white/40 transition-colors"
          >
            <Settings size={18} strokeWidth={1} />
          </button>
        </div>
      ),
    }),
    [openSettings],
  );

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["chat", "today"],
    queryFn: () => apiRequest("/api/chat?date=today&limit=50"),
  });

  const sendMutation = useMutation<ChatMessage, Error, string>({
    mutationKey: ["chat-send"],
    onMutate: () => {
      setInput("");
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
      await queryClient.cancelQueries({ queryKey: ["chat", "today"] });
      const previous = queryClient.getQueryData<ChatMessage[]>(["chat", "today"]);
      queryClient.setQueryData<ChatMessage[]>(["chat", "today"], (old) =>
        (old || []).map((m) => (m.id === messageId ? { ...m, suggestionStatus: "accepted" } : m)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["chat", "today"], context.previous);
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
      await queryClient.cancelQueries({ queryKey: ["chat", "today"] });
      const previous = queryClient.getQueryData<ChatMessage[]>(["chat", "today"]);
      queryClient.setQueryData<ChatMessage[]>(["chat", "today"], (old) =>
        (old || []).map((m) => (m.id === messageId ? { ...m, suggestionStatus: "rejected" } : m)),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["chat", "today"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
  });

  if (viewingDay) {
    return (
      <HistoryDayView
        day={viewingDay}
        onBack={() => setViewingDay(null)}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-black text-white">
      {historyOpen && (
        <HistoryDrawer
          onClose={() => setHistoryOpen(false)}
          onSelect={(day) => {
            setHistoryOpen(false);
            setViewingDay(day);
          }}
        />
      )}
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
  readOnly = false,
}: {
  message: ChatMessage;
  onApply: (suggestion: any) => void;
  onReject: () => void;
  readOnly?: boolean;
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

            {!isUser && suggestion && status === null && !readOnly && (
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

function HistoryDrawer({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (day: string) => void;
}) {
  const { data: days = [], isLoading } = useQuery<HistoryDay[]>({
    queryKey: ["chat-history-days"],
    queryFn: () => apiRequest("/api/chat/history-days?limit=5"),
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-auto rounded-t-3xl border-t border-white/[0.08] bg-[#0a0a0a] p-6 shadow-2xl"
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/15" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold tracking-wide text-white">Historia rozmów</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-white/15 p-2 text-white/50 hover:text-white hover:border-white/30 transition-colors"
          >
            <X size={14} strokeWidth={1} />
          </button>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-white/30 font-light">Ładowanie…</div>
        ) : days.length === 0 ? (
          <div className="py-10 text-center text-sm text-white/30 font-light">Brak wcześniejszych rozmów</div>
        ) : (
          <div className="flex flex-col gap-2">
            {days.map((d) => {
              const dayDate = new Date(d.day + "T00:00:00");
              const label = format(dayDate, "EEEE, d MMMM yyyy", { locale: pl });
              const isToday = d.day.slice(0, 10) === todayStr;
              return (
                <button
                  key={d.day}
                  onClick={() => onSelect(d.day.slice(0, 10))}
                  className="flex items-center justify-between rounded-2xl border border-white/[0.1] bg-[#111111] px-4 py-3 text-left text-sm text-white/80 font-light transition-colors hover:border-white/25 hover:text-white"
                >
                  <div className="flex flex-col">
                    <span className="capitalize">{label}</span>
                    <span className="text-[11px] text-white/30">
                      {d.message_count} wiad. {isToday && "· dzisiaj"}
                    </span>
                  </div>
                  <ArrowLeft size={14} strokeWidth={1} className="rotate-180 text-white/30" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryDayView({ day, onBack }: { day: string; onBack: () => void }) {
  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["chat", day],
    queryFn: () => apiRequest(`/api/chat?date=${day}&limit=200`),
  });

  const dayLabel = format(new Date(day + "T00:00:00"), "EEEE, d MMMM yyyy", { locale: pl });

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-black text-white">
      <div className="shrink-0 flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-full border border-white/20 p-2 text-white/60 hover:text-white hover:border-white/40 transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={1} />
        </button>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest text-white/30">Historia</span>
          <span className="text-sm font-medium capitalize">{dayLabel}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-none">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-white/30 font-light">Ładowanie…</div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-white/30 font-light">Brak wiadomości</div>
        ) : (
          <div className="space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onApply={() => {}} onReject={() => {}} readOnly />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
