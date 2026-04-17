import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

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

export default function SettingsPage() {
    const queryClient = useQueryClient();

    const { data: user, isLoading } = useQuery<UserProfile>({
        queryKey: ["auth"],
        queryFn: () => apiRequest("/api/me"),
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

    // seasonStart/End come from Postgres `date` columns as YYYY-MM-DD strings.
    // Passing through `new Date().toISOString()` shifts to UTC and can flip the
    // day for users east/west of Greenwich — keep the original date-only string.
    const toDateInput = (v?: string | null): string => {
        if (!v) return "";
        return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "";
    };

    useEffect(() => {
        if (user) {
            setForm({
                bio: user.bio || "",
                trainingGoal: user.trainingGoal || "",
                seasonStart: toDateInput(user.seasonStart),
                seasonEnd: toDateInput(user.seasonEnd),
                offSeasonStart: toDateInput(user.offSeasonStart),
                offSeasonEnd: toDateInput(user.offSeasonEnd),
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
            alert("Zapisano ustawienia profilu pomyślnie.");
        },
    });

    const handleChange = (field: keyof typeof form, value: string) => {
        setForm(f => ({ ...f, [field]: value }));
    };

    if (isLoading) {
        return (
            <div className="flex h-[100dvh] items-center justify-center bg-black">
                <Loader2 size={20} strokeWidth={1} className="animate-spin text-white/40" />
            </div>
        );
    }

    return (
        <div className="bg-black text-white min-h-[100dvh]">
            <div className="px-4 pt-4 pb-3">
                <p className="text-[11px] uppercase tracking-widest text-white/40">Konfiguracja</p>
                <h1 className="text-xl font-semibold">Profil</h1>
            </div>

            <div className="px-4 pb-32">
            <p className="text-sm text-white/30 font-light leading-relaxed mb-10">
                Informacje tutaj posłużą Twojemu trenerowi AI żeby lepiej dopasować plany treningowe do Twoich potrzeb i celów.
            </p>

            <div className="space-y-12">
                <div className="space-y-6">
                    <h2 className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">Ogólne</h2>
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

                <div className="h-px bg-white/[0.08] w-full" />

                <div className="space-y-6 pb-32">
                    <h2 className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">Terminarz Sezonu</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Początek sezonu</label>
                            <Input
                                type="date"
                                value={form.seasonStart}
                                onChange={(e) => handleChange("seasonStart", e.target.value)}
                                className="px-3 text-sm [color-scheme:dark]"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Koniec sezonu</label>
                            <Input
                                type="date"
                                value={form.seasonEnd}
                                onChange={(e) => handleChange("seasonEnd", e.target.value)}
                                className="px-3 text-sm [color-scheme:dark]"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Początek Off-season</label>
                            <Input
                                type="date"
                                value={form.offSeasonStart}
                                onChange={(e) => handleChange("offSeasonStart", e.target.value)}
                                className="px-3 text-sm [color-scheme:dark]"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest">Koniec Off-season</label>
                            <Input
                                type="date"
                                value={form.offSeasonEnd}
                                onChange={(e) => handleChange("offSeasonEnd", e.target.value)}
                                className="px-3 text-sm [color-scheme:dark]"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/90 to-transparent pt-12 pb-safe z-10">
                <Button
                    variant="primary"
                    onClick={() => mutation.mutate(form)}
                    disabled={mutation.isPending}
                    className="w-full"
                >
                    {mutation.isPending ? "Zapisywanie..." : "Zapisz Profil"}
                </Button>
            </div>
            </div>
        </div>
    );
}
