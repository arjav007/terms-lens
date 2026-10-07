(function () {
  // Prevent duplicate script execution
  if (window.hasTermsLensInjected) return;
  window.hasTermsLensInjected = true;

  // Detect legal documents on page
  function extractLegalText() {
    const isLegalPage = /terms|privacy|tos|condition|policy/i.test(window.location.href) ||
      /terms|privacy policy|legal/i.test(document.title);

    if (!isLegalPage) return null;

    const mainContainer = document.querySelector("main, article, .content, #content, body");
    return mainContainer ? mainContainer.innerText : document.body.innerText;
  }

  const legalText = extractLegalText();
  if (!legalText || legalText.length < 200) return;

  // Request analysis from background service worker
  const currentDomain = window.location.hostname;
  chrome.runtime.sendMessage(
    { action: "ANALYZE_TEXT", domain: currentDomain, text: legalText },
    (response) => {
      if (response && response.success) {
        renderTermsLensWidget(response.data);
      }
    }
  );

  // Inject UI badge and drawer into webpage
  function renderTermsLensWidget(report) {
    const badge = document.createElement("div");
    badge.id = "tl-floating-badge";
    badge.className = `tl-grade-${report.grade.toLowerCase()}`;
    badge.innerHTML = `<span>TermsLens: Grade ${report.grade}</span>`;

    const drawer = document.createElement("div");
    drawer.id = "tl-drawer";
    drawer.style.display = "none";

    let clausesHTML = report.clauses.map(c => `
      <div class="tl-clause-card tl-risk-${c.level}">
        <span class="tl-tag">${c.category}</span>
        <p class="tl-summary"><strong>${c.summary}</strong></p>
        <blockquote class="tl-excerpt">"${c.excerpt.substring(0, 120)}..."</blockquote>
      </div>
    `).join("") || "<p>No critical risk factors detected in this agreement.</p>";

    drawer.innerHTML = `
      <div class="tl-drawer-header">
        <h3>TermsLens Safety Analysis</h3>
        <button id="tl-close-btn">&times;</button>
      </div>
      <div class="tl-drawer-body">
        <div class="tl-score-banner">
          <div class="tl-score-circle tl-grade-${report.grade.toLowerCase()}">${report.grade}</div>
          <div>
            <h4>Privacy Score: ${report.score}/100</h4>
            <p>Based on automated analysis of legal clauses on this page.</p>
          </div>
        </div>
        <hr/>
        <h4>Key Clause Highlights</h4>
        ${clausesHTML}
      </div>
    `;

    document.body.appendChild(badge);
    document.body.appendChild(drawer);

    // Event listeners
    badge.addEventListener("click", () => {
      drawer.style.display = drawer.style.display === "none" ? "block" : "none";
    });

    document.getElementById("tl-close-btn").addEventListener("click", () => {
      drawer.style.display = "none";
    });
  }
})();