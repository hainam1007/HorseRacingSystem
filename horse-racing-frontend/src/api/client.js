import { clearSession, getAuthToken } from "../auth/authStorage";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function getRequestBaseUrl(path) {
  if (!path.startsWith("/users")) {
    return API_BASE_URL;
  }

  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return "";
  }
}

export class ApiError extends Error {
  constructor(message, details = [], status = 0) {
    super(message);
    this.name = "ApiError";
    this.details = details;
    this.status = status;
  }
}

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("Invalid API response", [], response.status);
  }
}

export async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const baseUrl = getRequestBaseUrl(path);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseResponse(response);

  if (!response.ok || payload.success === false) {
    if (response.status === 401) {
      clearSession();
      window.dispatchEvent(new CustomEvent("horse-racing-auth-invalid"));
    }

    throw new ApiError(payload.message || "API request failed", payload.details || [], response.status);
  }

  return payload.data ?? payload;
}
