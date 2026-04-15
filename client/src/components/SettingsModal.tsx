import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useSettings } from "@/contexts/SettingsContext";

interface UserProfile {
  id: number;
  username: string;
  bio?: string | null;
  trainingGoal?: string | null;
  seasonStart?: string | null;
  seasonEnd?: string | null;
  offSeasonStart?: string | null;
  offSeasonEnd?: string | null;
  interviewAnswers?: string | null;
}

export function SettingsModal() {
  const { isOpen, closeSettings } = useSettings();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ["auth"],
    queryFn: () => apiRequest("/api/me"),
    enabled: isOpen,
  });

  const [form, setForm] = useState({
    bio: "",
    trainingGoal: "",
    seasonStart: "",
    seasonEnd: "",
    offSeasonStart: "",
    offSeasonEnd: "",
    interviewAnswers: "",
  });

  useEffect(() => {
    if (user) {
      setForm({
        bio: user.bio || "",
        trainingGoal: user.trainingGoal || "",
        seasonStart: user.seasonStart ? new Date(user.seasonStart).toISOString().split("T")[0] : "",
        seasonEnd: user.seasonEnd ? new Date(user.seasonEnd).toISOString().split("T")[0] : "",
        offSeasonStart: user.offSeasonStart ? new Date(user.offSeasonStart).toISOString().split("T")[0] : "",
        offSeasonEnd: user.offSeasonEnd ? new Date(user.offSeasonEnd).toISOString().split("T")[0] : "",
        interviewAnswers: user.interviewAnswers || "",
      });
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("/api/settings", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth"], data);
      closeSettings();
    },
  });

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeSettings}
      />

      {/* Sheet — slides up from bottom, leaves TopNav visible */}
      <div className="relative z-10 flex flex-col bg-[#0a0a0a] rounded-t-[32px] border-t border-white/[0.10] max-h-[88vh]">
        {/* Sheet handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Sheet header */}
        <div className="flex items-center justify-between px-4 pt-2 pb-4 flex-shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/40 leading-none mb-0.5">Konfiguracja</p>
            <h2 className="text-xl font-semibold leading-none text-white">Profil</h2>
          </div>
          <button
            onClick={closeSettings}
            className="rounded-full border border-white/20 p-3 text-white/50 hover:text-white hover:border-white/40 transition-colors"
          >
            <X size={18} strokeWidth={1} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 size={20} strokeWidth={1} className="animate-spin text-white/40" />
            </div>
          ) : (
            <div className="space-y-10">
              <p className="text-sm text-white/30 font-light leading-relaxed">
                Informacje tutaj posłużą Twojemu trenerowi AI żeby lepiej dopasować plany treningowe do Twoich potrzeb i celów.
              </p>

              <div className="space-y-6">
                <h3 className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">Ogólne</h3>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">O Tobie (Bio)</label>
                    <Textarea
                      value={form.bio}
                      onChange={(e) => handleChange("bio", e.target.value)}
                      placeholder="Napisz kilka słów o sobie..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Główny Cel Treningowy</label>
                    <Input
                      type="text"
                      value={form.trainingGoal}
                      onChange={(e) => handleChange("trainingGoal", e.target.value)}
                      placeholder="Np. Poprawa wydolności..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Odpowiedzi z Wywiadu</label>
                    <Textarea
                      value={form.interviewAnswers}
                      onChange={(e) => handleChange("interviewAnswers", e.target.value)}
                      placeholder="Możesz tu skopiować odpowiedź z formularza..."
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-white/[0.08]" />

              <div className="space-y-6">
                <h3 className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">Terminarz Sezonu</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Początek sezonu</label>
                    <Input type="date" value={form.seasonStart} onChange={(e) => handleChange("seasonStart", e.target.value)} className="px-3 text-sm [color-scheme:dark]" />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Koniec sezonu</label>
                    <Input type="date" value={form.seasonEnd} onChange={(e) => handleChange("seasonEnd", e.target.value)} className="px-3 text-sm [color-scheme:dark]" />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Początek Off-season</label>
                    <Input type="date" value={form.offSeasonStart} onChange={(e) => handleChange("offSeasonStart", e.target.value)} className="px-3 text-sm [color-scheme:dark]" />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Koniec Off-season</label>
                    <Input type="date" value={form.offSeasonEnd} onChange={(e) => handleChange("offSeasonEnd", e.target.value)} className="px-3 text-sm [color-scheme:dark]" />
                  </div>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending}
                className="w-full"
              >
                {mutation.isPending ? "Zapisywanie..." : "Zapisz Profil"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
