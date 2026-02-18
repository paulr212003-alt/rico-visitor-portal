
const API_BASE = "/api";

const page = document.body?.dataset?.page || "";
const themeSelect = document.getElementById("themeSelect");
const liveClock = document.getElementById("liveClock");
const particlesLayer = document.getElementById("particlesLayer");
const toastContainer = document.getElementById("toastContainer");
const VOICE_PREF_KEY = "rico-voice-enabled";
const speechSupported =
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  "SpeechSynthesisUtterance" in window;

const authModal = document.getElementById("authModal");
const authTitle = document.getElementById("authTitle");
const authMessage = document.getElementById("authMessage");
const securityPassword = document.getElementById("securityPassword");
const approveButton = document.getElementById("approveButton");
const cancelButton = document.getElementById("cancelButton");

let authAction = null;
let pendingPassPayload = null;
let pendingDeletePassId = null;
let activePassesAdminPassword = "";

let analyticsRange = 7;
let trendChart = null;
let peakHoursChart = null;
let departmentChart = null;
let lastAnalyticsData = null;
let nameSuggestTimer = null;
let voiceEnabled = true;
let preferredSpeechVoice = null;

function normalizePhone(phone = "") {
  return String(phone).replace(/\D/g, "");
}

function normalizeName(name = "") {
  return String(name).trim().replace(/\s+/g, " ");
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("rico-theme", theme);
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem("rico-theme") || "midnight";
  if (themeSelect) themeSelect.value = savedTheme;
  setTheme(savedTheme);
}

function updateClock() {
  if (!liveClock) return;
  const now = new Date();
  const date = now.toLocaleDateString([], { month: "short", day: "2-digit" });
  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  liveClock.textContent = `${date} | ${time}`;
}

function initClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function showToast(message, isError = false) {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function readVoicePreference() {
  try {
    const stored = localStorage.getItem(VOICE_PREF_KEY);
    if (stored === null) return true;
    return stored === "1";
  } catch (_error) {
    return true;
  }
}

function persistVoicePreference(enabled) {
  try {
    localStorage.setItem(VOICE_PREF_KEY, enabled ? "1" : "0");
  } catch (_error) {
    // Ignore localStorage failures and continue with in-memory preference.
  }
}

function resolveSpeechVoice() {
  if (!speechSupported) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  preferredSpeechVoice =
    voices.find((voice) => /^en-in$/i.test(voice.lang || "")) ||
    voices.find((voice) => /^en-(us|gb)$/i.test(voice.lang || "")) ||
    voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("en")) ||
    voices[0] ||
    null;

  return preferredSpeechVoice;
}

function speakAnnouncement(text) {
  if (!speechSupported || !voiceEnabled) return;
  const message = String(text || "").trim();
  if (!message) return;

  try {
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voice = preferredSpeechVoice || resolveSpeechVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch (_error) {
    // Ignore speech failures and keep UI flow uninterrupted.
  }
}

function announceGatePassIssued() {
  speakAnnouncement("Gate pass issued");
}

function announceVisitorExited() {
  speakAnnouncement("Visitor exited");
}

function shouldAnnounceExit(message) {
  return String(message || "").toLowerCase().includes("exit marked");
}

function updateVoiceToggleUI(button) {
  if (!button) return;
  if (!speechSupported) {
    button.textContent = "Voice N/A";
    button.disabled = true;
    button.classList.remove("on", "off");
    return;
  }

  button.disabled = false;
  button.textContent = voiceEnabled ? "Voice On" : "Voice Off";
  button.classList.toggle("on", voiceEnabled);
  button.classList.toggle("off", !voiceEnabled);
}

function initVoiceControl() {
  const topbarRight = document.querySelector(".topbar-right");
  if (!topbarRight) return;

  voiceEnabled = readVoicePreference();

  let toggleButton = document.getElementById("voiceToggleBtn");
  if (!toggleButton) {
    toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.id = "voiceToggleBtn";
    toggleButton.className = "voice-toggle";
    toggleButton.setAttribute("aria-label", "Toggle voice announcements");
    topbarRight.insertBefore(toggleButton, topbarRight.firstChild);
  }

  updateVoiceToggleUI(toggleButton);

  if (!toggleButton.dataset.bound) {
    toggleButton.addEventListener("click", () => {
      if (!speechSupported) return;
      voiceEnabled = !voiceEnabled;
      persistVoicePreference(voiceEnabled);
      updateVoiceToggleUI(toggleButton);
      showToast(voiceEnabled ? "Voice alerts enabled" : "Voice alerts disabled");
    });
    toggleButton.dataset.bound = "1";
  }

  if (speechSupported) {
    resolveSpeechVoice();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", resolveSpeechVoice);
    } else {
      window.speechSynthesis.onvoiceschanged = resolveSpeechVoice;
    }
  }
}

function setResult(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("success", "error");
  if (type) element.classList.add(type);
}

