"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Picks a scouting year by setting ?year= on the current page. */
export function YearSelect({ years, value }: { years: string[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Select value={value} onValueChange={(y) => router.push(`${pathname}?year=${y}`)}>
      <SelectTrigger aria-label="Scouting year" className="w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y} value={y}>
            {y} scouting year
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
