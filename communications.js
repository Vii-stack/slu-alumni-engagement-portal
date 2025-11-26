/**
 * Automated Communication Module
 * Generates in-app notifications based on portal activity.
 * Data is stored per user under localStorage key communications:<email>
 */

(function () {
  const COMMUNICATION_PREFIX = "communications";
  const LAST_RUN_PREFIX = "communications:lastRun";
  const GLOBAL_DONATION_KEY = "alumniFeedback:global"; // keep for potential cross-component use (not used here but reserved)
  const DEEP_BLUE = "#0b3d91";

  function getCurrentEmail() {
    return (localStorage.getItem("profileEmail") || localStorage.getItem("loggedInUser") || "").toLowerCase();
  }

  function getCommunicationsKey(email) {
    return `${COMMUNICATION_PREFIX}:${email || "anonymous"}`;
  }

  function getLastRunKey(email) {
    return `${LAST_RUN_PREFIX}:${email || "anonymous"}`;
  }

  function loadCommunications(email) {
    try {
      return JSON.parse(localStorage.getItem(getCommunicationsKey(email)) || "[]");
    } catch (err) {
      console.warn("Unable to parse communications", err);
      return [];
    }
  }

  function saveCommunications(email, communications) {
    localStorage.setItem(getCommunicationsKey(email), JSON.stringify(communications));
  }

  function upsertCommunication(list, message) {
    const existingIndex = list.findIndex(item => item.id === message.id);
    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...message };
    } else {
      list.push(message);
    }
  }

  function createCommunication({ id, subject, body, category }) {
    return {
      id,
      subject,
      body,
      category,
      read: false,
      date: new Date().toISOString()
    };
  }

  function parseDate(value) {
    if (!value) return null;
    const direct = new Date(value);
    if (!isNaN(direct)) return direct;
    const parts = value.split("/");
    if (parts.length === 3) {
      const dt = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
      return isNaN(dt) ? null : dt;
    }
    return null;
  }

  function loadCSV(path) {
    return new Promise((resolve, reject) => {
      if (!window.Papa) {
        reject(new Error("PapaParse library is required for CSV parsing."));
        return;
      }
      Papa.parse(path, {
        download: true,
        header: true,
        complete: results => resolve(results.data.filter(row => Object.values(row).some(v => v))),
        error: reject
      });
    });
  }

  async function generateEventReminders(email, communications) {
    try {
      const events = await loadCSV("./data/Event.csv");
      const today = new Date();
      const twoWeeks = 14 * 24 * 60 * 60 * 1000;
      const upcoming = events
        .map(event => ({ event, date: parseDate(event.EventDate) }))
        .filter(item => item.date && item.date >= today && item.date - today <= twoWeeks)
        .sort((a, b) => a.date - b.date)
        .slice(0, 3);

      upcoming.forEach(({ event, date }) => {
        const eventId = `event-${event.EventID || `${event.EventName}-${event.EventDate}`}`;
        const subject = `Upcoming Event: ${event.EventName || "Alumni Event"}`;
        const location = event.Location ? ` at ${event.Location}` : "";
        const body = `Don't miss ${event.EventName || "this alumni event"} on ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}${location}. Tap “Events” to confirm your spot.`;
        upsertCommunication(communications, createCommunication({
          id: eventId,
          subject,
          body,
          category: "events"
        }));
      });
    } catch (err) {
      console.warn("Unable to generate event reminders", err);
    }
  }

  async function generateDonationPrompt(email, communications) {
    try {
      const [donations, alumni] = await Promise.all([
        loadCSV("./data/Donation.csv"),
        loadCSV("./data/Alumni.csv")
      ]);
      const alumniRow = alumni.find(row => (row.Email || "").toLowerCase() === email);
      const alumniId = alumniRow ? alumniRow.AlumniID : null;
      const myDonations = alumniId ? donations.filter(row => row.AlumniID === alumniId) : [];
      const localDonations = JSON.parse(localStorage.getItem(`localDonations:${email}`) || "[]").map(entry => ({
        DonationAmount: entry.amount,
        DonationDate: entry.date
      }));
      const combined = myDonations.concat(localDonations);
      const donationGoal = parseFloat(localStorage.getItem("donationGoal") || "1000");
      const totalGiven = combined.reduce((sum, row) => sum + (parseFloat(row.DonationAmount) || 0), 0);
      const goalId = "donation-goal-reminder";

      if (totalGiven >= donationGoal) {
        upsertCommunication(communications, createCommunication({
          id: goalId,
          subject: "You hit your annual giving goal!",
          body: "Phenomenal generosity—thank you for completing this year’s goal. Consider setting a stretch target or supporting a new campaign.",
          category: "donations",
          read: false
        }));
      } else {
        const remaining = donationGoal - totalGiven;
        upsertCommunication(communications, createCommunication({
          id: goalId,
          subject: "Keep your giving goal on track",
          body: `You're $${remaining.toFixed(2)} away from your annual goal. A quick gift puts you right back on pace.`,
          category: "donations",
          read: false
        }));
      }
    } catch (err) {
      console.warn("Unable to generate donation prompts", err);
    }
  }

  function generateMentorshipPrompt(email, communications) {
    const mentorOffers = JSON.parse(localStorage.getItem("mentorOffers") || "{}");
    const globalOffers = JSON.parse(localStorage.getItem("mentorOffersGlobal") || "[]");
    const hasOffers = Array.isArray(globalOffers) ? globalOffers.length > 0 : Object.keys(mentorOffers).length > 0;
    const offerId = "mentorship-offer-reminder";
    if (hasOffers) {
      upsertCommunication(communications, createCommunication({
        id: offerId,
        subject: "Mentors are ready to help",
        body: "New mentor availability has been logged this week. Submit a mentorship request or connect with a new mentee today.",
        category: "mentorship"
      }));
    } else {
      upsertCommunication(communications, createCommunication({
        id: offerId,
        subject: "Become a founding mentor",
        body: "Be among the first mentors in the network. Share your focus area on the Mentorship page to help newer alumni thrive.",
        category: "mentorship"
      }));
    }
  }

  async function generateAutomatedCommunications() {
    const email = getCurrentEmail();
    if (!email) return [];

    const todayKey = new Date().toISOString().slice(0, 10);
    const lastRunKey = getLastRunKey(email);
    const lastRunDate = localStorage.getItem(lastRunKey);
    let communications = loadCommunications(email);

    if (lastRunDate !== todayKey) {
      await Promise.all([
        generateEventReminders(email, communications),
        generateDonationPrompt(email, communications)
      ]);
      generateMentorshipPrompt(email, communications);

      saveCommunications(email, communications);
      localStorage.setItem(lastRunKey, todayKey);
    }

    return loadCommunications(email);
  }

  function markCommunicationRead(id, read) {
    const email = getCurrentEmail();
    const communications = loadCommunications(email);
    const index = communications.findIndex(item => item.id === id);
    if (index >= 0) {
      communications[index].read = read;
      saveCommunications(email, communications);
    }
    return communications;
  }

  function deleteCommunication(id) {
    const email = getCurrentEmail();
    const communications = loadCommunications(email).filter(item => item.id !== id);
    saveCommunications(email, communications);
    return communications;
  }

  function renderCommunicationsPreview(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const email = getCurrentEmail();
    const communications = loadCommunications(email);
    const unreadOnly = options.unreadOnly || false;
    const limit = options.limit || communications.length;

    let list = communications.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    if (unreadOnly) {
      list = list.filter(item => !item.read);
    }
    if (!list.length) {
      container.innerHTML = "<p style='color:#475569;'>No messages right now. Check back soon for automated updates.</p>";
      return;
    }
    const truncated = list.slice(0, limit);
    container.innerHTML = truncated.map(item => `
      <div style="padding:12px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px;">
        <div>
          <div style="font-weight:600;color:${item.read ? "#475569" : DEEP_BLUE}">${item.subject}</div>
          <div style="font-size:13px;color:#4b5563;margin-top:4px;">${item.body}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${new Date(item.date).toLocaleString()}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button data-comm-id="${item.id}" data-action="${item.read ? "unread" : "read"}" style="border:none;background:${item.read ? "#e2e8f0" : DEEP_BLUE};color:${item.read ? "#1f2937" : "#fff"};padding:6px 10px;border-radius:8px;font-size:12px;cursor:pointer;">
            Mark as ${item.read ? "Unread" : "Read"}
          </button>
          <button data-comm-id="${item.id}" data-action="delete" style="border:none;background:#fee2e2;color:#b91c1c;padding:6px 10px;border-radius:8px;font-size:12px;cursor:pointer;">
            Dismiss
          </button>
        </div>
      </div>
    `).join("");

    container.querySelectorAll("button[data-comm-id]").forEach(button => {
      button.addEventListener("click", event => {
        const id = button.getAttribute("data-comm-id");
        const action = button.getAttribute("data-action");
        let updated = [];
        if (action === "read") {
          updated = markCommunicationRead(id, true);
        } else if (action === "unread") {
          updated = markCommunicationRead(id, false);
        } else if (action === "delete") {
          updated = deleteCommunication(id);
        }
        renderCommunicationsPreview(containerId, options);
      });
    });
  }

  function renderCommunicationsTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const communications = loadCommunications(getCurrentEmail()).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!communications.length) {
      container.innerHTML = "<p>No communications generated yet.</p>";
      return;
    }
    container.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="text-align:left;background:#f8fafc;color:#1e293b;">
            <th style="padding:10px;border-bottom:1px solid #e2e8f0;">Subject</th>
            <th style="padding:10px;border-bottom:1px solid #e2e8f0;">Category</th>
            <th style="padding:10px;border-bottom:1px solid #e2e8f0;">Status</th>
            <th style="padding:10px;border-bottom:1px solid #e2e8f0;">Sent</th>
            <th style="padding:10px;border-bottom:1px solid #e2e8f0;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${communications.map(item => `
            <tr>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;">
                <div style="font-weight:600;color:${DEEP_BLUE};margin-bottom:4px;">${item.subject}</div>
                <div style="color:#475569;font-size:13px;">${item.body}</div>
              </td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${item.category}</td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${item.read ? "Read" : "Unread"}</td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${new Date(item.date).toLocaleString()}</td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;">
                <button data-comm-id="${item.id}" data-action="${item.read ? "unread" : "read"}" style="border:none;background:${item.read ? "#e2e8f0" : DEEP_BLUE};color:${item.read ? "#1f2937" : "#fff"};padding:6px 10px;border-radius:8px;cursor:pointer;font-size:12px;">
                  Mark as ${item.read ? "Unread" : "Read"}
                </button>
                <button data-comm-id="${item.id}" data-action="delete" style="border:none;background:#fee2e2;color:#b91c1c;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:12px;margin-left:6px;">
                  Delete
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    container.querySelectorAll("button[data-comm-id]").forEach(button => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-comm-id");
        const action = button.getAttribute("data-action");
        if (action === "read") {
          markCommunicationRead(id, true);
        } else if (action === "unread") {
          markCommunicationRead(id, false);
        } else if (action === "delete") {
          deleteCommunication(id);
        }
        renderCommunicationsTable(containerId);
      });
    });
  }

  window.AutomatedCommunications = {
    generateAutomatedCommunications,
    renderCommunicationsPreview,
    renderCommunicationsTable,
    loadCommunications
  };
})();