function parseTextErrorMessage(rawText = "") {
  const match = String(rawText).match(/<pre>([\s\S]*?)<\/pre>/i);
  const source = match ? match[1] : rawText;
  return String(source || "").replace(/\s+/g, " ").trim();
}

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { message: parseTextErrorMessage(await response.text()) };

  if (!response.ok) {
    const error = new Error(payload.message || "Request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function markExitPass(passId, phone = "") {
  return apiRequest("/markExit", {
    method: "POST",
    body: JSON.stringify({
      passId: String(passId || "").trim().toUpperCase(),
      phone: normalizePhone(phone),
    }),
  });
}

function openAuthModal({ action, title, message, buttonLabel, payload = null, passId = null }) {
  if (!authModal || !securityPassword || !approveButton) {
    showToast("Security dialog not available", true);
    return;
  }

  authAction = action;
  pendingPassPayload = payload;
  pendingDeletePassId = passId;

  if (authTitle) authTitle.textContent = title || "Enter security password";
  if (authMessage) authMessage.textContent = message || "Confirm secure action";
  approveButton.textContent = buttonLabel || "Confirm";
  securityPassword.value = "";
  authModal.classList.remove("hidden");
  securityPassword.focus();
}

function closeAuthModal() {
  authAction = null;
  pendingPassPayload = null;
  pendingDeletePassId = null;
  if (authModal) authModal.classList.add("hidden");
}

function attachModalHandlers() {
  if (!authModal || !approveButton || !securityPassword) return;

  approveButton.addEventListener("click", async () => {
    const adminPassword = securityPassword.value.trim();
    if (!adminPassword) {
      showToast("Enter security password", true);
      return;
    }

    if (authAction === "create") {
      if (!pendingPassPayload) return;
      try {
        const data = await apiRequest("/createPass", {
          method: "POST",
          body: JSON.stringify({
            ...pendingPassPayload,
            adminPassword,
          }),
        });

        closeAuthModal();
        handleIssueSuccess(data);
      } catch (error) {
        if (error.status === 401) {
          showToast("Unauthorized", true);
        } else {
          showToast(error.message, true);
        }
      }
      return;
    }

    if (authAction === "delete") {
      if (!pendingDeletePassId) return;
      try {
        await deletePassWithFallback(pendingDeletePassId, adminPassword);
        closeAuthModal();
        showToast("Pass deleted successfully");
        await loadTodayVisitors();
      } catch (error) {
        if (error.status === 401) {
          showToast("Unauthorized", true);
        } else {
          showToast(error.message, true);
        }
      }
    }
  });

  if (cancelButton) {
    cancelButton.addEventListener("click", closeAuthModal);
  }

  authModal.addEventListener("click", (event) => {
    if (event.target === authModal) closeAuthModal();
  });

  securityPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") approveButton.click();
    if (event.key === "Escape") closeAuthModal();
  });
}

