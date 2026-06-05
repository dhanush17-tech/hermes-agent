export type NotificationPriority = "low" | "medium" | "high" | "urgent";

export type NotificationType =
  | "risk"
  | "approval"
  | "brief"
  | "reminder"
  | "research_update"
  | "system";

export type NotificationAction = {
  id: string;
  label: string;
  command: string;
  requiresApproval?: boolean;
};

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  score: number;
  relatedProjectId?: string;
  relatedPersonId?: string;
  actionOptions?: NotificationAction[];
  dedupeKey?: string;
  expiresAt?: string;
  createdAt: string;
};

export type DispatchResult = {
  sent: boolean;
  channel: string;
  reason?: string;
};
