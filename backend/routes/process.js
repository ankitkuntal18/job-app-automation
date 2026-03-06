// backend/routes/process.js
// ─────────────────────────────────────────────────────────────────
// Handles the two endpoints the Chrome Extension calls:
//
//   POST /api/process-jobs  ← extension sends collected posts here
//   POST /api/send-emails   ← extension triggers sending all pending emails
// ─────────────────────────────────────────────────────────────────

const express    = require("express");
const router     = express.Router();
const multer     = require("multer");
const fs         = require("fs");
const path       = require("path");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const OpenAI     = require("openai");

// Multer — accept the json_file blob the extension sends
const upload = multer({ dest: path.join(__dirname, "../uploads/tmp/") });

const JOBS_FILE  = path.join(__dirname, "../data/jobs.json");
const openai     = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// ── Helpers ──────────────────────────────────────────────────────

function loadJobs() {
  if (!fs.existsSync(JOBS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(JOBS_FILE, "utf8")); }
  catch { return []; }
}

function saveJobs(jobs) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

// Generate a personalized email using OpenAI (or fallback template)
async function generateEmail(post, yourName, yourSkills, roleAppliedFor) {
  if (process.env.OPENAI_API_KEY) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "You are a professional job application assistant. " +
              "Write short, genuine cold outreach emails to recruiters. " +
              "Keep it under 120 words. Sound human and specific. " +
              "First line must be: Subject: [your subject line]"
          },
          {
            role: "user",
            content:
              `Write a recruiter outreach email based on this LinkedIn hiring post:\n\n` +
              `Post: ${post.description?.slice(0, 400)}\n\n` +
              `My Name: ${yourName}\n` +
              `My Skills: ${yourSkills}\n` +
              `Role I want: ${roleAppliedFor}\n\n` +
              `Keep it short, mention the role, 1-2 matching skills, ask for a quick chat.`
          }
        ]
      });

      const text  = completion.choices[0].message.content.trim();
      const lines = text.split("\n");
      return {
        subject: lines[0].replace(/^Subject:\s*/i, "").trim(),
        body:    lines.slice(1).join("\n").trim()
      };
    } catch (err) {
      console.error("OpenAI error:", err.message);
    }
  }

  // Fallback template
  return {
    subject: `Application for ${roleAppliedFor} role`,
    body:
      `Hi,\n\n` +
      `I saw your LinkedIn post about hiring for ${roleAppliedFor} and I'm very interested.\n\n` +
      `With my background in ${yourSkills || "the relevant domain"}, I believe I'd be a strong fit. ` +
      `I've attached my resume for your review.\n\n` +
      `Would you be open to a quick 15-minute call?\n\n` +
      `Best regards,\n${yourName}`
  };
}