function createParticles() {
  if (!particlesLayer) return;
  particlesLayer.innerHTML = "";

  const particleCount = window.innerWidth < 700 ? 14 : 28;
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < particleCount; i += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 100}%`;
    particle.style.setProperty("--size", `${Math.random() * 2 + 1.2}px`);
    particle.style.setProperty("--duration", `${Math.random() * 12 + 10}s`);
    particle.style.setProperty("--delay", `${Math.random() * 8}s`);
    fragment.appendChild(particle);
  }

  particlesLayer.appendChild(fragment);
}

function revealSections() {
  const revealEls = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealEls.forEach((el) => observer.observe(el));
}

function renderDetails(container, map) {
  if (!container) return;
  const entries = Object.entries(map || {});

  if (!entries.length) {
    container.innerHTML = '<p class="empty-row">No details available.</p>';
    return;
  }

  container.innerHTML = "";
  for (const [label, value] of entries) {
    const card = document.createElement("div");
    card.className = "detail-item";
    card.innerHTML = `<span>${label}</span><strong>${value || "-"}</strong>`;
    container.appendChild(card);
  }
}

function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function setNameSuggestions(options = []) {
  const checkNameSuggestions = document.getElementById("checkNameSuggestions");
  if (!checkNameSuggestions) return;

  checkNameSuggestions.innerHTML = "";
  options.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    checkNameSuggestions.appendChild(option);
  });
}

async function fetchNameSuggestions(query) {
  if (!query || query.length < 2) {
    setNameSuggestions([]);
    return;
  }

  try {
    const data = await apiRequest(`/nameSuggestions?q=${encodeURIComponent(query)}`, {
      method: "GET",
    });
    setNameSuggestions(data.suggestions || []);
  } catch (_error) {
    setNameSuggestions([]);
  }
}

function initCheckVisitorPage() {
  const checkVisitorForm = document.getElementById("checkVisitorForm");
  const checkNameInput = document.getElementById("checkName");
  const checkPhoneInput = document.getElementById("checkPhone");
  const historyResult = document.getElementById("historyResult");
  const historyBadge = document.getElementById("historyBadge");
  const historyDetails = document.getElementById("historyDetails");
  const renewPassLink = document.getElementById("renewPassLink");
  const validatePassLink = document.getElementById("validatePassLink");
  const historyMarkExitBtn = document.getElementById("historyMarkExitBtn");

  if (!checkVisitorForm) return;

  const setHistoryVisitorDetails = (visitor) => {
    renderDetails(historyDetails, {
      "Full Name": visitor?.name,
      Phone: visitor?.phone,
      "Visitor Type": visitor?.visitorType || "Visitor",
      "Pass ID": visitor?.passId,
      Company: visitor?.company || "-",
      Department: visitor?.department || "-",
      "Purpose of Visit": visitor?.visitType,
      Status: visitor?.status,
      "Time In": formatDateTime(visitor?.timeIn),
      "Time Out": formatDateTime(visitor?.timeOut),
    });
  };

  if (historyMarkExitBtn) {
    historyMarkExitBtn.disabled = true;
    historyMarkExitBtn.addEventListener("click", async () => {
      const passId = String(historyMarkExitBtn.dataset.passId || "").trim();
      const phone = String(historyMarkExitBtn.dataset.phone || "").trim();

      if (!passId) {
        showToast("Pass ID not available", true);
        return;
      }

      try {
        const data = await markExitPass(passId, phone);
        showToast(data.message || "Exit marked successfully.");
        setResult(historyResult, data.message || "Exit marked successfully.", "success");
        if (shouldAnnounceExit(data.message)) announceVisitorExited();
        if (historyBadge) historyBadge.textContent = "Exit Marked";
        setHistoryVisitorDetails(data.visitor || {});
        historyMarkExitBtn.disabled = true;
        historyMarkExitBtn.textContent = "Exit Marked";
      } catch (error) {
        setResult(historyResult, error.message, "error");
        showToast(error.message, true);
      }
    });
  }

  if (checkNameInput) {
    checkNameInput.addEventListener("input", () => {
      clearTimeout(nameSuggestTimer);
      const query = normalizeName(checkNameInput.value);
      nameSuggestTimer = setTimeout(() => {
        fetchNameSuggestions(query);
      }, 220);
    });
  }

  checkVisitorForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = normalizeName(checkNameInput?.value || "");
    const phone = normalizePhone(checkPhoneInput?.value || "");

    if (!name && !phone) {
      setResult(historyResult, "Enter name or phone number to check visitor.", "error");
      return;
    }

    try {
      const data = await apiRequest("/checkVisitor", {
        method: "POST",
        body: JSON.stringify({ name, phone }),
      });

      if (Array.isArray(data.suggestions)) {
        setNameSuggestions(data.suggestions);
      }

      const resultType = data.exists ? "success" : "error";
      setResult(historyResult, data.message || "Check complete.", resultType);

      if (data.exists && data.visitor) {
        showToast("User exists");
        if (historyBadge) historyBadge.textContent = "Match found";
        setHistoryVisitorDetails(data.visitor);

        if (renewPassLink) {
          const params = new URLSearchParams({
            name: data.visitor.name || name,
            phone: data.visitor.phone || phone,
            visitorType: data.visitor.visitorType || "Visitor",
            companyType: data.visitor.companyType || "",
            company: data.visitor.company || "",
            ricoUnit: data.visitor.ricoUnit || "",
            visitType: data.visitor.visitType || "",
            personToMeet: data.visitor.personToMeet || "",
            department: data.visitor.department || "",
            carriesLaptop: data.visitor.carriesLaptop ? "Yes" : "No",
            laptopSerialNumber: data.visitor.laptopSerialNumber || "",
            idProofType: data.visitor.idProofType || "",
            idProofNumber: data.visitor.idProofNumber || "",
            remarks: data.visitor.remarks || "",
          });
          renewPassLink.href = `issue-pass.html?${params.toString()}`;
        }

        if (validatePassLink) {
          const params = new URLSearchParams({
            passId: data.visitor.passId || "",
            phone: data.visitor.phone || "",
          });
          validatePassLink.href = `validate-pass.html?${params.toString()}`;
        }

        if (historyMarkExitBtn) {
          const isActive = String(data.visitor?.status || "").toLowerCase() === "active";
          historyMarkExitBtn.dataset.passId = data.visitor?.passId || "";
          historyMarkExitBtn.dataset.phone = data.visitor?.phone || "";
          historyMarkExitBtn.disabled = !isActive;
          historyMarkExitBtn.textContent = isActive ? "Mark Exit" : "Exit Marked";
        }
      } else {
        if (historyBadge) historyBadge.textContent = "No match";
        renderDetails(historyDetails, {});
        if (historyMarkExitBtn) {
          historyMarkExitBtn.dataset.passId = "";
          historyMarkExitBtn.dataset.phone = "";
          historyMarkExitBtn.disabled = true;
          historyMarkExitBtn.textContent = "Mark Exit";
        }
      }
    } catch (error) {
      setResult(historyResult, error.message, "error");
      showToast(error.message, true);
    }
  });
}
function populateIssueFormFromQuery() {
  const fields = {
    name: queryParam("name"),
    phone: queryParam("phone"),
    visitorType: queryParam("visitorType"),
    companyType: queryParam("companyType"),
    company: queryParam("company"),
    ricoUnit: queryParam("ricoUnit"),
    visitType: queryParam("visitType"),
    personToMeet: queryParam("personToMeet"),
    department: queryParam("department"),
    carriesLaptop: queryParam("carriesLaptop"),
    laptopSerialNumber: queryParam("laptopSerialNumber"),
    idProofType: queryParam("idProofType"),
    idProofNumber: queryParam("idProofNumber"),
    remarks: queryParam("remarks"),
  };

  if (fields.name) {
    const input = document.getElementById("name");
    if (input) input.value = fields.name;
  }

  if (fields.phone) {
    const input = document.getElementById("phone");
    if (input) input.value = fields.phone;
  }

  const visitorType = document.getElementById("visitorType");
  if (visitorType && fields.visitorType) visitorType.value = fields.visitorType;

  const companyTypeSelect = document.getElementById("companyType");
  const otherCompanyInput = document.getElementById("otherCompanyName");

  if (companyTypeSelect) {
    if (fields.companyType) {
      companyTypeSelect.value = fields.companyType;
    } else if (fields.company && fields.company.toLowerCase() === "rico") {
      companyTypeSelect.value = "RICO";
    } else if (fields.company) {
      companyTypeSelect.value = "Other";
    }
  }

  if (otherCompanyInput && fields.company && fields.company.toLowerCase() !== "rico") {
    otherCompanyInput.value = fields.company;
  }

  const ricoUnit = document.getElementById("ricoUnit");
  if (ricoUnit && fields.ricoUnit) ricoUnit.value = fields.ricoUnit;

  const visitType = document.getElementById("visitType");
  if (visitType && fields.visitType) visitType.value = fields.visitType;

  const personToMeet = document.getElementById("personToMeet");
  if (personToMeet && fields.personToMeet) personToMeet.value = fields.personToMeet;

  const department = document.getElementById("department");
  if (department && fields.department) department.value = fields.department;

  const carriesLaptop = document.getElementById("carriesLaptop");
  if (carriesLaptop && fields.carriesLaptop) carriesLaptop.value = fields.carriesLaptop;

  const laptopSerialNumber = document.getElementById("laptopSerialNumber");
  if (laptopSerialNumber && fields.laptopSerialNumber) {
    laptopSerialNumber.value = fields.laptopSerialNumber;
  }

  const idProofType = document.getElementById("idProofType");
  if (idProofType && fields.idProofType) idProofType.value = fields.idProofType;

  const idProofNumber = document.getElementById("idProofNumber");
  if (idProofNumber && fields.idProofNumber) idProofNumber.value = fields.idProofNumber;

  const remarks = document.getElementById("remarks");
  if (remarks && fields.remarks) remarks.value = fields.remarks;
}

function syncCompanyFields() {
  const companyTypeSelect = document.getElementById("companyType");
  const ricoUnitWrapper = document.getElementById("ricoUnitWrapper");
  const ricoUnitSelect = document.getElementById("ricoUnit");
  const otherCompanyWrapper = document.getElementById("otherCompanyWrapper");
  const otherCompanyInput = document.getElementById("otherCompanyName");

  if (!companyTypeSelect) return;

  const isRico = companyTypeSelect.value === "RICO";
  const isOther = companyTypeSelect.value === "Other";

  if (ricoUnitWrapper) ricoUnitWrapper.classList.toggle("hidden", !isRico);
  if (otherCompanyWrapper) otherCompanyWrapper.classList.toggle("hidden", !isOther);

  if (ricoUnitSelect) {
    if (!isRico) ricoUnitSelect.value = "";
  }

  if (otherCompanyInput) {
    if (!isOther) otherCompanyInput.value = "";
  }
}

function syncLaptopFields() {
  const carriesLaptopSelect = document.getElementById("carriesLaptop");
  const laptopSerialWrapper = document.getElementById("laptopSerialWrapper");
  const laptopSerialInput = document.getElementById("laptopSerialNumber");

  if (!carriesLaptopSelect) return;

  const needsSerial = carriesLaptopSelect.value === "Yes";
  if (laptopSerialWrapper) laptopSerialWrapper.classList.toggle("hidden", !needsSerial);
  if (laptopSerialInput) {
    if (!needsSerial) laptopSerialInput.value = "";
  }
}

function getIssuePayload() {
  const companyType = document.getElementById("companyType")?.value || "";
  const otherCompanyName = document.getElementById("otherCompanyName")?.value.trim() || "";

  return {
    name: normalizeName(document.getElementById("name")?.value || ""),
    phone: normalizePhone(document.getElementById("phone")?.value || ""),
    visitorType: document.getElementById("visitorType")?.value || "Visitor",
    companyType,
    company: companyType === "RICO" ? "RICO" : otherCompanyName,
    otherCompanyName,
    ricoUnit: document.getElementById("ricoUnit")?.value || "",
    visitType: document.getElementById("visitType")?.value || "",
    personToMeet: normalizeName(document.getElementById("personToMeet")?.value || ""),
    department: document.getElementById("department")?.value || "",
    carriesLaptop: document.getElementById("carriesLaptop")?.value || "",
    laptopSerialNumber: document.getElementById("laptopSerialNumber")?.value.trim() || "",
    idProofType: document.getElementById("idProofType")?.value || "",
    idProofNumber: document.getElementById("idProofNumber")?.value.trim() || "",
    remarks: document.getElementById("remarks")?.value.trim() || "",
  };
}

function handleIssueSuccess(data) {
  const passIssuedBanner = document.getElementById("passIssuedBanner");
  const issuedPassId = document.getElementById("issuedPassId");
  const createPassForm = document.getElementById("createPassForm");

  if (issuedPassId) issuedPassId.textContent = data.passId || "-";
  if (passIssuedBanner) passIssuedBanner.classList.remove("hidden");
  showToast("Gate pass issued");
  announceGatePassIssued();

  if (createPassForm) {
    createPassForm.reset();
    syncCompanyFields();
    syncLaptopFields();
  }
}

function initIssuePassPage() {
  const createPassForm = document.getElementById("createPassForm");
  const companyTypeSelect = document.getElementById("companyType");
  const carriesLaptopSelect = document.getElementById("carriesLaptop");

  if (!createPassForm) return;

  populateIssueFormFromQuery();
  syncCompanyFields();
  syncLaptopFields();

  if (companyTypeSelect) {
    companyTypeSelect.addEventListener("change", syncCompanyFields);
  }

  if (carriesLaptopSelect) {
    carriesLaptopSelect.addEventListener("change", syncLaptopFields);
  }

  createPassForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const payload = getIssuePayload();

    openAuthModal({
      action: "create",
      title: "Enter security password to approve pass",
      message: "Gate pass issuance requires admin authorization.",
      buttonLabel: "Approve Pass",
      payload,
    });
  });
}

function initValidatePassPage() {
  const validatePassForm = document.getElementById("validatePassForm");
  const validateResult = document.getElementById("validateResult");
  const validationBadge = document.getElementById("validationBadge");
  const validationDetails = document.getElementById("validationDetails");
  const validateMarkExitBtn = document.getElementById("validateMarkExitBtn");

  if (!validatePassForm) return;

  const setValidationVisitorDetails = (visitor) => {
    renderDetails(validationDetails, {
      Name: visitor?.name,
      Phone: visitor?.phone,
      "Pass ID": visitor?.passId,
      Department: visitor?.department || "-",
      Company: visitor?.company || "-",
      Status: visitor?.status,
      "Time In": formatDateTime(visitor?.timeIn),
      "Time Out": formatDateTime(visitor?.timeOut),
    });
  };

  const initialPassId = queryParam("passId");
  const initialPhone = queryParam("phone");
  if (initialPassId) {
    const input = document.getElementById("validatePassId");
    if (input) input.value = initialPassId;
  }
  if (initialPhone) {
    const input = document.getElementById("validatePhone");
    if (input) input.value = initialPhone;
  }

  if (validateMarkExitBtn) {
    validateMarkExitBtn.addEventListener("click", async () => {
      const passId = String(validateMarkExitBtn.dataset.passId || "").trim();
      const phone = String(validateMarkExitBtn.dataset.phone || "").trim();

      if (!passId) {
        showToast("Pass ID not available", true);
        return;
      }

      try {
        const data = await markExitPass(passId, phone);
        showToast(data.message || "Exit marked successfully.");
        setResult(validateResult, data.message || "Exit marked successfully.", "success");
        if (shouldAnnounceExit(data.message)) announceVisitorExited();
        if (validationBadge) validationBadge.textContent = "Exit Marked";
        setValidationVisitorDetails(data.visitor || {});
        validateMarkExitBtn.disabled = true;
        validateMarkExitBtn.textContent = "Exit Marked";
      } catch (error) {
        setResult(validateResult, error.message, "error");
        showToast(error.message, true);
      }
    });
  }

  validatePassForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const passId = String(document.getElementById("validatePassId")?.value || "")
      .trim()
      .toUpperCase();
    const phone = normalizePhone(document.getElementById("validatePhone")?.value || "");

    try {
      const data = await apiRequest("/validatePass", {
        method: "POST",
        body: JSON.stringify({ passId, phone }),
      });

      if (data.valid) {
        setResult(validateResult, data.message || "User authenticated", "success");
        showToast("User authenticated");
        if (validationBadge) validationBadge.textContent = "Valid";
        setValidationVisitorDetails(data.visitor || {});

        if (validateMarkExitBtn) {
          const isActive = String(data.visitor?.status || "").toLowerCase() === "active";
          validateMarkExitBtn.classList.remove("hidden");
          validateMarkExitBtn.dataset.passId = data.visitor?.passId || "";
          validateMarkExitBtn.dataset.phone = data.visitor?.phone || "";
          validateMarkExitBtn.disabled = !isActive;
          validateMarkExitBtn.textContent = isActive ? "Mark Exit" : "Exit Marked";
        }
      } else {
        setResult(validateResult, data.message || "Invalid pass", "error");
        if (validationBadge) validationBadge.textContent = "Invalid";
        renderDetails(validationDetails, {});
        if (validateMarkExitBtn) {
          validateMarkExitBtn.classList.add("hidden");
          validateMarkExitBtn.dataset.passId = "";
          validateMarkExitBtn.dataset.phone = "";
        }
      }
    } catch (error) {
      if (error.status === 401) {
        showToast("Unauthorized", true);
      } else {
        showToast(error.message, true);
      }
      setResult(validateResult, error.message, "error");
      if (validationBadge) validationBadge.textContent = "Invalid";
      renderDetails(validationDetails, {});
      if (validateMarkExitBtn) {
        validateMarkExitBtn.classList.add("hidden");
        validateMarkExitBtn.dataset.passId = "";
        validateMarkExitBtn.dataset.phone = "";
      }
    }
  });
}

function renderTodayVisitors(visitors) {
  const todayVisitorsBody = document.getElementById("todayVisitorsBody");
  if (!todayVisitorsBody) return;

  todayVisitorsBody.innerHTML = "";

  if (!Array.isArray(visitors) || visitors.length === 0) {
    todayVisitorsBody.innerHTML =
      '<tr><td colspan="7" class="empty-row">No entries yet.</td></tr>';
    return;
  }

  for (const visitor of visitors) {
    const row = document.createElement("tr");
    const passId = visitor.passId || "";
    const phone = visitor.phone || "";
    const isActive = String(visitor.status || "").toLowerCase() === "active";
    const exitAction = isActive
      ? `<button type="button" class="table-exit-btn" data-pass-id="${passId}" data-phone="${phone}">Mark Exit</button>`
      : '<span class="table-status-tag">Exited</span>';

    row.innerHTML = `
      <td>${passId || "-"}</td>
      <td>${visitor.name || "-"}</td>
      <td>${visitor.phone || "-"}</td>
      <td>${visitor.department || "-"}</td>
      <td>${formatTime(visitor.timeIn)}</td>
      <td>${visitor.status || "-"}</td>
      <td>
        <div class="table-actions">
          ${exitAction}
          <button type="button" class="table-delete-btn" data-pass-id="${passId}">
            Delete
          </button>
        </div>
      </td>
    `;

    todayVisitorsBody.appendChild(row);
  }
}

async function deletePassWithFallback(passId, adminPassword) {
  try {
    await apiRequest(`/pass/${encodeURIComponent(passId)}`, {
      method: "DELETE",
      headers: {
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({ adminPassword }),
    });
    return;
  } catch (error) {
    const routeNotFound =
      error.status === 404 &&
      (/Cannot DELETE \/api\/pass\//i.test(error.message || "") ||
        /API route not found/i.test(error.message || ""));

    if (!routeNotFound) {
      throw error;
    }
  }

  await apiRequest("/deletePass", {
    method: "POST",
    body: JSON.stringify({ passId, adminPassword }),
  });
}

async function loadTodayVisitors() {
  const todayCount = document.getElementById("todayCount");

  try {
    const data = await apiRequest("/todayVisitors", { method: "GET" });
    if (todayCount) todayCount.textContent = `${data.count || 0} entries`;
    renderTodayVisitors(data.visitors || []);
    return data;
  } catch (error) {
    showToast(error.message, true);
    return { count: 0, visitors: [] };
  }
}

function renderActivePasses(visitors) {
  const activePassesBody = document.getElementById("activePassesBody");
  if (!activePassesBody) return;

  activePassesBody.innerHTML = "";

  if (!Array.isArray(visitors) || visitors.length === 0) {
    activePassesBody.innerHTML =
      '<tr><td colspan="8" class="empty-row">No active passes found.</td></tr>';
    return;
  }

  for (const visitor of visitors) {
    const passId = visitor.passId || "";
    const phone = visitor.phone || "";
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${passId || "-"}</td>
      <td>${visitor.name || "-"}</td>
      <td>${visitor.phone || "-"}</td>
      <td>${visitor.department || "-"}</td>
      <td>${visitor.visitType || "-"}</td>
      <td>${formatDateTime(visitor.timeIn || visitor.date)}</td>
      <td>${visitor.status || "active"}</td>
      <td>
        <button type="button" class="table-exit-btn" data-pass-id="${passId}" data-phone="${phone}">
          Mark Exit
        </button>
      </td>
    `;

    activePassesBody.appendChild(row);
  }
}

