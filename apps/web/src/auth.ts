const AUTH_KEY = "predixa_authed";
const USER_KEY = "predixa_user";

export type PredixaUser = {
  name: string;
  email: string;
  createdAtISO: string;
};

export function isAuthed(): boolean {
  return localStorage.getItem(AUTH_KEY) === "true";
}

export function getUser(): PredixaUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PredixaUser;
  } catch {
    return null;
  }
}

export function signupMock(name: string, email: string, password: string): boolean {
  if (name.trim().length < 2) return false;
  if (!email.includes("@")) return false;
  if (password.trim().length < 6) return false;

  const user: PredixaUser = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    createdAtISO: new Date().toISOString(),
  };

  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(AUTH_KEY, "true");
  return true;
}

export function loginMock(email: string, password: string): boolean {
  if (!email.includes("@")) return false;
  if (password.trim().length < 4) return false;

  const user = getUser();
  if (!user) return false;
  if (user.email !== email.trim().toLowerCase()) return false;

  localStorage.setItem(AUTH_KEY, "true");
  return true;
}

export function logoutMock() {
  localStorage.removeItem(AUTH_KEY);
  // Keep USER_KEY so account remains "remembered" on the device
}
