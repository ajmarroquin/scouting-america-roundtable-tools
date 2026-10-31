import { describe, expect, it } from "vitest";
import { searchPeople, type Searchable } from "./search";

const person = (id: string, firstName: string, lastName: string, extra: Partial<Searchable> = {}): Searchable => ({
  id,
  name: `${extra.preferredName ?? firstName} ${lastName}`,
  firstName,
  lastName,
  preferredName: null,
  email: `${id}@example.com`,
  units: [],
  ...extra,
});

const people = [
  person("1", "James", "Placeholder", { preferredName: "Jim", units: ["Crew 205"] }),
  person("2", "Alex", "Jimenez", { units: ["Troop 101 B"] }),
  person("3", "Benjamin", "Sample", { units: ["Troop 101 G"] }),
  person("4", "José", "Example"),
];

describe("searchPeople", () => {
  it("finds by preferred name and ranks name starts first", () => {
    expect(searchPeople(people, "jim").map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("needs every word, across names and units", () => {
    expect(searchPeople(people, "troop 101").map((p) => p.id)).toEqual(["2", "3"]);
    expect(searchPeople(people, "sample 101 g").map((p) => p.id)).toEqual(["3"]);
  });

  it("ignores accents and case, and returns nothing for an empty query", () => {
    expect(searchPeople(people, "JOSE").map((p) => p.id)).toEqual(["4"]);
    expect(searchPeople(people, "   ")).toEqual([]);
  });

  it("caps the list", () => {
    expect(searchPeople(people, "e", 2)).toHaveLength(2);
  });
});