async function loadActivePasses(adminPassword = activePassesAdminPassword) {
  const activePassesCount = document.getElementById("activePassesCount");

  if (!adminPassword) {
    throw new Error("Enter security password first.");
  }

  const data = await apiRequest("/activePasses", {
    method: "GET",
    headers: {
      "x-admin-password": adminPassword,
    },
  });

  if (activePassesCount) activePassesCount.textContent = `${data.count || 0} active passes`;
  renderActivePasses(data.visitors || []);
  return data;
}

function initActivePassesPage() {
  const unlockForm = document.getElementById("activePassesUnlockForm");
  const passwordInput = document.getElementById("activePassesPassword");
  const activePassesResult = document.getElementById("activePassesResult");
  const activePassesPanel = document.getElementById("activePassesPanel");
  const refreshActivePassesBtn = document.getElementById("refreshActivePassesBtn");
  const lockActivePassesBtn = document.getElementById("lockActivePassesBtn");
  const activePassesBody = document.getElementById("activePassesBody");
  const activePassesCount = document.getElementById("activePassesCount");

  if (!unlockForm || !passwordInput || !activePassesPanel || !activePassesBody) return;

  const lockPanel = () => {
    activePassesAdminPassword = "";
    activePassesPanel.classList.add("hidden");
    renderActivePasses([]);
    if (activePassesCount) activePassesCount.textContent = "Locked";
    setResult(activePassesResult, "Enter security password to unlock active passes.");
  };

  unlockForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const adminPassword = String(passwordInput.value || "").trim();
    if (!adminPassword) {
      setResult(activePassesResult, "Enter security password.", "error");
      return;
    }

    try {
      await loadActivePasses(adminPassword);
      activePassesAdminPassword = adminPassword;
      activePassesPanel.classList.remove("hidden");
      setResult(activePassesResult, "Access granted. Active passes loaded.", "success");
      showToast("Active passes loaded");
    } catch (error) {
      activePassesAdminPassword = "";
      activePassesPanel.classList.add("hidden");
      renderActivePasses([]);

      if (error.status === 401) {
        setResult(activePassesResult, "Unauthorized", "error");
        showToast("Unauthorized", true);
      } else {
        setResult(activePassesResult, error.message, "error");
        showToast(error.message, true);
      }
    }
  });

  if (refreshActivePassesBtn) {
    refreshActivePassesBtn.addEventListener("click", async () => {
      if (!activePassesAdminPassword) {
        setResult(activePassesResult, "Unlock page first to refresh active passes.", "error");
        return;
      }

      try {
        await loadActivePasses(activePassesAdminPassword);
        setResult(activePassesResult, "Active passes refreshed.", "success");
      } catch (error) {
        if (error.status === 401) {
          setResult(activePassesResult, "Unauthorized", "error");
          showToast("Unauthorized", true);
          lockPanel();
        } else {
          setResult(activePassesResult, error.message, "error");
          showToast(error.message, true);
        }
      }
    });
  }

  if (lockActivePassesBtn) {
    lockActivePassesBtn.addEventListener("click", () => {
      lockPanel();
      passwordInput.value = "";
      showToast("Active pass window locked");
    });
  }

  activePassesBody.addEventListener("click", async (event) => {
    const exitButton = event.target.closest(".table-exit-btn");
    if (!exitButton) return;

    if (!activePassesAdminPassword) {
      setResult(activePassesResult, "Unlock page first to mark exit.", "error");
      return;
    }

    const passId = String(exitButton.dataset.passId || "").trim();
    const phone = String(exitButton.dataset.phone || "").trim();

    if (!passId) {
      showToast("Pass ID not found", true);
      return;
    }

    try {
      const data = await apiRequest("/markExit", {
        method: "POST",
        headers: {
          "x-admin-password": activePassesAdminPassword,
        },
        body: JSON.stringify({
          passId,
          phone,
        }),
      });

      showToast(data.message || "Exit marked successfully.");
      if (shouldAnnounceExit(data.message)) announceVisitorExited();
      await loadActivePasses(activePassesAdminPassword);
      setResult(activePassesResult, `Exit marked for ${passId}.`, "success");
    } catch (error) {
      if (error.status === 401) {
        setResult(activePassesResult, "Unauthorized", "error");
        showToast("Unauthorized", true);
        lockPanel();
      } else {
        setResult(activePassesResult, error.message, "error");
        showToast(error.message, true);
      }
    }
  });
}

