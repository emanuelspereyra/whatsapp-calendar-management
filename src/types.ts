export type ServiceStatus = "ok" | "degraded" | "down";

export type DependencyHealth = {
  status: ServiceStatus;
  message: string;
};

export type ConversationMessageContext = {
  direction: "inbound" | "outbound" | "system";
  type: "text" | "audio" | "system";
  content: string;
  timestamp: Date;
};

export type SchedulingContext = {
  phone: string;
  timezone: string;
  now: Date;
  messages: ConversationMessageContext[];
};
