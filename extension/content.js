// This file runs on LinkedIn job pages
// It reads the page and pulls out job information

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractJob") {
    const data = extractJobData();
    sendResponse({ success: true, data });
  }
});

function extractJobData() {
  // Try to find the job title on the page
  const titleEl = document.querySelector("h1");

  // Try to find the company name
  const companyEl = document.querySelector(
    ".job-details-jobs-unified-top-card__company-name a, a[class*='company-name']"
  );

  // Try to find the location
  const locationEl = document.querySelector(
    ".job-details-jobs-unified-top-card__bullet"
  );

  // Try to find the full job description
  const descEl = document.querySelector(
    "#job-details, .jobs-description__content"
  );

  // Try to find recruiter name (LinkedIn sometimes shows this)
  const recruiterNameEl = document.querySelector(
    ".hirer-card__hirer-information span"
  );

  // Try to find recruiter LinkedIn profile link
  const recruiterLinkEl = document.querySelector(
    ".hirer-card__hirer-information a"
  );

  // Return all the data we found as one object
  return {
    jobTitle:          titleEl         ? titleEl.innerText.trim()         : "Unknown Title",
    company:           companyEl       ? companyEl.innerText.trim()        : "Unknown Company",
    location:          locationEl      ? locationEl.innerText.trim()       : "",
    description:       descEl          ? descEl.innerText.trim().slice(0, 3000) : "",
    recruiterName:     recruiterNameEl ? recruiterNameEl.innerText.trim()  : "",
    recruiterLinkedIn: recruiterLinkEl ? recruiterLinkEl.href              : "",
    recruiterEmail:    "",
    jobUrl:            window.location.href,
    scrapedAt:         new Date().toISOString()
  };
}