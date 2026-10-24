export type Profile = {
  id: string;
  display_name: string;
  avatar_emoji: string;
  avatar_color: string;
  city: string;
  theme_accent?: string;
  theme_mode?: string;
};

export type Space = {
  id: string;
  name: string;
  invite_code: string;
  city: string;
  created_by: string | null;
  rule222_enabled: boolean;
  rule222_start: string; // YYYY-MM-DD
  /** Свой ритм: свидание раз в N недель, новое место раз в N месяцев, страна раз в N лет */
  rule_date_weeks: number;
  rule_place_months: number;
  rule_country_years: number;
  created_at: string;
};

export type Member = {
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
};

export type ItemKind = 'watch' | 'recipe' | 'weekend' | 'shopping';
export type WatchStatus = 'want' | 'watching' | 'watched';
export type MediaType = 'movie' | 'series';

export type Item = {
  id: string;
  space_id: string;
  kind: ItemKind;
  title: string;
  note: string;
  url: string | null;
  image_url: string | null;
  media_type: MediaType | null;
  status: WatchStatus | null;
  category: string | null;
  tags: string[];
  place: string | null;
  event_date: string | null;
  end_date: string | null;
  quantity: string | null;
  done: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ItemWithLikes = Item & { likes: string[]; dislikes: string[] };

export type SavingsGoal = {
  id: string;
  space_id: string;
  title: string;
  emoji: string;
  target_amount: number;
  created_by: string | null;
  created_at: string;
};

export type Contribution = {
  id: string;
  goal_id: string;
  space_id: string;
  user_id: string | null;
  amount: number;
  note: string;
  contributed_on: string;
  created_at: string;
};

export type GoalWithProgress = SavingsGoal & { saved: number; contributions: Contribution[] };

export type WishItem = {
  id: string;
  space_id: string;
  owner_id: string;
  title: string;
  url: string | null;
  price: number | null;
  occasion: string | null;
  note: string;
  image_url: string | null;
  created_at: string;
};

export type WishClaim = {
  item_id: string;
  space_id: string;
  claimed_by: string;
  created_at: string;
};

export type RuleKind = 'date' | 'place' | 'country';

export type RuleEvent = {
  id: string;
  space_id: string;
  kind: RuleKind;
  title: string;
  note: string;
  done_on: string;
  created_by: string | null;
  created_at: string;
};

export type RealtimeTable =
  | 'spaces'
  | 'space_members'
  | 'profiles'
  | 'items'
  | 'item_likes'
  | 'savings_goals'
  | 'savings_contributions'
  | 'wishlist_items'
  | 'wishlist_claims'
  | 'rule_events'
  | 'calendar_events'
  | 'messages'
  | 'message_reads'
  | 'attachments';

export type CalendarKind = 'event' | 'task' | 'date';

export type CalendarEvent = {
  id: string;
  space_id: string;
  kind: CalendarKind;
  title: string;
  note: string;
  url: string | null;
  emoji: string | null;
  starts_on: string | null; // YYYY-MM-DD
  start_time: string | null; // HH:MM[:SS]
  end_time: string | null;
  yearly: boolean;
  assignee: string | null;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  space_id: string;
  sender_id: string;
  body: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  image_width: number | null;
  image_height: number | null;
  created_at: string;
};

export type MessageRead = { space_id: string; user_id: string; last_read_at: string };

export type AttachmentParent = 'item' | 'event' | 'rule_event';
export type AttachmentKind = 'photo' | 'file' | 'link';

export type Attachment = {
  id: string;
  space_id: string;
  parent_type: AttachmentParent;
  parent_id: string;
  kind: AttachmentKind;
  storage_path: string | null;
  url: string | null;
  name: string;
  mime: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  created_by: string | null;
  created_at: string;
};
