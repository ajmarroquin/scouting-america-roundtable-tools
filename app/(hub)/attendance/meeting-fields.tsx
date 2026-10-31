"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const FORMAT_LABELS: Record<string, string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid",
};

export type MeetingValues = {
  date: string;
  title: string;
  format: "in_person" | "virtual" | "hybrid";
  status: "held" | "cancelled";
  notes: string;
};

export function MeetingFields({
  idPrefix,
  values,
  onChange,
  compact = false,
}: {
  idPrefix: string;
  values: MeetingValues;
  onChange: (v: MeetingValues) => void;
  compact?: boolean;
}) {
  const set = (patch: Partial<MeetingValues>) => onChange({ ...values, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto]">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-date`}>Date</Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          required
          value={values.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-title`}>Topic (optional)</Label>
        <Input
          id={`${idPrefix}-title`}
          placeholder="For example, Popcorn kickoff"
          value={values.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-format`}>Format</Label>
        <Select value={values.format} onValueChange={(format) => set({ format: format as MeetingValues["format"] })}>
          <SelectTrigger id={`${idPrefix}-format`} className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FORMAT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!compact && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-status`}>Status</Label>
            <Select value={values.status} onValueChange={(status) => set({ status: status as MeetingValues["status"] })}>
              <SelectTrigger id={`${idPrefix}-status`} className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="held">Held</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
            <Textarea id={`${idPrefix}-notes`} rows={2} value={values.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}
