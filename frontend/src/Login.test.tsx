import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Login } from "./Login";
import * as api from "./api";

describe("Login", () => {
  it("submits credentials and calls onAuthenticated with the login result", async () => {
    vi.spyOn(api, "login").mockResolvedValue({
      token: "tok",
      userId: "u1",
      username: "owner",
      role: "admin"
    });
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();

    const { container } = render(<Login onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText("Usuario"), "owner");
    await user.type(screen.getByLabelText("Contraseña"), "supersecret");
    await user.click(container.querySelector(".auth-submit")!);

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith("tok", "u1", "owner", "admin");
    });
    expect(api.login).toHaveBeenCalledWith("owner", "supersecret");
  });

  it("switches to register mode and shows the invite code field", async () => {
    const user = userEvent.setup();
    render(<Login onAuthenticated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Registrarse" }));

    expect(screen.getByLabelText("Código de invitación")).toBeInTheDocument();
  });

  it("shows the error message when login fails", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new Error("Credenciales inválidas"));
    const user = userEvent.setup();

    const { container } = render(<Login onAuthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText("Usuario"), "owner");
    await user.type(screen.getByLabelText("Contraseña"), "incorrect-secret");
    await user.click(container.querySelector(".auth-submit")!);

    expect(await screen.findByText("Credenciales inválidas")).toBeInTheDocument();
  });
});
