import axios from "axios";

// No credentials: the app uses no cookies, and the backend's CORS setup does
// not allow credentialed requests (the browser would block every response).
export const axiosClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
    // Default for quick calls; the analysis request (Step 9) sets its own.
    timeout: 15_000,
})