// ─────────────────────────────────────────────────────────────────
// POST /api/process-jobs
//
// Called by the Chrome Extension "Process" button.
// Receives: FormData with fields:
//   - json_file      → the collected LinkedIn posts as a JSON blob
//   - email          → sender's email (your Gmail)
//   - roleAppliedFor → e.g. "Software Engineer"
//   - locationFilter → e.g. "India" (optional)
//   - experienceFilter → e.g. "0-2 years" (optional)
//
// What it does:
//   - Parses the JSON file
//   - For each post that has a recruiter email:
//       → generates a personalized email draft via AI
//       → saves it as a "pending" job in jobs.json
// ─────────────────────────────────────────────────────────────────
router.post("/process-jobs", upload.single("json_file"), async (req, res) => {

  // Make sure tmp folder exists
  fs.mkdirSync(path.join(__dirname, "../uploads/tmp"), { recursive: true });

  if (!req.file) {
    return res.status(400).json({ success: false, message: "No json_file received" });
  }

  let postsData;
  try {
    const raw = fs.readFileSync(req.file.path, "utf8");
    postsData = JSON.parse(raw);
    fs.unlinkSync(req.file.path); // clean up temp file
  } catch (err) {
    return res.status(400).json({ success: false, message: "Invalid JSON file: " + err.message });
  }

  const posts          = postsData.posts || [];
  const roleAppliedFor = req.body.roleAppliedFor || "Software Engineer";
  const locationFilter = req.body.locationFilter  || "";
  const experienceFilter = req.body.experienceFilter || "";

  // Read your profile from .env or use defaults
  const yourName   = process.env.YOUR_NAME   || "Job Applicant";
  const yourSkills = process.env.YOUR_SKILLS || "relevant skills";

  if (posts.length === 0) {
    return res.status(400).json({ success: false, message: "No posts found in JSON" });
  }

  const jobs       = loadJobs();
  const existingUrls = new Set(jobs.map(j => j.postUrl).filter(Boolean));
  let   added      = 0;
  let   skipped    = 0;

  console.log(`\n📥 Processing ${posts.length} posts for role: "${roleAppliedFor}"`);

  for (const post of posts) {

    // Skip posts without a recruiter email (can't send without one)
    if (!post.email) { skipped++; continue; }

    // Skip duplicates
    if (post.postUrl && existingUrls.has(post.postUrl)) { skipped++; continue; }

    // Apply location filter if specified
    if (locationFilter) {
      const text = (post.description || "").toLowerCase();
      if (!text.includes(locationFilter.toLowerCase())) { skipped++; continue; }
    }

    // Apply experience filter if specified
    if (experienceFilter) {
      const text = (post.description || "").toLowerCase();
      if (!text.includes(experienceFilter.toLowerCase())) { skipped++; continue; }
    }

    // Generate personalized email draft
    const draft = await generateEmail(post, yourName, yourSkills, roleAppliedFor);

    const newJob = {
      id:             uuidv4(),
      // Job info (from the LinkedIn post)
      jobTitle:       roleAppliedFor,
      company:        extractCompany(post),   // try to extract from post text
      description:    post.description || "",
      postUrl:        post.postUrl     || "",
      postedAt:       post.postedAt    || "",
      collectedAt:    post.collectedAt || new Date().toISOString(),
      // Recruiter info (auto-extracted by the extension!)
      recruiterEmail: post.email,
      recruiterName:  "",
      // Email draft
      emailSubject:   draft.subject,
      emailBody:      draft.body,
      // Meta
      status:         "pending",  // pending | sent | skipped
      uploadedAt:     new Date().toISOString(),
      sentAt:         null,
      // Filters applied
      roleAppliedFor,
      locationFilter,
      experienceFilter,
    };

    jobs.push(newJob);
    existingUrls.add(post.postUrl);
    added++;
    console.log(`  ✅ #${added}: email=${post.email}`);
  }

  saveJobs(jobs);

  console.log(`📊 Done: ${added} added, ${skipped} skipped\n`);

  res.json({
    success:  true,
    message:  `${added} jobs queued for sending. ${skipped} skipped (no email / duplicate / filtered).`,
    added,
    skipped
  });
});

// Helper — try to extract company name from post text
function extractCompany(post) {
  const text = post.description || "";
  // Look for "at [Company]" or "@ [Company]" pattern
  const match = text.match(/(?:at|@)\s+([A-Z][a-zA-Z0-9\s&.,-]{2,30})(?:\s|,|\.|\!)/);
  return match ? match[1].trim() : "Unknown Company";
}

// ─────────────────────────────────────────────────────────────────
// POST /api/send-emails
//
// Called by the Chrome Extension "Send Pending Emails" button.
// Sends emails for all jobs with status "pending".
// Attaches resume.pdf to each email.
// ─────────────────────────────────────────────────────────────────
router.post("/send-emails", async (req, res) => {
  const resumePath = path.join(__dirname, "../uploads/resume.pdf");

  if (!fs.existsSync(resumePath)) {
    return res.status(400).json({
      success: false,
      message: "Resume not found. Please upload your resume in the Settings page first."
    });
  }

  const jobs        = loadJobs();
  const pendingJobs = jobs.filter(j => j.status === "pending");

  if (pendingJobs.length === 0) {
    return res.json({ success: true, emails_sent: 0, message: "No pending jobs to send." });
  }

  const yourName = process.env.YOUR_NAME || "Job Applicant";
  let   sent     = 0;
  let   failed   = 0;

  console.log(`\n📧 Sending ${pendingJobs.length} pending emails...`);

  for (const job of pendingJobs) {
    try {
      await transporter.sendMail({
        from:        `"${yourName}" <${process.env.EMAIL_USER}>`,
        to:          job.recruiterEmail,
        subject:     job.emailSubject || `Application for ${job.jobTitle}`,
        text:        job.emailBody    || `Hi, please find my resume attached.`,
        attachments: [{ filename: "Resume.pdf", path: resumePath }]
      });

      // Mark as sent in jobs.json
      const idx = jobs.findIndex(j => j.id === job.id);
      if (idx !== -1) {
        jobs[idx].status = "sent";
        jobs[idx].sentAt = new Date().toISOString();
      }

      sent++;
      console.log(`  ✅ Sent to: ${job.recruiterEmail}`);

      // Small delay between emails to avoid Gmail rate limiting
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      failed++;
      console.error(`  ❌ Failed: ${job.recruiterEmail} —`, err.message);
    }
  }

  saveJobs(jobs);
  console.log(`📊 Done: ${sent} sent, ${failed} failed\n`);

  res.json({
    success:     true,
    emails_sent: sent,
    failed,
    message:     `${sent} emails sent successfully. ${failed} failed.`
  });
});

module.exports = router;