function initTodayVisitorsPage() {
  const todayVisitorsBody = document.getElementById("todayVisitorsBody");
  const refreshTodayBtn = document.getElementById("refreshTodayBtn");

  if (!todayVisitorsBody) return;

  todayVisitorsBody.addEventListener("click", (event) => {
    const exitButton = event.target.closest(".table-exit-btn");
    if (exitButton) {
      const passId = String(exitButton.dataset.passId || "").trim();
      const phone = String(exitButton.dataset.phone || "").trim();

      if (!passId) {
        showToast("Pass ID not found", true);
        return;
      }

      markExitPass(passId, phone)
        .then((data) => {
          showToast(data.message || "Exit marked successfully.");
          if (shouldAnnounceExit(data.message)) announceVisitorExited();
          loadTodayVisitors();
        })
        .catch((error) => {
          showToast(error.message, true);
        });
      return;
    }

    const deleteButton = event.target.closest(".table-delete-btn");
    if (!deleteButton) return;

    const passId = String(deleteButton.dataset.passId || "").trim();
    if (!passId) {
      showToast("Pass ID not found", true);
      return;
    }

    openAuthModal({
      action: "delete",
      title: "Enter security password to delete pass",
      message: `Delete pass ${passId}? This action cannot be undone.`,
      buttonLabel: "Delete Pass",
      passId,
    });
  });

  if (refreshTodayBtn) {
    refreshTodayBtn.addEventListener("click", () => {
      loadTodayVisitors();
    });
  }

  loadTodayVisitors();
}
function chartAxisColor() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() ||
    "#9eb5d8"
  );
}

