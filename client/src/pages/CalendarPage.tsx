import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  isSameDay,
  isToday,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
} from "date-fns";
import { pl } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar,
  LayoutGrid,
} from "lucide-react";
import { cn, apiRequest, EVENT_COLORS, EVENT_LABELS } from "@/lib/utils";
import type { CalendarEvent } from "@shared/schema";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type ViewMode = "week" | "month";

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const range = useMemo(() => {
    if (viewMode === "week") {
      const start = addDays(currentDate, -1);
      const end = addDays(currentDate, 6);
      return { start, end };
    }
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return { start, end };
  }, [currentDate, viewMode]);

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: [
      "calendar",
      format(range.start, "yyyy-MM-dd"),
      format(range.end, "yyyy-MM-dd"),
    ],
    queryFn: () =>
      apiRequest(
        `/api/calendar?from=${format(range.start, "yyyy-MM-dd")}&to=${format(range.end, "yyyy-MM-dd")}`,
      ),
  });

  const days = useMemo(() => {
    if (viewMode === "week") {
      return eachDayOfInterval({ start: range.start, end: range.end });
    }
    const monthStart = startOfWeek(range.start, { weekStartsOn: 1 });
    const monthEnd = endOfWeek(range.end, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [range, viewMode]);

  const navigate = (dir: 1 | -1) => {
    if (viewMode === "week") {
      setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else {
      setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    }
  };

  const getEventsForDay = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return events.filter((e) => e.date === dateStr);
  };

  return (
    <div className="flex flex-col flex-1 overflow-y-auto bg-black text-white px-6 py-8 min-h-[100dvh]">
      {/* Header */}
      <div className="mb-8 mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-wide">Kalendarz</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode(viewMode === "week" ? "month" : "week")}
            className="rounded-full border border-white/20 p-3 text-white/50 hover:text-white hover:border-white/40 transition-colors"
          >
            {viewMode === "week"
              ? <LayoutGrid size={18} strokeWidth={1} />
              : <Calendar size={18} strokeWidth={1} />}
          </button>
          <button
            onClick={() => { setSelectedDate(format(new Date(), "yyyy-MM-dd")); setShowForm(true); }}
            className="rounded-full bg-[#6b7cff] text-white p-3 hover:bg-[#5a6bf0] transition-colors"
          >
            <Plus size={18} strokeWidth={1} />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="mb-6 flex items-center justify-between px-1">
        <button onClick={() => navigate(-1)} className="rounded-full border border-white/[0.12] bg-[#111111] p-2.5 hover:border-white/25 transition-colors">
          <ChevronLeft size={18} strokeWidth={1} />
        </button>
        <span className="text-sm font-semibold capitalize tracking-widest text-white/60 uppercase">
          {viewMode === "week"
            ? `${format(range.start, "d MMM", { locale: pl })} – ${format(range.end, "d MMM yyyy", { locale: pl })}`
            : format(currentDate, "LLLL yyyy", { locale: pl })}
        </span>
        <button onClick={() => navigate(1)} className="rounded-full border border-white/[0.12] bg-[#111111] p-2.5 hover:border-white/25 transition-colors">
          <ChevronRight size={18} strokeWidth={1} />
        </button>
      </div>

      {/* Day names */}
      {viewMode === "month" && (
        <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-widest text-white/30">
          {["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
      )}

      {/* Calendar Grid */}
      <div className="pb-32">
        {viewMode === "week" ? (
          <WeekView days={days} getEventsForDay={getEventsForDay} onDayClick={(d) => { setSelectedDate(format(d, "yyyy-MM-dd")); }} />
        ) : (
          <MonthView days={days} currentDate={currentDate} getEventsForDay={getEventsForDay} onDayClick={(d) => { setSelectedDate(format(d, "yyyy-MM-dd")); }} />
        )}
      </div>

      {/* Selected Day Events */}
      {selectedDate && (
        <DayDetail
          date={selectedDate}
          events={events.filter((e) => e.date === selectedDate)}
          onClose={() => setSelectedDate(null)}
          onAdd={() => setShowForm(true)}
        />
      )}

      {/* Add Event Form */}
      {showForm && (
        <EventFormModal
          date={selectedDate || format(new Date(), "yyyy-MM-dd")}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function WeekView({
  days,
  getEventsForDay,
  onDayClick,
}: {
  days: Date[];
  getEventsForDay: (d: Date) => CalendarEvent[];
  onDayClick: (d: Date) => void;
}) {
  return (
    <div className="space-y-3">
      {days.map((day) => {
        const dayEvents = getEventsForDay(day);
        const active = isToday(day);
        return (
          <button
            key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className={cn(
              "flex w-full items-start gap-4 rounded-2xl p-5 text-left transition-colors border",
              active
                ? "bg-[#111111] border-white/25"
                : "bg-[#111111] border-white/[0.08] hover:border-white/20",
            )}
          >
            <div className="flex w-12 flex-col items-center justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">
                {format(day, "EEE", { locale: pl })}
              </span>
              <span className={cn("text-2xl font-light", active ? "text-white" : "text-white/50")}>
                {format(day, "d")}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 pt-1 border-l border-white/[0.08] pl-4">
              {dayEvents.length === 0 ? (
                <span className="text-sm text-white/20 font-light mt-1">Brak zaplanowanych</span>
              ) : (
                dayEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3">
                    <div className={cn("h-1.5 w-1.5 rounded-full", EVENT_COLORS[ev.eventType] || "bg-white/30")} />
                    <span className={cn("text-sm transition-colors", ev.status === "cancelled" && "text-white/20 line-through", ev.status === "completed" && "text-white/60")}>
                      {ev.time && <span className="text-white/30 mr-2">{ev.time}</span>}
                      {ev.title}
                    </span>
                  </div>
                ))
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MonthView({
  days,
  currentDate,
  getEventsForDay,
  onDayClick,
}: {
  days: Date[];
  currentDate: Date;
  getEventsForDay: (d: Date) => CalendarEvent[];
  onDayClick: (d: Date) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => {
        const dayEvents = getEventsForDay(day);
        const isCurrentMonth = day.getMonth() === currentDate.getMonth();
        return (
          <button
            key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className={cn(
              "flex min-h-[64px] flex-col items-center rounded-xl p-2 text-sm border transition-colors",
              isCurrentMonth
                ? "bg-[#111111] border-white/[0.08] hover:border-white/20"
                : "bg-transparent border-transparent opacity-30",
              isToday(day) && "border-white/30",
            )}
          >
            <span className={cn("mb-1 font-light text-sm", isToday(day) ? "font-semibold text-white" : "text-white/40")}>
              {format(day, "d")}
            </span>
            <div className="flex flex-wrap justify-center gap-1 max-w-[80%]">
              {dayEvents.slice(0, 3).map((ev) => (
                <div key={ev.id} className={cn("h-1.5 w-1.5 rounded-full", EVENT_COLORS[ev.eventType] || "bg-white/30")} />
              ))}
              {dayEvents.length > 3 && <div className="h-1 w-1 rounded-full bg-white/20 mt-[1px]" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DayDetail({
  date,
  events,
  onClose,
  onAdd,
}: {
  date: string;
  events: CalendarEvent[];
  onClose: () => void;
  onAdd: () => void;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/calendar/events/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar"] }),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-[32px] sm:rounded-[32px] bg-[#111111] border border-white/[0.12] p-6 pb-safe">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-semibold text-base tracking-wide">
            {format(new Date(date + "T12:00:00"), "EEEE, d MMMM", { locale: pl })}
          </h3>
          <button onClick={onClose} className="rounded-full bg-white/5 border border-white/10 p-2 text-white/40 hover:text-white transition-colors">
            <X size={18} strokeWidth={1} />
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-sm font-light text-white/30 mb-6 px-1">Brak wydarzeń tego dnia.</p>
        ) : (
          <div className="space-y-3 mb-6">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between rounded-2xl bg-black/40 border border-white/[0.08] p-4">
                <div className="flex items-center gap-4">
                  <div className={cn("h-2 w-2 rounded-full", EVENT_COLORS[ev.eventType])} />
                  <div>
                    <p className="text-sm font-medium text-white">{ev.title}</p>
                    <p className="text-[10px] text-white/30 font-light mt-0.5 uppercase tracking-widest">
                      {ev.time && `${ev.time} · `}
                      {EVENT_LABELS[ev.eventType] || ev.eventType}
                      {ev.status !== "planned" && ` · ${ev.status}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm("Czy na pewno chcesz usunąć to wydarzenie?")) {
                      deleteMutation.mutate(ev.id);
                    }
                  }}
                  className="rounded-full p-2 text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <X size={16} strokeWidth={1} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => { onClose(); onAdd(); }}
          className="w-full rounded-full border border-dashed border-white/20 py-3 text-sm font-semibold text-white/50 hover:border-white/40 hover:text-white/80 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} strokeWidth={1} /> Dodaj wydarzenie
        </button>
      </div>
    </div>
  );
}

function EventFormModal({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("gym");
  const [time, setTime] = useState("");
  const [eventDate, setEventDate] = useState(date);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("/api/calendar/events", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      date: eventDate,
      time: time || null,
      eventType,
      title: title || EVENT_LABELS[eventType],
      source: "manual",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-[32px] sm:rounded-[32px] bg-[#111111] border border-white/[0.12] p-6 pb-safe"
      >
        <div className="mb-8 flex items-center justify-between">
          <h3 className="font-semibold text-base tracking-wide text-white">Nowe wydarzenie</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-white/5 border border-white/10 p-2 text-white/40 hover:text-white transition-colors">
            <X size={18} strokeWidth={1} />
          </button>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold tracking-widest text-white/40 uppercase">Typ</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="flex h-14 w-full rounded-2xl border border-white/[0.15] bg-[#111111] px-4 text-base text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              {Object.entries(EVENT_LABELS).map(([key, label]) => (
                <option key={key} value={key} className="bg-[#111111]">{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold tracking-widest text-white/40 uppercase">Nazwa</label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={EVENT_LABELS[eventType]}
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <label className="block text-[11px] font-semibold tracking-widest text-white/40 uppercase">Data</label>
              <Input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="[color-scheme:dark]"
              />
            </div>
            <div className="flex-1 space-y-2">
              <label className="block text-[11px] font-semibold tracking-widest text-white/40 uppercase">Godzina</label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="[color-scheme:dark]"
              />
            </div>
          </div>
        </div>

        <div className="mt-10 mb-2">
          <Button
            type="submit"
            variant="primary"
            disabled={createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? "Zapisuję..." : "Dodaj wydarzenie"}
          </Button>
        </div>
      </form>
    </div>
  );
}
