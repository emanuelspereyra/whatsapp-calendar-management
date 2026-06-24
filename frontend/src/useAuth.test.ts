import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./useAuth";

function fakeToken(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: "u1", username: "owner", role: "admin", exp }));
  return `${header}.${payload}.signature`;
}

describe("useAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no session when localStorage is empty", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.token).toBe("");
  });

  it("ignores an already-expired token found in localStorage on init", () => {
    const expired = fakeToken(Math.floor(Date.now() / 1000) - 60);
    localStorage.setItem("auth-token", expired);

    const { result } = renderHook(() => useAuth());

    expect(result.current.token).toBe("");
  });

  it("setSession stores the token, userId, username and role", () => {
    const { result } = renderHook(() => useAuth());
    const token = fakeToken(Math.floor(Date.now() / 1000) + 3600);

    act(() => {
      result.current.setSession(token, "u1", "owner", "admin");
    });

    expect(result.current.token).toBe(token);
    expect(result.current.userId).toBe("u1");
    expect(result.current.username).toBe("owner");
    expect(result.current.role).toBe("admin");
    expect(localStorage.getItem("auth-token")).toBe(token);
  });

  it("automatically logs out once the token expires", () => {
    const { result } = renderHook(() => useAuth());
    const token = fakeToken(Math.floor(Date.now() / 1000) + 5);

    act(() => {
      result.current.setSession(token, "u1", "owner", "admin");
    });
    expect(result.current.token).toBe(token);

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(result.current.token).toBe("");
  });

  it("logout clears the session immediately", () => {
    const { result } = renderHook(() => useAuth());
    const token = fakeToken(Math.floor(Date.now() / 1000) + 3600);

    act(() => {
      result.current.setSession(token, "u1", "owner", "admin");
    });
    act(() => {
      result.current.logout();
    });

    expect(result.current.token).toBe("");
    expect(localStorage.getItem("auth-token")).toBeNull();
  });
});
