import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, formatShortDate } from "@/lib/utils";
import { X, Loader2, AlertTriangle, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/hooks/use-auth";
import type { AthleteProfile, Injury, TrainingPlan } from "@shared/schema";

const FACILITY_OPTIONS = ["gym", "pool", "home", "outdoor"] as const;
const FACILITY_LABELS: Record<string, string> = {
  gym: "Siłownia",
  pool: "Basen",
  home: "Dom",
  outdoor: "Na zewnątrz",
};
const GYM_LEVEL_OPTIONS = [
  { value: "beginner", label: "Początkujący" },
  { value: "intermediate", label: "Średniozaawansowany" },
  { value: "advanced", label: "Zaawansowany" },
];

type FormState = {
  sport: string;
  sportPosition: string;
  experienceYears: string;
  age: string;
  heightCm: string;
  weightKg: string;
  gymExperienceLevel: string;
  trainingDaysPerWeek: string;
  availableFacilities: string[];
  additionalNotes: string;
};

const EMPTY_FORM: FormState = {
  sport: "",
  sportPosition: "",
  experienceYears: "",
  age: "",
  heightCm: "",
  weightKg: "",
  gymExperienceLevel: "",
  trainingDaysPerWeek: "",
  availableFacilities: [],
  additionalNotes: "",
};

function toIntOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toFloatOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function SettingsModal() {
  const { isOpen, closeSettings } = useSettings();
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery<AthleteProfile | null>({
    queryKey: ["profile"],
    queryFn: () => apiRequest("/api/profile"),
    enabled: isOpen,
  });

  const { data: activePlan } = useQuery<TrainingPlan | null>({
    queryKey: ["plans", "active"],
    queryFn: () => apiRequest("/api/plans/active"),
    enabled: isOpen,
  });

  const { data: recentInjuries = [] } = useQuery<Injury[]>({
    queryKey: ["injuries", "recent"],
    queryFn: () => apiRequest("/api/injuries"),
    enabled: isOpen,
  });

  const { data: me } = useQuery<{
    emailNudges?: boolean;
    timezone?: string;
    email?: string | null;
  } | null>({
    queryKey: ["me"],
    queryFn: () => apiRequest("/api/me"),
    enabled: isOpen,
  });

  const [emailNudges, setEmailNudges] = useState(true);
  const [timezone, setTimezone] = useState("Europe/Warsaw");
  const notificationsHydratedRef = useRef(false);
  useEffect(() => {
    if (me && !notificationsHydratedRef.current) {
      notificationsHydratedRef.current = true;
      if (typeof me.emailNudges === "boolean") setEmailNudges(me.emailNudges);
      if (me.timezone) setTimezone(me.timezone);
    }
  }, [me]);
  useEffect(() => {
    if (!isOpen) notificationsHydratedRef.current = false;
  }, [isOpen]);

  const saveNotificationsMutation = useMutation({
    mutationFn: (data: { emailNudges: boolean; timezone: string }) =>
      apiRequest("/api/settings", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) setConfirmLogout(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      hasHydratedRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (profile && !hasHydratedRef.current) {
      hasHydratedRef.current = true;
      setForm({
        sport: profile.sport ?? "",
        sportPosition: profile.sportPosition ?? "",
        experienceYears: profile.experienceYears != null ? String(profile.experienceYears) : "",
        age: profile.age != null ? String(profile.age) : "",
        heightCm: profile.heightCm != null ? String(profile.heightCm) : "",
        weightKg: profile.weightKg != null ? String(profile.weightKg) : "",
        gymExperienceLevel: profile.gymExperienceLevel ?? "",
        trainingDaysPerWeek: profile.trainingDaysPerWeek != null ? String(profile.trainingDaysPerWeek) : "",
        availableFacilities: Array.isArray(profile.availableFacilities)
          ? (profile.availableFacilities as string[])
          : [],
        additionalNotes: profile.additionalNotes ?? "",
      });
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: (data: FormState) =>
      apiRequest("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          sport: data.sport || null,
          sportPosition: data.sportPosition || null,
          experienceYears: toIntOrNull(data.experienceYears),
          age: toIntOrNull(data.age),
          heightCm: toIntOrNull(data.heightCm),
          weightKg: toFloatOrNull(data.weightKg),
          gymExperienceLevel: data.gymExperienceLevel || null,
          trainingDaysPerWeek: toIntOrNull(data.trainingDaysPerWeek),
          availableFacilities: data.availableFacilities,
          additionalNotes: data.additionalNotes || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      closeSettings();
    },
  });

  const handleChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const toggleFacility = (facility: string) => {
    setForm((f) => ({
      ...f,
      availableFacilities: f.availableFacilities.includes(facility)
        ? f.availableFacilities.filter((x) => x !== facility)
        : [...f.availableFacilities, facility],
    }));
  };

  const handleLogout = async () => {
    await logout();
  };

  if (!isOpen) return null;

  const visibleInjuries = recentInjuries.slice(0, 2);

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeSettings}
      />

      {/* Sheet — fills canvas, leaves TopNav visible, covers BottomNav */}
      <div className="relative z-10 flex flex-col bg-[#0a0a0a] rounded-t-[32px] border-t border-white/[0.10]" style={{ height: "calc(100% - 60px)" }}>
        {/* Sheet handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Sheet header */}
        <div className="flex items-center justify-between px-4 pt-2 pb-4 flex-shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/40 leading-none mb-0.5">Konfiguracja</p>
            <h2 className="text-xl font-semibold leading-none text-white">Profil zawodnika</h2>
          </div>
          <button
            onClick={closeSettings}
            aria-label="Zamknij ustawienia"
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
              {/* Podstawowe */}
              <div className="space-y-6">
                <h3 className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">Sport</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Dyscyplina</label>
                    <Input
                      type="text"
                      value={form.sport}
                      onChange={(e) => handleChange("sport", e.target.value)}
                      placeholder="Np. unihokej"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Pozycja</label>
                    <Input
                      type="text"
                      value={form.sportPosition}
                      onChange={(e) => handleChange("sportPosition", e.target.value)}
                      placeholder="Np. napastnik"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Doświadczenie (lata)</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={form.experienceYears}
                      onChange={(e) => handleChange("experienceYears", e.target.value)}
                      placeholder="10"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Treningi/tydzień</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={7}
                      value={form.trainingDaysPerWeek}
                      onChange={(e) => handleChange("trainingDaysPerWeek", e.target.value)}
                      placeholder="4"
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-white/[0.08]" />

              {/* Ciało */}
              <div className="space-y-6">
                <h3 className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">Parametry</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Wiek</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={form.age}
                      onChange={(e) => handleChange("age", e.target.value)}
                      placeholder="32"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Wzrost (cm)</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={form.heightCm}
                      onChange={(e) => handleChange("heightCm", e.target.value)}
                      placeholder="180"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Waga (kg)</label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={form.weightKg}
                      onChange={(e) => handleChange("weightKg", e.target.value)}
                      placeholder="78"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Poziom na siłowni</label>
                  <div className="grid grid-cols-3 gap-2">
                    {GYM_LEVEL_OPTIONS.map((opt) => {
                      const isActive = form.gymExperienceLevel === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleChange("gymExperienceLevel", isActive ? "" : opt.value)}
                          className={`h-12 rounded-full border text-sm transition-colors ${
                            isActive
                              ? "border-[#c5e063] bg-[#c5e063]/10 text-[#c5e063]"
                              : "border-white/15 text-white/70 hover:border-white/40"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Dostępne warunki</label>
                  <div className="flex flex-wrap gap-2">
                    {FACILITY_OPTIONS.map((f) => {
                      const isActive = form.availableFacilities.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => toggleFacility(f)}
                          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                            isActive
                              ? "border-[#c5e063] bg-[#c5e063]/10 text-[#c5e063]"
                              : "border-white/15 text-white/70 hover:border-white/40"
                          }`}
                        >
                          {FACILITY_LABELS[f]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Dodatkowe notatki</label>
                  <Textarea
                    value={form.additionalNotes}
                    onChange={(e) => handleChange("additionalNotes", e.target.value)}
                    placeholder="Cokolwiek co trener powinien wiedzieć..."
                  />
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
                className="w-full"
              >
                {saveMutation.isPending ? "Zapisywanie..." : "Zapisz profil"}
              </Button>

              {/* Aktywny plan treningowy */}
              <div className="h-px bg-white/[0.08]" />
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">Aktualny plan treningowy</h3>
                {activePlan ? (
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-sm font-medium text-white">{activePlan.name}</p>
                    {activePlan.phase && (
                      <p className="mt-1 text-xs uppercase tracking-wider text-white/40">{activePlan.phase.replace(/_/g, " ")}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-white/40 font-light">Brak aktywnego planu.</p>
                )}
              </div>

              {/* Ostatnie kontuzje */}
              <div className="h-px bg-white/[0.08]" />
              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold tracking-widest text-white/40 uppercase flex items-center gap-2">
                  <AlertTriangle size={12} strokeWidth={1.5} className="text-orange-400" />
                  Ostatnie kontuzje
                </h3>
                {visibleInjuries.length === 0 ? (
                  <p className="text-sm text-white/40 font-light">Brak kontuzji w historii.</p>
                ) : (
                  <div className="space-y-2">
                    {visibleInjuries.map((inj) => (
                      <div key={inj.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-white font-medium">{inj.bodyPart}</span>
                          {inj.severity && (
                            <span className="text-[10px] uppercase tracking-wider text-white/40">{inj.severity}</span>
                          )}
                        </div>
                        {inj.injuryType && (
                          <p className="mt-1 text-xs text-white/50">{inj.injuryType}</p>
                        )}
                        <p className="mt-1 text-xs text-white/40 font-light">
                          {inj.dateOccurred ? formatShortDate(inj.dateOccurred) : "—"}
                          {" · "}
                          {inj.isActive
                            ? "Aktywna"
                            : inj.dateResolved
                            ? `Zakończona ${formatShortDate(inj.dateResolved)}`
                            : "Zakończona"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Powiadomienia email */}
              <div className="h-px bg-white/[0.08]" />
              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold tracking-widest text-white/40 uppercase flex items-center gap-2">
                  <Mail size={12} strokeWidth={1.5} className="text-white/60" />
                  Powiadomienia email
                </h3>
                <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 cursor-pointer">
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">Przypomnienia trenera</p>
                    <p className="mt-1 text-xs text-white/40 font-light">
                      Poranny mail o gotowości i przypomnienie o zapisaniu treningu.
                    </p>
                    {!me?.email && (
                      <p className="mt-2 text-xs text-amber-300/80 font-light">
                        Dodaj email do konta, aby aktywować przypomnienia.
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={emailNudges}
                    onChange={(e) => setEmailNudges(e.target.checked)}
                    className="h-5 w-5 accent-[#c5e063]"
                  />
                </label>
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">
                    Strefa czasowa
                  </label>
                  <Input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Europe/Warsaw"
                  />
                  <p className="text-[11px] text-white/40 font-light">
                    Format IANA, np. Europe/Warsaw. Wpływa na godziny wysyłki powiadomień.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => saveNotificationsMutation.mutate({ emailNudges, timezone })}
                  disabled={saveNotificationsMutation.isPending}
                  className="w-full"
                >
                  {saveNotificationsMutation.isPending ? "Zapisywanie..." : "Zapisz powiadomienia"}
                </Button>
              </div>

              {/* Logout */}
              <div className="h-px bg-white/[0.08]" />
              {confirmLogout ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                  <p className="text-sm text-white/80 font-light">
                    Na pewno chcesz się wylogować?
                  </p>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={handleLogout} className="flex-1">
                      <LogOut size={14} strokeWidth={1.5} className="mr-2" />
                      Wyloguj
                    </Button>
                    <Button variant="outline" onClick={() => setConfirmLogout(false)} className="flex-1">
                      Anuluj
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setConfirmLogout(true)} className="w-full">
                  <LogOut size={14} strokeWidth={1.5} className="mr-2" />
                  Wyloguj
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
