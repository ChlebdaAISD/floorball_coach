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

    setChatMessages((prev) => [...prev, userOptimistic]);

    const res = await fetch("/api/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      setChatMessages((prev) => prev.filter((m) => m.id !== -2));
      throw new Error("Chat request failed");
    }

    return (await res.json()) as ChatMessage;
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
