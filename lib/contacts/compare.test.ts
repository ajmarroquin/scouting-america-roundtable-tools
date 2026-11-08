import { describe, expect, it } from "vitest";
import { type CompareCandidate, cellText, compareToContacts, phoneDigits, readList } from "./compare";

const contact = (over: Partial<CompareCandidate> & { id: string; firstName: string; lastName: string }): CompareCandidate => ({
  preferredName: null,
  email: null,
  altEmail: null,
  phone: null,
  ...over,
});

const people = [
  contact({ id: "alex", firstName: "Alexander", lastName: "Example", email: "alex@example.org", phone: "(212) 555-0101" }),
  contact({ id: "pat", firstName: "Pat", lastName: "Testcase", email: "family@example.org" }),
  contact({ id: "sam", firstName: "Sam", lastName: "Testcase", email: "family@example.org" }),
  contact({ id: "jo1", firstName: "Jordan", lastName: "Smith" }),
  contact({ id: "jo2", firstName: "Jordan", lastName: "Smith", altEmail: "jordan.smith@example.org" }),
  contact({ id: "lee", firstName: "Lee", lastName: "Nguyen", email: "lee@work.example.org" }),
];

const person = (firstName: string, lastName: string, email = "", phone = "") => ({ firstName, lastName, suffix: "", email, phone });

describe("readList", () => {
  it("finds the header row and the columns the district sends", () => {
    const list = readList([
      ["District volunteers, Nov 2026"],
      ["First Name", "Last Name", "Suffix", "Email", "Phone (Home/Mobile)"],
      ["ALEX", "EXAMPLE", "", "Alex@Example.org", "2125550101"],
      ["Jordan", "Smith", "Jr.", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "orphan@example.org", ""],
    ]);
    expect(list).toEqual({
      people: [
        { firstName: "Alex", lastName: "Example", suffix: "", email: "alex@example.org", phone: "2125550101" },
        { firstName: "Jordan", lastName: "Smith", suffix: "Jr.", email: "", phone: "" },
      ],
      used: ["First Name", "Last Name", "Suffix", "Email", "Phone (Home/Mobile)"],
      skipped: 1,
    });
  });

  it("splits one Name column, either way round", () => {
    const list = readList([["Name", "E-mail"], ["Smith, Jane", "jane@example.org"], ["Mary Ann Lee", ""]]);
    expect("people" in list && list.people.map((p) => [p.firstName, p.lastName])).toEqual([
      ["Jane", "Smith"],
      ["Mary Ann", "Lee"],
    ]);
  });

  it("says what's missing", () => {
    expect(readList([["Email", "Phone"], ["a@example.org", "1"]])).toEqual({ error: expect.stringContaining("Couldn't find name columns") });
    expect(readList([["First Name", "Last Name"]])).toEqual({ error: expect.stringContaining("no names") });
  });
});

describe("cellText", () => {
  it("reads the kinds of cells Excel files hold", () => {
    expect(cellText(" Jane ")).toBe("Jane");
    expect(cellText(2125550101)).toBe("2125550101");
    expect(cellText({ text: "jane@example.org", hyperlink: "mailto:jane@example.org" })).toBe("jane@example.org");
    expect(cellText({ richText: [{ text: "Ja" }, { text: "ne" }] })).toBe("Jane");
    expect(cellText({ formula: "A1", result: "Jane" })).toBe("Jane");
    expect(cellText(null)).toBe("");
  });
});

describe("compareToContacts", () => {
  it("matches on email and name, even with a nickname", () => {
    const r = compareToContacts(person("Alex", "Example", "ALEX@example.org"), people);
    expect(r.status).toBe("matched");
    expect(r.candidates[0]).toMatchObject({ id: "alex", reason: "same email, nickname, same last name" });
  });

  it("matches on phone and name, whatever the formatting", () => {
    expect(phoneDigits("+1 (212) 555-0101")).toBe(phoneDigits("2125550101"));
    const r = compareToContacts(person("Alexander", "Example", "", "+1 212.555.0101"), people);
    expect(r).toMatchObject({ status: "matched", candidates: [{ id: "alex" }] });
  });

  it("never matches a shared family email to a different name", () => {
    const r = compareToContacts(person("Chris", "Testcase", "family@example.org"), people);
    expect(r.status).toBe("review");
    expect(r.candidates[0].reason).toContain("same email but a different name");
  });

  it("uses the email to tell two people with the same name apart", () => {
    expect(compareToContacts(person("Jordan", "Smith"), people).status).toBe("review");
    const r = compareToContacts(person("Jordan", "Smith", "jordan.smith@example.org"), people);
    expect(r.status).toBe("matched");
    expect(r.candidates.map((c) => c.id)).toEqual(["jo2", "jo1"]);
  });

  it("matches a unique name and notes when the email differs", () => {
    const r = compareToContacts(person("Lee", "Nguyen", "lee@home.example.org"), people);
    expect(r.status).toBe("matched");
    expect(r.candidates[0].reason).toBe("same name; the email is different");
  });

  it("knows common nicknames", () => {
    const withJason = [...people, contact({ id: "jason", firstName: "Jason", lastName: "Achebe", email: "jason@example.org" })];
    expect(compareToContacts(person("Jay", "Achebe", "jay@home.example.org"), withJason)).toMatchObject({
      status: "matched",
      candidates: [{ id: "jason", reason: "nickname, same last name; the email is different" }],
    });
  });

  it("ignores a suffix typed into the last name", () => {
    expect(compareToContacts(person("Lee", "Nguyen Jr."), people)).toMatchObject({ status: "matched", candidates: [{ id: "lee" }] });
  });

  it("finds nobody for someone new", () => {
    expect(compareToContacts(person("Morgan", "Rivers", "morgan@example.org"), people)).toEqual({ status: "none", candidates: [] });
  });
});
