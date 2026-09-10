const SKILL_KEYWORDS = [
  "javascript", "typescript", "python", "java", "c++", "c#", "go", "rust", "ruby", "php",
  "react", "vue", "angular", "svelte", "next.js", "nuxt", "node.js", "express", "django",
  "flask", "spring", "spring boot", "laravel", "rails", "asp.net", "fastapi",
  "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible", "jenkins", "gitlab ci", "github actions",
  "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "dynamodb", "cassandra",
  "graphql", "rest", "grpc", "microservices", "serverless", "event-driven",
  "html", "css", "sass", "tailwind", "bootstrap", "webpack", "vite", "rollup",
  "testing", "jest", "vitest", "cypress", "playwright", "selenium", "junit",
  "git", "github", "gitlab", "bitbucket", "jira", "confluence", "agile", "scrum", "kanban",
  "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy",
  "data analysis", "data visualization", "tableau", "power bi", "looker",
  "ci/cd", "devops", "site reliability", "sre", "monitoring", "logging", "prometheus", "grafana",
  "system design", "architecture", "design patterns", "clean code", "tdd", "bdd",
  "communication", "leadership", "mentoring", "project management", "product management",
];

const EXPERIENCE_PATTERNS = [
  /(\d+)\+?\s*years?\s*(?:of\s*)?experience/gi,
  /experience\s*:?\s*(\d+)\+?\s*years?/gi,
  /worked\s+(?:as|at)\s+.*?(\d+)\+?\s*years?/gi,
];

const EDUCATION_KEYWORDS = [
  "bachelor", "master", "phd", "doctorate", "b.sc", "m.sc", "b.tech", "m.tech",
  "b.e.", "m.e.", "b.s.", "m.s.", "b.a.", "m.a.", "degree", "university", "college",
];

export const parseResumeFromBuffer = async (dataBuffer) => {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";

    const data = new Uint8Array(dataBuffer);
    const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + "\n";
    }

    const skills = extractSkills(text);
    const experience = extractExperience(text);
    const education = extractEducation(text);
    const projects = extractProjects(text);
    const professionalTitle = extractProfessionalTitle(text);

    return {
      skills,
      experience,
      education,
      projects,
      professionalTitle,
      rawText: text,
    };
  } catch (err) {
    throw new Error(`Failed to parse resume: ${err.message}`);
  }
};

const extractSkills = (text) => {
  const found = new Set();
  const lowerText = text.toLowerCase();

  for (const skill of SKILL_KEYWORDS) {
    const regex = new RegExp(`\\b${skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (regex.test(lowerText)) {
      found.add(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  }

  const skillSection = text.match(/(?:skills|technologies|tech stack|expertise)[\s:]*([\s\S]{0,500})/i);
  if (skillSection) {
    const sectionText = skillSection[1];
    const tokens = sectionText.split(/[,;\n•\-]/).map((t) => t.trim()).filter((t) => t.length > 1 && t.length < 30);
    for (const token of tokens) {
      if (/^[a-zA-Z][a-zA-Z0-9+#.\- ]+$/.test(token)) {
        found.add(token.charAt(0).toUpperCase() + token.slice(1).toLowerCase());
      }
    }
  }

  return Array.from(found).slice(0, 30);
};

const extractExperience = (text) => {
  for (const pattern of EXPERIENCE_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      const years = Math.max(...matches.map((m) => parseInt(m[1], 10)));
      return `${years}+ years`;
    }
  }

  const expSection = text.match(/(?:experience|work history|employment)[\s:]*([\s\S]{0,1000})/i);
  if (expSection) {
    const sectionText = expSection[1];
    const yearMatches = sectionText.match(/\b(20\d{2}|19\d{2})\b/g);
    if (yearMatches && yearMatches.length >= 2) {
      const years = yearMatches.map((y) => parseInt(y, 10)).sort((a, b) => a - b);
      const span = years[years.length - 1] - years[0];
      if (span > 0) return `${span}+ years`;
    }
  }

  return "Not specified";
};

const extractEducation = (text) => {
  const lines = text.split("\n");
  const educationLines = lines.filter((line) =>
    EDUCATION_KEYWORDS.some((kw) => line.toLowerCase().includes(kw))
  );
  return educationLines.slice(0, 5).join("; ") || "Not specified";
};

const extractProjects = (text) => {
  const projectSection = text.match(/(?:projects|personal projects|key projects)[\s:]*([\s\S]{0,1000})/i);
  if (projectSection) {
    const sectionText = projectSection[1];
    const lines = sectionText.split("\n").map((l) => l.trim()).filter((l) => l.length > 10);
    return lines.slice(0, 5).join("; ");
  }
  return "Not specified";
};

const extractProfessionalTitle = (text) => {
  const lines = text.split("\n").slice(0, 10);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 5 && trimmed.length < 60 && /[A-Z]/.test(trimmed)) {
      const titleKeywords = ["engineer", "developer", "architect", "lead", "manager", "director", "analyst", "consultant", "specialist"];
      if (titleKeywords.some((kw) => trimmed.toLowerCase().includes(kw))) {
        return trimmed;
      }
    }
  }
  return "Not specified";
};