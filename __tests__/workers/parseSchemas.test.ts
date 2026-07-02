import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Tests for the Zod validation schemas used by the parsing workers.
 *
 * These schemas gate the LLM output — if the LLM returns something
 * malformed, the schema rejects it and the worker retries. These
 * tests verify edge cases and error messages.
 */

// ── Resume Parse Schema (mirrored from parseResume.ts) ──────────

const ResumeParseResultSchema = z.object({
  skills: z.array(z.string()).min(1, "At least one skill expected"),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      duration: z.string(),
      description: z.string().default(""),
    })
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.string(),
    })
  ),
  seniority_signal: z.enum(["junior", "mid", "senior", "lead"]),
});

// ── JD Parse Schema (mirrored from parseJD.ts) ──────────────────

const JDParseResultSchema = z.object({
  role: z.string().min(1, "Role title is required"),
  seniority: z.enum(["junior", "mid", "senior", "lead", "staff"]),
  requiredSkills: z.array(z.string()).min(1, "At least one required skill expected"),
  niceToHave: z.array(z.string()),
});

// ── Resume Tests ─────────────────────────────────────────────────

describe("ResumeParseResultSchema", () => {
  it("accepts a valid resume parse result", () => {
    const validResult = {
      skills: ["TypeScript", "React", "Node.js", "MongoDB"],
      experience: [
        {
          title: "Senior Frontend Engineer",
          company: "TechCorp",
          duration: "2020 - Present",
          description: "Led frontend architecture",
        },
      ],
      education: [
        {
          degree: "B.S. Computer Science",
          institution: "MIT",
          year: "2018",
        },
      ],
      seniority_signal: "senior",
    };

    const result = ResumeParseResultSchema.parse(validResult);
    expect(result.skills).toHaveLength(4);
    expect(result.seniority_signal).toBe("senior");
  });

  it("rejects when skills array is empty", () => {
    const invalidResult = {
      skills: [],
      experience: [],
      education: [],
      seniority_signal: "junior",
    };

    expect(() => ResumeParseResultSchema.parse(invalidResult)).toThrow();
  });

  it("rejects invalid seniority_signal value", () => {
    const invalidResult = {
      skills: ["JavaScript"],
      experience: [],
      education: [],
      seniority_signal: "intern", // Not in enum
    };

    expect(() => ResumeParseResultSchema.parse(invalidResult)).toThrow();
  });

  it("defaults description to empty string if missing", () => {
    const result = ResumeParseResultSchema.parse({
      skills: ["Python"],
      experience: [
        {
          title: "Developer",
          company: "StartupCo",
          duration: "1 year",
          // description omitted
        },
      ],
      education: [],
      seniority_signal: "junior",
    });

    expect(result.experience[0].description).toBe("");
  });

  it("handles LLM returning extra fields gracefully (strips them)", () => {
    const withExtras = {
      skills: ["Go"],
      experience: [],
      education: [],
      seniority_signal: "mid",
      confidence: 0.95, // extra field
      raw_analysis: "blah", // extra field
    };

    const result = ResumeParseResultSchema.parse(withExtras);
    expect(result).not.toHaveProperty("confidence");
    expect(result).not.toHaveProperty("raw_analysis");
  });
});

// ── JD Tests ─────────────────────────────────────────────────────

describe("JDParseResultSchema", () => {
  it("accepts a valid JD parse result", () => {
    const validResult = {
      role: "Senior Data Scientist",
      seniority: "senior",
      requiredSkills: ["Python", "SQL", "Machine Learning", "Statistics"],
      niceToHave: ["Spark", "Kubernetes"],
    };

    const result = JDParseResultSchema.parse(validResult);
    expect(result.role).toBe("Senior Data Scientist");
    expect(result.requiredSkills).toHaveLength(4);
  });

  it("rejects empty role", () => {
    const invalidResult = {
      role: "",
      seniority: "mid",
      requiredSkills: ["JavaScript"],
      niceToHave: [],
    };

    expect(() => JDParseResultSchema.parse(invalidResult)).toThrow();
  });

  it("rejects when requiredSkills is empty", () => {
    const invalidResult = {
      role: "Developer",
      seniority: "junior",
      requiredSkills: [],
      niceToHave: [],
    };

    expect(() => JDParseResultSchema.parse(invalidResult)).toThrow();
  });

  it("accepts empty niceToHave array", () => {
    const result = JDParseResultSchema.parse({
      role: "Backend Engineer",
      seniority: "mid",
      requiredSkills: ["Node.js"],
      niceToHave: [],
    });

    expect(result.niceToHave).toEqual([]);
  });

  it("accepts staff seniority level", () => {
    const result = JDParseResultSchema.parse({
      role: "Staff Engineer",
      seniority: "staff",
      requiredSkills: ["System Design"],
      niceToHave: [],
    });

    expect(result.seniority).toBe("staff");
  });
});

// ── JSON parsing edge cases ──────────────────────────────────────

describe("LLM response JSON parsing", () => {
  it("handles JSON with markdown code fences (common LLM mistake)", () => {
    const llmResponse = '```json\n{"role":"Dev","seniority":"mid","requiredSkills":["JS"],"niceToHave":[]}\n```';

    // Strip code fences — this is what the worker should do
    const cleaned = llmResponse
      .replace(/^```(?:json)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "");

    const parsed = JDParseResultSchema.parse(JSON.parse(cleaned));
    expect(parsed.role).toBe("Dev");
  });

  it("rejects completely invalid JSON", () => {
    const llmResponse = "I'm sorry, I can't parse that resume.";

    expect(() => JSON.parse(llmResponse)).toThrow();
  });
});
