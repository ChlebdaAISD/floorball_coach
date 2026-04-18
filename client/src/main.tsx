import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import type { ChatMessage } from "@shared/schema";
import "./index.css";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const STREAM_PLACEHOLDER_ID = -1;

function setChatMessages(
  updater: (prev: ChatMessage[]) => ChatMessage[],
) {
  const keys = [["chat"], ["chat", "today"]];
  for (const key of keys) {
    queryClient.setQueryData<ChatMessage[]>(key, (old) => updater(old || []));
  }
}

queryClient.setMutationDefaults(["chat-send"], {
  mutationFn: async (content: string) => {
    const userOptimistic: ChatMessage = {
      id: -2,
      userId: 0,
      role: "user",
      content,
      createdAt: new Date() as any,
      planSuggestion: null,
      suggestionStatus: null,
      contextType: "chat",
      extractedData: null,
    };
    const assistantPlaceholder: ChatMessage = {
      id: STREAM_PLACEHOLDER_ID,
      userId: 0,
      role: "assistant",
      content: "",
      createdAt: new Date() as any,
      planSuggestion: null,
      suggestionStatus: null,
      contextType: "chat",
      extractedData: null,
    };

    setChatMessages((prev) => [...prev, userOptimistic, assistantPlaceholder]);

    const res = await fetch("/api/chat/stream", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok || !res.body) {
      setChatMessages((prev) => prev.filter((m) => m.id !== STREAM_PLACEHOLDER_ID && m.id !== -2));
      throw new Error("Chat stream failed");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const line = rawEvent.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const payload = line.slice(6);
        if (!payload) continue;

        try {
          const event = JSON.parse(payload);
          if (event.type === "chunk") {
            accumulated += event.text;
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === STREAM_PLACEHOLDER_ID ? { ...m, content: accumulated } : m,
              ),
            );
          } else if (event.type === "done" || event.type === "error") {
            return event.message as ChatMessage;
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
    return null as any;
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["chat"] });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