function chartGridColor() {
  return "rgba(255,255,255,0.12)";
}

function removeKpiLoadingPulse() {
  ["kpiVisitorsToday", "kpiActivePasses", "kpiPeakHour", "kpiRangeVisitors"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("loading-pulse");
  });
}

function updateKpis(todayCount, analyticsData) {
  const kpiVisitorsToday = document.getElementById("kpiVisitorsToday");
  const kpiActivePasses = document.getElementById("kpiActivePasses");
  const kpiPeakHour = document.getElementById("kpiPeakHour");
  const kpiRangeVisitors = document.getElementById("kpiRangeVisitors");

  if (kpiVisitorsToday) kpiVisitorsToday.textContent = String(todayCount || 0);
  if (kpiActivePasses) kpiActivePasses.textContent = String(analyticsData?.activePasses || 0);

  const peak = analyticsData?.peakHour || {};
  if (kpiPeakHour) {
    kpiPeakHour.textContent = peak.count > 0 ? `${peak.label} (${peak.count})` : "-";
  }

  if (kpiRangeVisitors) {
    kpiRangeVisitors.textContent = String(analyticsData?.totalVisitors || 0);
  }

  removeKpiLoadingPulse();
}

function buildOrUpdateAnalyticsCharts(analyticsData) {
  if (!window.Chart) return;

  const trendCanvas = document.getElementById("trendChart");
  const peakCanvas = document.getElementById("peakHoursChart");
  const deptCanvas = document.getElementById("departmentChart");

  if (!trendCanvas || !peakCanvas || !deptCanvas) return;

  const axisColor = chartAxisColor();
  const gridColor = chartGridColor();

  const trendCtx = trendCanvas.getContext("2d");
  const peakCtx = peakCanvas.getContext("2d");
  const deptCtx = deptCanvas.getContext("2d");

  const trendLabels = analyticsData?.trend?.labels || [];
  const trendCounts = analyticsData?.trend?.counts || [];
  const peakLabels = analyticsData?.peakHours?.labels || [];
  const peakCounts = analyticsData?.peakHours?.counts || [];
  const deptLabels = analyticsData?.departments?.labels || [];
  const deptCounts = analyticsData?.departments?.counts || [];

  if (!trendChart) {
    const trendGradient = trendCtx.createLinearGradient(0, 0, 0, 260);
    trendGradient.addColorStop(0, "rgba(51, 203, 255, 0.4)");
    trendGradient.addColorStop(1, "rgba(51, 203, 255, 0.02)");

    trendChart = new Chart(trendCtx, {
      type: "line",
      data: {
        labels: trendLabels,
        datasets: [
          {
            label: "Visitors",
            data: trendCounts,
            borderColor: "#40d2ff",
            backgroundColor: trendGradient,
            tension: 0.34,
            fill: true,
            pointRadius: 2.5,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: axisColor }, grid: { color: gridColor } },
          y: { ticks: { color: axisColor }, grid: { color: gridColor }, beginAtZero: true },
        },
        plugins: {
          legend: { labels: { color: axisColor } },
        },
      },
    });
  } else {
    trendChart.data.labels = trendLabels;
    trendChart.data.datasets[0].data = trendCounts;
    trendChart.options.scales.x.ticks.color = axisColor;
    trendChart.options.scales.y.ticks.color = axisColor;
    trendChart.options.plugins.legend.labels.color = axisColor;
    trendChart.update();
  }

  if (!peakHoursChart) {
    const peakGradient = peakCtx.createLinearGradient(0, 0, 0, 260);
    peakGradient.addColorStop(0, "rgba(47, 210, 255, 0.45)");
    peakGradient.addColorStop(1, "rgba(47, 210, 255, 0.05)");

    peakHoursChart = new Chart(peakCtx, {
      type: "bar",
      data: {
        labels: peakLabels,
        datasets: [
          {
            label: "Visits",
            data: peakCounts,
            backgroundColor: peakGradient,
            borderColor: "#38c7ff",
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: axisColor }, grid: { color: gridColor } },
          y: { ticks: { color: axisColor }, grid: { color: gridColor }, beginAtZero: true },
        },
        plugins: {
          legend: { labels: { color: axisColor } },
        },
      },
    });
  } else {
    peakHoursChart.data.labels = peakLabels;
    peakHoursChart.data.datasets[0].data = peakCounts;
    peakHoursChart.options.scales.x.ticks.color = axisColor;
    peakHoursChart.options.scales.y.ticks.color = axisColor;
    peakHoursChart.options.plugins.legend.labels.color = axisColor;
    peakHoursChart.update();
  }

  if (!departmentChart) {
    departmentChart = new Chart(deptCtx, {
      type: "doughnut",
      data: {
        labels: deptLabels,
        datasets: [
          {
            data: deptCounts,
            backgroundColor: [
              "#3ac7ff",
              "#2f84ff",
              "#78e4ff",
              "#74c8ff",
              "#5f9eff",
              "#44b5dd",
              "#7fd0ff",
            ],
            borderColor: "rgba(5,17,34,0.95)",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: axisColor } },
        },
      },
    });
  } else {
    departmentChart.data.labels = deptLabels;
    departmentChart.data.datasets[0].data = deptCounts;
    departmentChart.options.plugins.legend.labels.color = axisColor;
    departmentChart.update();
  }
}

