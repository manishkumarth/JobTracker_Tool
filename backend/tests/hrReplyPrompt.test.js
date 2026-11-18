import test from "node:test";
import assert from "node:assert/strict";
import { requestedDetailsBlock, detectRequestedDetails } from "../utils/candidatePrompt.js";

const profile = {
  name: "Manish Kumar",
  email: "manish@example.com",
  phone: "+919798293519",
  location: "Noida",
  currentCompany: "Acaddian Technology",
  currentCTC: "3 LPA",
  expectedCTC: "4.5 LPA",
  noticePeriod: "30 days",
  experience: "2.5 years",
  education: "BCA, Manipal University Jaipur",
  linkedin: "https://linkedin.com/in/x",
  github: "https://github.com/x",
  portfolio: "https://portfolio.example.com",
};

test("CTC and notice period asked by HR are filled from the profile", () => {
  const request = "Please share your current CTC, expected CTC and notice period.";
  const block = requestedDetailsBlock(profile, request);

  assert.match(block, /Current CTC: 3 LPA/);
  assert.match(block, /Expected CTC: 4\.5 LPA/);
  assert.match(block, /Notice period: 30 days/);
  assert.match(block, /answer EVERY line/i);
});

test("a request that never mentions CTC or notice period adds no salary checklist", () => {
  const block = requestedDetailsBlock(profile, "Are you available for an interview on Monday?");
  assert.equal(block, "");
  assert.deepEqual(detectRequestedDetails("Are you available for an interview on Monday?"), []);
});

test("missing profile values are flagged instead of invented", () => {
  const block = requestedDetailsBlock({ ...profile, noticePeriod: "" }, "What is your notice period?");
  assert.match(block, /Notice period: NOT PROVIDED/);
  assert.doesNotMatch(block, /30 days/);
});

test("common recruiter phrasings are detected", () => {
  assert.deepEqual(detectRequestedDetails("How soon can you join us?"), ["Notice period"]);
  assert.deepEqual(detectRequestedDetails("What is your current salary and expected salary?"), [
    "Current CTC",
    "Expected CTC",
  ]);
  assert.deepEqual(detectRequestedDetails("How many years of experience do you have?"), [
    "Total experience",
  ]);
  assert.deepEqual(detectRequestedDetails("Where are you currently located? Are you open to relocation?"), [
    "Current location",
  ]);
  assert.deepEqual(detectRequestedDetails("Which company are you currently working with?"), [
    "Current company",
  ]);
  assert.deepEqual(detectRequestedDetails("Please share your qualification and degree details."), [
    "Education",
  ]);
});

test("multiple requested details are listed in a stable, readable order", () => {
  const block = requestedDetailsBlock(
    profile,
    "Share your current CTC, expected CTC, notice period, total experience and current company."
  );
  const labels = block
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).split(":")[0]);

  assert.deepEqual(labels, [
    "Current CTC",
    "Expected CTC",
    "Notice period",
    "Total experience",
    "Current company",
  ]);
});
