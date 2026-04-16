import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/utils";

interface User {
  id: number;
  username: string;
  email?: string | null;
  onboardingComplete?: boolean;
  onboardingProgress?: Record<string, boolean> | null;
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
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      apiRequest<User>("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth"], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: ({ email, username, password }: { email: string; username: string; password: string }) =>
      apiRequest<User>("/api/register", {
        method: "POST",
        body: JSON.stringify({ email, username, password }),
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
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    loginError: loginMutation.error ?? registerMutation.error,
    isLoggingIn: loginMutation.isPending || registerMutation.isPending,
  };
}
