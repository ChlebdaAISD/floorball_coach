import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/utils";
import { ArrowLeft, Settings, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
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
    const [, setLocation] = useLocation();
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

    useEffect(() => {
        if (user) {
            setForm({
                bio: user.bio || "",
                trainingGoal: user.trainingGoal || "",
                seasonStart: user.seasonStart ? new Date(user.seasonStart).toISOString().split('T')[0] : "",
                seasonEnd: user.seasonEnd ? new Date(user.seasonEnd).toISOString().split('T')[0] : "",
                offSeasonStart: user.offSeasonStart ? new Date(user.offSeasonStart).toISOString().split('T')[0] : "",
                offSeasonEnd: user.offSeasonEnd ? new Date(user.offSeasonEnd).toISOString().split('T')[0] : "",
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
        <div className="flex-1 overflow-y-auto bg-black px-6 py-8 text-white min-h-[100dvh]">
            <div className="mb-10 flex items-center justify-between">
                <button onClick={() => setLocation("/")} className="text-white/50 hover:text-white transition-colors">
                    <ArrowLeft size={20} strokeWidth={1} />
                </button>
                <div className="text-white/30">
                    <Settings size={20} strokeWidth={1} />
                </div>
            </div>

            <div className="mb-10">
                <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Konfiguracja</p>
                <h1 className="text-2xl font-semibold mb-3">Profil</h1>
                <p className="text-sm text-white/30 font-light leading-relaxed">
                    Informacje tutaj posłużą Twojemu trenerowi AI żeby lepiej dopasować plany treningowe do Twoich potrzeb i celów.
                </p>
            </div>

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
    );
}
