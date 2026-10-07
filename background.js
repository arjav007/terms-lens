const ATLAS_ENDPOINT = "ai.mongodb.com"; 
const ATLAS_API_KEY = "al-k3v1QCJqALc7TXi52UaPqRXAljGLrsiVCH5DH2kQIc0";
const DATABASE_NAME = "TermsLens";
const COLLECTION_NAME = "domains";

// Risk keywords dictionary for fast clause analysis
const RISK_TAXONOMY = {
  highRisk: [
    { pattern: /waive.*class action|arbitration/i, category: "Legal Rights", summary: "Forces mandatory arbitration and waives class action lawsuits." },
    { pattern: /sell.*data|share.*third-party advertisers/i, category: "Data Privacy", summary: "Allows selling or sharing your personal data with third-party advertisers." },
    { pattern: /retain.*indefinitely|store.*forever/i, category: "Data Retention", summary: "Retains your personal data indefinitely even after account deletion." }
  ],
  mediumRisk: [
    { pattern: /track.*location|gps.*monitoring/i, category: "Tracking", summary: "Tracks background geolocation data." },
    { pattern: /terminate.*without notice|suspend.*at any time/i, category: "Account Control", summary: "Reserves the right to terminate your account without prior notice." }
  ],
  safe: [
    { pattern: /delete.*upon request|gdpr compliant/i, category: "Privacy Friendly", summary: "Allows full account and data deletion upon request." },
    { pattern: /do not sell|never share/i, category: "Data Privacy", summary: "Explicitly commits to not selling user personal data." }
  ]
};

// Listen for messages from content.js or popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_TEXT") {
    handleTextAnalysis(request.domain, request.text).then(sendResponse);
    return true; // Keep message channel open for async response
  }
});

async function handleTextAnalysis(domain, fullText) {
  // 1. Try fetching existing pre-analyzed domain metrics from MongoDB Atlas
  try {
    const cachedData = await fetchFromMongoDB(domain);
    if (cachedData && cachedData.document) {
      return { success: true, source: "database", data: cachedData.document };
    }
  } catch (err) {
    console.warn("MongoDB fetch skipped or failed, falling back to local analysis:", err);
  }

  // 2. Local Real-Time Clause Classification
  const analysisResult = analyzeTextLocally(fullText);
  return { success: true, source: "local", data: analysisResult };
}

// Fetch domain report using MongoDB Atlas Data API
async function fetchFromMongoDB(domain) {
  const response = await fetch(`${ATLAS_ENDPOINT}/action/findOne`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Request-Headers": "*",
      "api-key": ATLAS_API_KEY
    },
    body: JSON.stringify({
      dataSource: "Cluster0",
      database: DATABASE_NAME,
      collection: COLLECTION_NAME,
      filter: { domain: domain }
    })
  });
  return await response.json();
}

// Parse text paragraphs against risk taxonomy
function analyzeTextLocally(text) {
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 30);
  const flaggedClauses = [];
  let scorePoints = 100;

  paragraphs.forEach((p) => {
    // Check high risks
    RISK_TAXONOMY.highRisk.forEach((rule) => {
      if (rule.pattern.test(p)) {
        flaggedClauses.push({ level: "high", category: rule.category, summary: rule.summary, excerpt: p.trim() });
        scorePoints -= 20;
      }
    });

    // Check medium risks
    RISK_TAXONOMY.mediumRisk.forEach((rule) => {
      if (rule.pattern.test(p)) {
        flaggedClauses.push({ level: "medium", category: rule.category, summary: rule.summary, excerpt: p.trim() });
        scorePoints -= 10;
      }
    });

    // Check safe commitments
    RISK_TAXONOMY.safe.forEach((rule) => {
      if (rule.pattern.test(p)) {
        flaggedClauses.push({ level: "safe", category: rule.category, summary: rule.summary, excerpt: p.trim() });
        scorePoints += 5;
      }
    });
  });

  // Calculate final letter grade
  scorePoints = Math.max(0, Math.min(100, scorePoints));
  let grade = "A";
  if (scorePoints < 50) grade = "F";
  else if (scorePoints < 65) grade = "D";
  else if (scorePoints < 80) grade = "C";
  else if (scorePoints < 90) grade = "B";

  return {
    score: scorePoints,
    grade: grade,
    clauses: flaggedClauses
  };
}