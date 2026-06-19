import type { ConversationRepository, MessageCreate } from "../conversations/ConversationRepository";

export class MessageService {
  constructor(private readonly repository: ConversationRepository) {}

  async save(input: MessageCreate) {
    return this.repository.appendMessage(input);
  }
}
