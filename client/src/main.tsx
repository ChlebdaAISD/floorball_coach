import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { apiRequest } from "./lib/utils";
import "./index.css";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

queryClient.setMutationDefaults(["chat-send"], {
  mutationFn: (content: string) =>
    apiRequest("/api/chat", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
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
