import test from "node:test";
import assert from "node:assert/strict";
import { buildFallbackApplicationEmail } from "../utils/emailWriter.js";

const profile = {
  name: "Asha Verma",
  professionalTitle: "Frontend Developer",
  experience: "4 years",
  skills: ["React", "TypeScript", "Node.js", "MongoDB", "CSS", "Extra"],
  email: "asha@example.com",
  phone: "+91 90000 00000",
  linkedin: "https://linkedin.com/in/asha",
};

const application = {
  jobTitle: "Senior Frontend Developer",
  companyName: "Acme Corp",
  hrName: "Rahul",
};

test("fallback email greets the recruiter and names the role/company", () => {
  const { subject, body } = buildFallbackApplicationEmail({ profile, application });
  assert.match(subject, /Senior Frontend Developer/);
  assert.match(subject, /Acme Corp/);
  assert.match(body, /^Dear Rahul,/);
  assert.match(body, /Senior Frontend Developer position at Acme Corp/);
});

test("fallback email uses a generic greeting when no recruiter name exists", () => {
  const { body } = buildFallbackApplicationEmail({
    profile,
    application: { ...application, hrName: "" },
  });
  assert.match(body, /^Dear Hiring Team,/);
});

test("fallback email only mentions listed facts and caps skills", () => {
  const { body } = buildFallbackApplicationEmail({ profile, application });
  assert.match(body, /React/);
  assert.ok(!body.includes("Extra"), "should only list the first five skills");
  assert.match(body, /4 years/);
  assert.match(body, /Email: asha@example\.com/);
  assert.match(body, /https:\/\/linkedin\.com\/in\/asha/);
});

test("fallback email works with an almost-empty profile", () => {
  const { subject, body } = buildFallbackApplicationEmail({
    profile: { name: "" },
    application: { jobTitle: "Developer" },
  });
  assert.equal(subject.startsWith("Application for Developer"), true);
  assert.match(body, /^Dear Hiring Team,/);
  assert.ok(body.includes("Candidate"), "signature falls back to a neutral name");
});
