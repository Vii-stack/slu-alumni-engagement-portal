// API Client for Alumni Portal
const API_BASE_URL = 'http://localhost:3000/api';

// Helper function to get auth token
function getAuthToken() {
    return localStorage.getItem('authToken');
}

// Helper function to set auth token
function setAuthToken(token) {
    localStorage.setItem('authToken', token);
}

// Helper function to remove auth token
function removeAuthToken() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
}

// Helper function to check if user is logged in
function isLoggedIn() {
    return !!getAuthToken();
}

// Helper function to redirect to login if not authenticated
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// API Request Helper
async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                removeAuthToken();
                window.location.href = 'index.html';
                return null;
            }
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Authentication API
const authAPI = {
    async register(userData) {
        const response = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        if (response) {
            setAuthToken(response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
        }
        return response;
    },

    async login(email, password) {
        const response = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (response) {
            setAuthToken(response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
        }
        return response;
    },

    logout() {
        removeAuthToken();
    }
};

// User API
const userAPI = {
    async getProfile() {
        return await apiRequest('/user/profile');
    },

    async updateProfile(profileData) {
        return await apiRequest('/user/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }
};

// Events API
const eventsAPI = {
    async getAll() {
        return await apiRequest('/events');
    },

    async getById(id) {
        return await apiRequest(`/events/${id}`);
    },

    async register(eventId) {
        return await apiRequest(`/events/${eventId}/register`, {
            method: 'POST'
        });
    },

    async getMyRegistrations() {
        return await apiRequest('/events/registrations/my');
    }
};

// Mentors API
const mentorsAPI = {
    async getAll() {
        return await apiRequest('/mentors');
    },

    async getById(id) {
        return await apiRequest(`/mentors/${id}`);
    },

    async requestMentor(mentorId, data) {
        return await apiRequest(`/mentors/${mentorId}/request`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async getMyRequests() {
        return await apiRequest('/mentors/requests/my');
    }
};

// Donations API
const donationsAPI = {
    async create(donationData) {
        return await apiRequest('/donations', {
            method: 'POST',
            body: JSON.stringify(donationData)
        });
    },

    async getMyDonations() {
        return await apiRequest('/donations/my');
    }
};

// Feedback API
const feedbackAPI = {
    async create(message) {
        return await apiRequest('/feedback', {
            method: 'POST',
            body: JSON.stringify({ message })
        });
    },

    async getMyFeedback() {
        return await apiRequest('/feedback/my');
    }
};

// Dashboard API
const dashboardAPI = {
    async getStats() {
        return await apiRequest('/dashboard/stats');
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        authAPI,
        userAPI,
        eventsAPI,
        mentorsAPI,
        donationsAPI,
        feedbackAPI,
        dashboardAPI,
        isLoggedIn,
        requireAuth,
        getAuthToken,
        removeAuthToken
    };
}
function requestMentorship(mentorName) {
  localStorage.setItem("selectedMentor", mentorName);
  alert(`Mentorship request sent to ${mentorName}!`);
}

function submitFeedback() {
  const msg = document.getElementById("feedbackInput").value;
  let feedbackList = JSON.parse(localStorage.getItem("feedbackList")) || [];
  feedbackList.push(msg);
  localStorage.setItem("feedbackList", JSON.stringify(feedbackList));
  alert("Feedback submitted successfully!");
}

function recordDonation(amount) {
  localStorage.setItem("lastDonation", amount);
  alert(`Thank you for donating $${amount}!`);
}

