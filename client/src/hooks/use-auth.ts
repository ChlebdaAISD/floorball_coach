import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiRequest, setUnauthorizedHandler } from "@/lib/utils";
import type { User as DbUser } from "@shared/schema";

// Client-side view of the user — only the fields /api/me exposes.
export type AuthUser = Pick<
  DbUser,
  "id" | "username" | "email" | "onboardingComplete" | "onboardingProgress" | "trainingGoal"
>;

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth"],
    queryFn: async () => {
      try {
        return await apiRequest<AuthUser>("/api/me");
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Register a global 401 handler so any request that fails with 401 clears
  // the auth cache and pushes the user back to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.setQueryData(["auth"], null);
      queryClient.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      apiRequest<AuthUser>("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth"], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: ({ email, username, password }: { email: string; username: string; password: string }) =>
      apiRequest<AuthUser>("/api/register", {
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
    loginError: loginMutation.error,
    registerError: registerMutation.error,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}
