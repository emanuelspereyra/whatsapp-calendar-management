import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationsPanel } from "./ConversationsPanel";
import * as api from "./api";

const sampleConversation = {
  id: "conv-1",
  clientId: "client-1",
  status: "pending_confirmation",
  lastIntent: null,
  proposedDate: "2026-06-20",
  proposedTime: "10:00",
  proposedDurationMinutes: 60,
  proposedTopic: "Clase de QA",
  suggestedReply: null,
  lastError: null,
  client: { id: "client-1", phone: "5491111111111", name: "Cliente Test" }
};

function mockList() {
  vi.spyOn(api, "fetchConversations").mockResolvedValue({
    data: [sampleConversation],
    pagination: { skip: 0, take: 20, total: 1 }
  });
}

describe("ConversationsPanel", () => {
  it("shows approve/reject actions for admin role", async () => {
    mockList();
    render(<ConversationsPanel token="tok" role="admin" />);

    await waitFor(() => expect(screen.getByText("Cliente Test")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Aprobar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
  });

  it("hides approve/reject actions for viewer role", async () => {
    mockList();
    render(<ConversationsPanel token="tok" role="viewer" />);

    await waitFor(() => expect(screen.getByText("Cliente Test")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument();
  });

  it("shows who managed the conversation when present", async () => {
    vi.spyOn(api, "fetchConversations").mockResolvedValue({
      data: [{ ...sampleConversation, approvedBy: { id: "u1", username: "owner" } }],
      pagination: { skip: 0, take: 20, total: 1 }
    });

    render(<ConversationsPanel token="tok" role="viewer" />);

    expect(await screen.findByText("Aprobado por owner")).toBeInTheDocument();
  });
});
