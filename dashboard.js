// Load user name from login
document.getElementById("displayName").innerText =
  localStorage.getItem("loggedInUser") || "User";

// GLOBAL STORAGE
let donations = [];
let mentorship = [];
let alumni = [];

// LOAD CSV FILES
function loadCSV(file, callback) {
  Papa.parse(file, {
    download: true,
    header: true,
    complete: function(results) {
      callback(results.data);
    }
  });
}

loadCSV("Donation.csv", data => {
  donations = data;
  loadCSV("Mentorship.csv", data => {
    mentorship = data;
    loadCSV("Alumni.csv", data => {
      alumni = data;
      processDashboard();
    });
  });
});

// MAIN DASHBOARD LOGIC
function processDashboard() {
  const userEmail = localStorage.getItem("loggedInUser");
  const user = alumni.find(a => a.Email === userEmail);

  if (!user) return alert("User not found in Alumni.csv");

  // Engagement Score Example Formula
  let score = 0;
  if (user.EventParti) score += parseInt(user.EventParti) * 10;
  if (user.Mentorship === "Yes") score += 20;
  if (parseFloat(user.DonationAmt) > 0) score += 20;

  document.getElementById("engagementScore").innerText = score + "%";

  // Event Participation
  document.getElementById("eventParticipation").innerText =
    (user.EventParti || "0") + " Events Attended";

  // Mentorship Status
  document.getElementById("mentorshipStatus").innerText =
    user.Mentorship === "Yes" ? "Currently Mentored ✅" : "No Mentor Assigned ❌";

  // Donation Summary
  const totalDonation = donations
    .filter(d => d.Email === userEmail)
    .reduce((sum, d) => sum + parseFloat(d.Amount || 0), 0);

  document.getElementById("donationSummary").innerText =
    "$" + totalDonation.toFixed(2);

  drawDonationChart();
  drawMentorshipChart();
}

// Chart 1: Donation Trend
function drawDonationChart() {
  const userEmail = localStorage.getItem("loggedInUser");
  const userDonations = donations.filter(d => d.Email === userEmail);

  const labels = userDonations.map(d => d.Date);
  const amounts = userDonations.map(d => parseFloat(d.Amount));

  new Chart(document.getElementById("donationChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Donations ($)",
        data: amounts,
        borderColor: "#007bff",
        fill: false
      }]
    }
  });
}

// Chart 2: Mentorship Requests by Field
function drawMentorshipChart() {
  const fieldCounts = {};
  mentorship.forEach(m => {
    if (!fieldCounts[m.Field]) fieldCounts[m.Field] = 0;
    fieldCounts[m.Field]++;
  });

  new Chart(document.getElementById("mentorshipChart"), {
    type: "bar",
    data: {
      labels: Object.keys(fieldCounts),
      datasets: [{
        label: "Requests",
        data: Object.values(fieldCounts),
        backgroundColor: "#28a745"
      }]
    }
  });
}
