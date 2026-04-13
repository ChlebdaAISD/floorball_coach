import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/utils";
import { User, Settings, Save, Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

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
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950 px-4 py-6 text-slate-200">
            <div className="mb-6 flex items-center gap-3">
                <button onClick={() => setLocation("/")} className="text-slate-400 hover:text-white">
                    <ArrowLeft className="h-6 w-6" />
                </button>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Settings className="h-6 w-6" /> Ustawienia Profilu
                </h1>
            </div>

            <p className="text-sm text-slate-400 mb-6">
                Informacje tutaj posłużą Twojemu trenerowi AI żeby lepiej dopasować plany treningowe do Twoich potrzeb i celów.
            </p>

            <div className="space-y-6">
                <div className="rounded-xl bg-slate-900 justify-between">
                    <div className="p-4 border-b border-slate-800">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <User className="h-5 w-5 text-blue-400" /> Ogólne
                        </h2>
                    </div>
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">O Tobie (Bio)</label>
                            <textarea
                                value={form.bio}
                                onChange={(e) => handleChange("bio", e.target.value)}
                                placeholder="Napisz kilka słów o sobie, swoich doświadczeniach i stylu życia..."
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-blue-500 min-h-[100px]"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Główny Cel Treningowy</label>
                            <input
                                type="text"
                                value={form.trainingGoal}
                                onChange={(e) => handleChange("trainingGoal", e.target.value)}
                                placeholder="Np. Poprawa wydolności, start w maratonie, zrzucenie 5kg..."
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Odpowiedzi z Wywiadu</label>
                            <textarea
                                value={form.interviewAnswers}
                                onChange={(e) => handleChange("interviewAnswers", e.target.value)}
                                placeholder="Możesz tu skopiować odpowiedz z formularza startowego..."
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-blue-500 min-h-[120px]"
                            />
                        </div>
                    </div>
                </div>

                <div className="rounded-xl bg-slate-900 justify-between">
                    <div className="p-4 border-b border-slate-800">
                        <h2 className="text-lg font-bold">Terminarz Sezonu</h2>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Początek sezonu</label>
                            <input
                                type="date"
                                value={form.seasonStart}
                                onChange={(e) => handleChange("seasonStart", e.target.value)}
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Koniec sezonu</label>
                            <input
                                type="date"
                                value={form.seasonEnd}
                                onChange={(e) => handleChange("seasonEnd", e.target.value)}
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Początek Off-season</label>
                            <input
                                type="date"
                                value={form.offSeasonStart}
                                onChange={(e) => handleChange("offSeasonStart", e.target.value)}
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Koniec Off-season</label>
                            <input
                                type="date"
                                value={form.offSeasonEnd}
                                onChange={(e) => handleChange("offSeasonEnd", e.target.value)}
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
            >
                {mutation.isPending ? "Zapisywanie..." : <><Save className="h-5 w-5" /> Zapisz Profil</>}
            </button>
        </div>
    );
}
