import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/utils";

interface User {
  id: number;
  username: string;
  onboardingComplete?: boolean;
  onboardingProgress?: Record<string, boolean> | null;
  bio?: string | null;
  trainingGoal?: string | null;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["auth"],
    queryFn: async () => {
      try {
        return await apiRequest<User>("/api/me");
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
  });

  const loginMutation = useMutation({
    mutationFn: (password: string) =>
      apiRequest<User>("/api/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.setQueryData(["auth"], null);
      queryClient.clear();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    needsOnboarding: !!user && user.onboardingComplete === false,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
  };
}
