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

type ViewMode = "week" | "month";

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const range = useMemo(() => {
    if (viewMode === "week") {
      // Rolling view: yesterday to next 6 days
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
    <div className="flex flex-col p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Kalendarz</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === "week" ? "month" : "week")}
            className="rounded-lg bg-slate-800 p-2 text-slate-400"
          >
            {viewMode === "week" ? <LayoutGrid className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
          </button>
          <button
            onClick={() => { setSelectedDate(format(new Date(), "yyyy-MM-dd")); setShowForm(true); }}
            className="rounded-lg bg-blue-600 p-2"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="rounded-lg bg-slate-800 p-2">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold capitalize">
          {viewMode === "week"
            ? `${format(range.start, "d MMM", { locale: pl })} – ${format(range.end, "d MMM yyyy", { locale: pl })}`
            : format(currentDate, "LLLL yyyy", { locale: pl })}
        </span>
        <button onClick={() => navigate(1)} className="rounded-lg bg-slate-800 p-2">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day names */}
      {viewMode === "month" && (
        <div className="mb-1 grid grid-cols-7 text-center text-xs text-slate-500">
          {["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
      )}

      {/* Calendar Grid */}
      {viewMode === "week" ? (
        <WeekView days={days} getEventsForDay={getEventsForDay} onDayClick={(d) => { setSelectedDate(format(d, "yyyy-MM-dd")); }} />
      ) : (
        <MonthView days={days} currentDate={currentDate} getEventsForDay={getEventsForDay} onDayClick={(d) => { setSelectedDate(format(d, "yyyy-MM-dd")); }} />
      )}

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
    <div className="space-y-2">
      {days.map((day) => {
        const dayEvents = getEventsForDay(day);
        return (
          <button
            key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors",
              isToday(day) ? "bg-blue-500/10 ring-1 ring-blue-500/30" : "bg-slate-900",
            )}
          >
            <div className="flex w-12 flex-col items-center">
              <span className="text-xs uppercase text-slate-500">
                {format(day, "EEE", { locale: pl })}
              </span>
              <span className={cn("text-lg font-bold", isToday(day) ? "text-blue-400" : "text-slate-200")}>
                {format(day, "d")}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              {dayEvents.length === 0 ? (
                <span className="text-sm text-slate-600">Brak zaplanowanych</span>
              ) : (
                dayEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-2">
                    <div className={cn("h-2 w-2 rounded-full", EVENT_COLORS[ev.eventType] || "bg-slate-500", ev.status === "completed" && "ring-2 ring-green-400")} />
                    <span className={cn("text-sm", ev.status === "cancelled" && "text-slate-600 line-through", ev.status === "completed" && "text-green-400")}>
                      {ev.time && <span className="text-slate-500">{ev.time} </span>}
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
    <div className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const dayEvents = getEventsForDay(day);
        const isCurrentMonth = day.getMonth() === currentDate.getMonth();
        return (
          <button
            key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className={cn(
              "flex min-h-[60px] flex-col items-center rounded-lg p-1 text-xs",
              isCurrentMonth ? "bg-slate-900" : "bg-slate-950 text-slate-700",
              isToday(day) && "ring-1 ring-blue-500",
            )}
          >
            <span className={cn("mb-1", isToday(day) && "font-bold text-blue-400")}>
              {format(day, "d")}
            </span>
            <div className="flex flex-wrap justify-center gap-0.5">
              {dayEvents.map((ev) => (
                <div key={ev.id} className={cn("h-1.5 w-1.5 rounded-full", EVENT_COLORS[ev.eventType] || "bg-slate-500")} />
              ))}
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
    <div className="mt-4 rounded-xl bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">
          {format(new Date(date + "T12:00:00"), "EEEE, d MMMM", { locale: pl })}
        </h3>
        <button onClick={onClose} className="text-slate-500">
          <X className="h-4 w-4" />
        </button>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">Brak wydarzeń</p>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between rounded-lg bg-slate-800 p-3">
              <div className="flex items-center gap-3">
                <div className={cn("h-3 w-3 rounded-full", EVENT_COLORS[ev.eventType])} />
                <div>
                  <p className="text-sm font-medium">{ev.title}</p>
                  <p className="text-xs text-slate-500">
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
                className="text-slate-600 hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onAdd}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 py-2 text-sm text-slate-400"
      >
        <Plus className="h-4 w-4" /> Dodaj wydarzenie
      </button>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-slate-900 p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Nowe wydarzenie</h3>
          <button type="button" onClick={onClose} className="text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Typ</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm"
            >
              {Object.entries(EVENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Nazwa</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={EVENT_LABELS[eventType]}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm placeholder:text-slate-600"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">Data</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">Godzina</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {createMutation.isPending ? "Zapisuję..." : "Dodaj"}
        </button>
      </form>
    </div>
  );
}
