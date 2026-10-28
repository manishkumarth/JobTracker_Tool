import test from "node:test";
import assert from "node:assert/strict";
import {
  matchResumeForJob,
  validateResumeForJob,
  describeResumeMatches,
  scoreResume,
} from "../utils/resumeMatcher.js";

const resumes = [
  { _id: "r-full", originalName: "manishkumar.fullstack.pdf", notes: "Full Stack Developer", isDefault: true },
  { _id: "r-react", originalName: "manishkumar.react.pdf", notes: "React Developer, Frontend Developer", isDefault: false },
  { _id: "r-node", originalName: "manishkumar.node.pdf", notes: "Node.js Developer, Backend Developer", isDefault: false },
];

test("picks the Full Stack resume for a full stack job title", () => {
  const match = matchResumeForJob({ resumes, jobTitle: "Senior Full Stack Developer" });
  assert.equal(match.matched, true);
  assert.equal(match.resumeId, "r-full");
  assert.equal(match.resume.originalName, "manishkumar.fullstack.pdf");
});

test("picks the Node resume for a Node.js job title", () => {
  const match = matchResumeForJob({ resumes, jobTitle: "Node.js Developer" });
  assert.equal(match.matched, true);
  assert.equal(match.resumeId, "r-node");
});

test("picks the React resume for a React job title", () => {
  const match = matchResumeForJob({ resumes, jobTitle: "React Developer" });
  assert.equal(match.matched, true);
  assert.equal(match.resumeId, "r-react");
});

test("does not send when no resume note matches the job title", () => {
  const match = matchResumeForJob({ resumes, jobTitle: "Java Spring Boot Developer" });
  assert.equal(match.matched, false);
  assert.equal(match.resume, null);
  assert.equal(match.resumeId, null);
  assert.equal(match.reason, "no_matching_resume");
});

test("never falls back to the default resume when nothing matches", () => {
  const defaultOnly = [
    { _id: "default", originalName: "default.pdf", notes: "React Developer", isDefault: true },
    { _id: "other", originalName: "other.pdf", notes: "Node Developer", isDefault: false },
  ];
  const match = matchResumeForJob({ resumes: defaultOnly, jobTitle: "Data Scientist" });
  assert.equal(match.matched, false);
  assert.equal(match.resume, null);
});

test("returns no_resume_notes when every resume is missing notes", () => {
  const noNotes = [
    { _id: "a", originalName: "a.pdf", notes: "" },
    { _id: "b", originalName: "b.pdf", notes: "   " },
  ];
  const match = matchResumeForJob({ resumes: noNotes, jobTitle: "React Developer" });
  assert.equal(match.matched, false);
  assert.equal(match.reason, "no_resume_notes");
});

test("matches on resume notes only, not the file name", () => {
  const misleading = [
    { _id: "m", originalName: "manishkumar.fullstack.pdf", notes: "React Developer" },
  ];
  const match = matchResumeForJob({ resumes: misleading, jobTitle: "Full Stack Developer" });
  assert.equal(match.matched, false);
});

test("returns no_resumes when the user has no resumes", () => {
  const match = matchResumeForJob({ resumes: [], jobTitle: "React Developer" });
  assert.equal(match.matched, false);
  assert.equal(match.reason, "no_resumes");
});

test("normalizes fullstack / reactjs / node.js aliases", () => {
  const mixed = [
    { _id: "fs", originalName: "fs.pdf", notes: "Fullstack Engineer" },
    { _id: "rx", originalName: "rx.pdf", notes: "ReactJS Developer" },
    { _id: "nd", originalName: "nd.pdf", notes: "Node.js Developer" },
  ];
  assert.equal(matchResumeForJob({ resumes: mixed, jobTitle: "Full Stack Developer" }).resumeId, "fs");
  assert.equal(matchResumeForJob({ resumes: mixed, jobTitle: "React.js Developer" }).resumeId, "rx");
  assert.equal(matchResumeForJob({ resumes: mixed, jobTitle: "Node Developer" }).resumeId, "nd");
});

test("Java does not match JavaScript (word boundaries)", () => {
  const js = [{ _id: "js", originalName: "js.pdf", notes: "JavaScript Developer" }];
  const match = matchResumeForJob({ resumes: js, jobTitle: "Java Developer" });
  assert.equal(match.matched, false);
});

test("generic words like developer alone do not create a match", () => {
  const generic = [{ _id: "g", originalName: "g.pdf", notes: "Developer" }];
  const match = matchResumeForJob({ resumes: generic, jobTitle: "Python Developer" });
  assert.equal(match.matched, false);
});

test("a full role phrase scores higher than a single shared keyword", () => {
  const phrase = scoreResume({ notes: "Full Stack Developer" }, "Senior Full Stack Developer");
  const single = scoreResume({ notes: "React Developer" }, "Senior Full Stack Developer");
  assert.ok(phrase.score > single.score);
});

test("validates a specific resume id against the job title", () => {
  const valid = validateResumeForJob({ resumes, resumeId: "r-node", jobTitle: "Node.js Developer" });
  assert.equal(valid.valid, true);

  const invalid = validateResumeForJob({ resumes, resumeId: "r-full", jobTitle: "Node.js Developer" });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.matched, true);
  assert.equal(invalid.resumeId, "r-node");
});

test("describeResumeMatches explains every resume without leaking URLs", () => {
  const described = describeResumeMatches({ resumes, jobTitle: "React Developer" });
  assert.equal(described.length, 3);
  const react = described.find((r) => r._id === "r-react");
  assert.equal(react.matched, true);
  assert.equal(described.find((r) => r._id === "r-node").matched, false);
  assert.equal("cloudinaryUrl" in described[0], false);
});