async function loadAnalytics(rangeDays = analyticsRange) {
  const data = await apiRequest(`/analytics?rangeDays=${encodeURIComponent(rangeDays)}`, {
    method: "GET",
  });
  lastAnalyticsData = data;
  return data;
}

async function loadTodayVisitorsCountOnly() {
  const data = await apiRequest("/todayVisitors", { method: "GET" });
  return data.count || 0;
}

function initAnalyticsPage() {
  const rangeToggle = document.getElementById("analyticsRangeToggle");
  if (!rangeToggle) return;

  const loadAll = async (range) => {
    try {
      const [todayCount, analyticsData] = await Promise.all([
        loadTodayVisitorsCountOnly(),
        loadAnalytics(range),
      ]);

      updateKpis(todayCount, analyticsData);
      buildOrUpdateAnalyticsCharts(analyticsData);
    } catch (error) {
      showToast(error.message, true);
    }
  };

  rangeToggle.addEventListener("click", async (event) => {
    const button = event.target.closest(".range-btn");
    if (!button) return;

    analyticsRange = Number(button.dataset.range || 7);

    rangeToggle.querySelectorAll(".range-btn").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    await loadAll(analyticsRange);
  });

  loadAll(analyticsRange);
}

function renderVipLogs(visitors) {
  const vipLogsBody = document.getElementById("vipLogsBody");
  const vipLogsCount = document.getElementById("vipLogsCount");

  if (!vipLogsBody) return;

  const list = Array.isArray(visitors) ? visitors : [];
  if (vipLogsCount) vipLogsCount.textContent = `${list.length} entries`;

  vipLogsBody.innerHTML = "";

  if (!list.length) {
    vipLogsBody.innerHTML = '<tr><td colspan="6" class="empty-row">No VIP logs yet.</td></tr>';
    return;
  }

  list.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.passId || "-"}</td>
      <td>${item.vipAccessId || "-"}</td>
      <td>${item.name || "-"}</td>
      <td>${item.status || "-"}</td>
      <td>${formatDateTime(item.timeIn)}</td>
      <td>${formatDateTime(item.timeOut)}</td>
    `;
    vipLogsBody.appendChild(row);
  });
}

async function loadVipLogs() {
  try {
    const data = await apiRequest("/vip/logs?limit=50", { method: "GET" });
    renderVipLogs(data.visitors || []);
  } catch (error) {
    showToast(error.message, true);
  }
}

function initVipEntryPage() {
  const vipGenerateForm = document.getElementById("vipGenerateForm");
  const vipIssueForm = document.getElementById("vipIssueForm");
  const vipVerifyForm = document.getElementById("vipVerifyForm");
  const vipCheckoutBtn = document.getElementById("vipCheckoutBtn");
  const refreshVipLogsBtn = document.getElementById("refreshVipLogsBtn");
  const vipVerifyResult = document.getElementById("vipVerifyResult");
  const vipVerifyDetails = document.getElementById("vipVerifyDetails");

  if (vipGenerateForm) {
    vipGenerateForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const label = document.getElementById("vipLabel")?.value.trim() || "VIP";
      const adminPassword = document.getElementById("vipGeneratePassword")?.value.trim() || "";

      try {
        const data = await apiRequest("/vip/generate", {
          method: "POST",
          body: JSON.stringify({ label, adminPassword }),
        });

        const banner = document.getElementById("vipGenerateBanner");
        const output = document.getElementById("generatedVipAccessId");
        if (output) output.textContent = data.vipAccessId || "-";
        if (banner) banner.classList.remove("hidden");

        const vipIssueAccessId = document.getElementById("vipIssueAccessId");
        if (vipIssueAccessId && data.vipAccessId) vipIssueAccessId.value = data.vipAccessId;

        showToast("VIP pass ID generated");
        vipGenerateForm.reset();
      } catch (error) {
        if (error.status === 401) {
          showToast("Unauthorized", true);
        } else {
          showToast(error.message, true);
        }
      }
    });
  }

  if (vipIssueForm) {
    vipIssueForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const vipAccessId = String(document.getElementById("vipIssueAccessId")?.value || "")
        .trim()
        .toUpperCase();

      try {
        const data = await apiRequest("/vip/issue", {
          method: "POST",
          body: JSON.stringify({ vipAccessId }),
        });

        const banner = document.getElementById("vipIssueBanner");
        const output = document.getElementById("issuedVipPassId");
        if (output) output.textContent = data.passId || "-";
        if (banner) banner.classList.remove("hidden");

        showToast("Gate pass issued");
        announceGatePassIssued();
        vipIssueForm.reset();
        loadVipLogs();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  async function runVipVerify() {
    const passId = String(document.getElementById("vipVerifyPassId")?.value || "")
      .trim()
      .toUpperCase();
    const vipAccessId = String(document.getElementById("vipVerifyAccessId")?.value || "")
      .trim()
      .toUpperCase();

    try {
      const data = await apiRequest("/vip/verify", {
        method: "POST",
        body: JSON.stringify({ passId, vipAccessId }),
      });

      setResult(vipVerifyResult, "User authenticated", "success");
      showToast("User authenticated");

      renderDetails(vipVerifyDetails, {
        Name: data.visitor?.name,
        "Gate Pass ID": data.visitor?.passId,
        "VIP Access ID": data.visitor?.vipAccessId,
        Status: data.visitor?.status,
        "Time In": formatDateTime(data.visitor?.timeIn),
        "Time Out": formatDateTime(data.visitor?.timeOut),
      });
    } catch (error) {
      setResult(vipVerifyResult, error.message, "error");
      showToast(error.message, true);
      renderDetails(vipVerifyDetails, {});
    }
  }

  if (vipVerifyForm) {
    vipVerifyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await runVipVerify();
    });
  }

  if (vipCheckoutBtn) {
    vipCheckoutBtn.addEventListener("click", async () => {
      const passId = String(document.getElementById("vipVerifyPassId")?.value || "")
        .trim()
        .toUpperCase();
      const vipAccessId = String(document.getElementById("vipVerifyAccessId")?.value || "")
        .trim()
        .toUpperCase();

      try {
        await apiRequest("/vip/checkout", {
          method: "POST",
          body: JSON.stringify({ passId, vipAccessId }),
        });

        setResult(vipVerifyResult, "VIP visitor checked out", "success");
        showToast("VIP visitor checked out");
        announceVisitorExited();
        await Promise.all([runVipVerify(), loadVipLogs()]);
      } catch (error) {
        setResult(vipVerifyResult, error.message, "error");
        showToast(error.message, true);
      }
    });
  }

  if (refreshVipLogsBtn) {
    refreshVipLogsBtn.addEventListener("click", loadVipLogs);
  }

  loadVipLogs();
}

function initHomeDashboardEffects() {
  const heroAiScene = document.getElementById("heroAiScene");
  if (!heroAiScene) return;

  heroAiScene.querySelectorAll(".ai-node").forEach((node) => node.remove());

  const nodeCount = window.innerWidth < 720 ? 7 : 11;
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < nodeCount; i += 1) {
    const node = document.createElement("span");
    node.className = "ai-node";
    node.style.left = `${Math.random() * 82 + 9}%`;
    node.style.top = `${Math.random() * 74 + 12}%`;
    node.style.setProperty("--delay", `${Math.random() * 3.8}s`);
    node.style.setProperty("--duration", `${Math.random() * 3 + 2.8}s`);
    fragment.appendChild(node);
  }

  heroAiScene.appendChild(fragment);
}

function initThemeChangeChartRefresh() {
  if (!themeSelect) return;

  themeSelect.addEventListener("change", () => {
    setTheme(themeSelect.value);

    if (page === "analytics" && lastAnalyticsData) {
      buildOrUpdateAnalyticsCharts(lastAnalyticsData);
    }
  });
}

function initPage() {
  switch (page) {
    case "home":
      initHomeDashboardEffects();
      break;
    case "check-visitor":
      initCheckVisitorPage();
      break;
    case "issue-pass":
      initIssuePassPage();
      break;
    case "validate-pass":
      initValidatePassPage();
      break;
    case "today-visitors":
      initTodayVisitorsPage();
      break;
    case "active-passes":
      initActivePassesPage();
      break;
    case "analytics":
      initAnalyticsPage();
      break;
    case "vip-entry":
      initVipEntryPage();
      break;
    default:
      break;
  }
}

applySavedTheme();
initVoiceControl();
initThemeChangeChartRefresh();
initClock();
createParticles();
revealSections();
attachModalHandlers();
initPage();
