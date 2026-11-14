import test from "node:test";
import assert from "node:assert/strict";
import {
  matchResumeForJob,
  validateResumeForJob,
  describeResumeMatches,
  scoreResume,
  parseExperienceRange,
  extractExperienceFromText,
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

test("parseExperienceRange understands ranges, decimals and plus syntax", () => {
  assert.deepEqual(parseExperienceRange("3-5 years"), { min: 3, max: 5, mid: 4 });
  assert.deepEqual(parseExperienceRange("2.4 Years"), { min: 2.4, max: 2.4, mid: 2.4 });
  assert.deepEqual(parseExperienceRange("1 – 2 yrs"), { min: 1, max: 2, mid: 1.5 });
  assert.deepEqual(parseExperienceRange("2 to 2.5 years"), { min: 2, max: 2.5, mid: 2.25 });
  assert.deepEqual(parseExperienceRange("5+ years"), { min: 5, max: null, mid: 5 });
  assert.equal(parseExperienceRange(""), null);
});

test("experience range decides between resumes with the same role notes", () => {
  const ranged = [
    { _id: "junior", originalName: "junior.pdf", notes: "Full Stack Developer", experienceMin: 1, experienceMax: 2 },
    { _id: "senior", originalName: "senior.pdf", notes: "Full Stack Developer", experienceMin: 3, experienceMax: 5 },
  ];

  const seniorJob = matchResumeForJob({
    resumes: ranged,
    jobTitle: "Full Stack Developer",
    jobExperience: "3-5 Years",
  });
  assert.equal(seniorJob.resumeId, "senior");
  assert.equal(seniorJob.experienceMatch, "match");

  const juniorJob = matchResumeForJob({
    resumes: ranged,
    jobTitle: "Full Stack Developer",
    jobExperience: "1-2 Years",
  });
  assert.equal(juniorJob.resumeId, "junior");
});

test("decimal experience requirements are compared numerically, not with parseFloat", () => {
  const resumesWithRange = [
    { _id: "low", originalName: "low.pdf", notes: "React Developer", experienceMin: 0, experienceMax: 1.5 },
    { _id: "high", originalName: "high.pdf", notes: "React Developer", experienceMin: 2, experienceMax: 2.5 },
  ];

  const match = matchResumeForJob({
    resumes: resumesWithRange,
    jobTitle: "React Developer",
    jobExperience: "2 - 2.5 years",
  });

  assert.equal(match.resumeId, "high");
  const low = scoreResume(resumesWithRange[0], "React Developer", "2 - 2.5 years");
  const high = scoreResume(resumesWithRange[1], "React Developer", "2 - 2.5 years");
  assert.equal(low.experienceMatch, "mismatch");
  assert.equal(high.experienceMatch, "match");
  assert.ok(high.score > low.score);
});

test("experience is extracted from a job description without picking unrelated numbers", () => {  const description =
    "We need a Full Stack Developer with 3–5 years of experience. Bachelor's degree with minimum 60% aggregate marks required.";
  assert.equal(extractExperienceFromText(description), "3–5 years");
  assert.equal(extractExperienceFromText("Salary 12 LPA, 2+ years experience needed"), "2+ years");
  assert.equal(extractExperienceFromText("Minimum of 2.5 years experience in React"), "Minimum of 2.5 years");
  assert.equal(extractExperienceFromText("No experience number here, just 60% marks."), null);

  const match = matchResumeForJob({
    resumes: [
      { _id: "a", originalName: "a.pdf", notes: "Full Stack Developer", experienceMin: 1, experienceMax: 2 },
      { _id: "b", originalName: "b.pdf", notes: "Full Stack Developer", experienceMin: 3, experienceMax: 5 },
    ],
    jobTitle: "Full Stack Developer",
    jobExperience: extractExperienceFromText(description),
  });
  assert.equal(match.resumeId, "b");
});

test("closest experience range wins when no range overlaps the job requirement", () => {
  const match = matchResumeForJob({
    resumes: [
      { _id: "junior", originalName: "junior.pdf", notes: "Full Stack Developer", experienceMin: 1, experienceMax: 2 },
      { _id: "mid", originalName: "mid.pdf", notes: "Full Stack Developer", experienceMin: 2, experienceMax: 2.5 },
    ],
    jobTitle: "Full Stack Developer (Frontend Focused) | 3-5 Years",
    jobExperience: "3-5 Years",
  });

  assert.equal(match.matched, true);
  assert.equal(match.resumeId, "mid");
  assert.equal(match.experienceMatch, "mismatch");
});
