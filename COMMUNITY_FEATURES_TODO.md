# Community Feature Implementation TODO

> Scope: This document defines **implementation steps, APIs, and checklist items only**.  
> ❌ No TypeScript / frontend / backend code included.  
> ✅ Focused on system design, endpoints, DB changes, and execution order.

---

## 0. Current Status (Baseline)

- [x] Channel & DM thread architecture
- [x] WebSocket real-time messaging
- [x] Basic message send / receive
- [x] Channel creation & DM initiation
- [x] 3-column UI layout (sidebar / messages / info)

---

## 1. Supabase File & Image Uploads

### 1.1 Supabase Setup
- [x] Supabase project created
- [x] Storage bucket created (`community-files`)
- [x] Public read policy enabled
- [x] Authenticated upload policy enabled
- [x] Backend service role key configured
- [x] Frontend publishable key configured

### 1.2 Backend Upload Flow
- [ ] Add authenticated upload endpoint
- [ ] Enforce max file size (10MB)
- [ ] Validate MIME types (image/*, pdf, zip, etc.)
- [ ] Upload file to Supabase bucket
- [ ] Return public URL + metadata
- [ ] Log failed uploads

### 1.3 Message Attachments
- [ ] Create `community_message_attachments` table
- [ ] Persist attachment metadata on message send
- [ ] Support multiple attachments per message
- [ ] Support image preview thumbnails
- [ ] Support non-image file download links

### 1.4 Frontend UX
- [ ] Drag & drop upload
- [ ] Upload progress indicator
- [ ] Preview before send
- [ ] Error handling (file too large / unsupported type)

---

## 2. Telegram-Style Message Replies (Quoted Replies)

### 2.1 Database
- [x] Add `reply_to_message_id` to messages table
- [x] Index on `reply_to_message_id`

### 2.2 Message Creation
- [ ] Allow optional `replyToMessageId` in send message API
- [ ] Validate replied message exists in same thread
- [ ] Store reference only (no thread fork)

### 2.3 Message Fetching
- [ ] When fetching messages, include:
  - replied message id
  - replied message snippet (text / sender)
- [ ] Handle deleted replied messages gracefully

### 2.4 UI Behavior
- [ ] Show quoted message preview above message body
- [ ] Clicking quote scrolls to original message
- [ ] Highlight original message temporarily
- [ ] Show fallback if original message is deleted

---

## 3. Infinite Scroll & Pagination

### 3.1 Backend Pagination
- [ ] Cursor-based pagination (before / after)
- [ ] Limit default = 50 messages
- [ ] Index messages by `(thread_id, created_at DESC)`
- [ ] Support loading older messages
- [ ] Support loading newer messages (missed events)

### 3.2 Frontend Behavior
- [ ] Load latest messages on open
- [ ] Fetch older messages on scroll up
- [ ] Maintain scroll position when prepending
- [ ] Show loading indicator
- [ ] Handle end-of-history state

---

## 4. Message Reactions (Emoji)

### 4.1 Database
- [x] Create `community_message_reactions` table
- [x] Enforce unique (message, user, emoji)

### 4.2 Backend APIs
- [ ] Add reaction to message
- [ ] Remove reaction from message
- [ ] Fetch aggregated reactions per message
- [ ] Broadcast reaction add/remove via WebSocket

### 4.3 Frontend UX
- [ ] Hover reaction picker
- [ ] Toggle own reactions
- [ ] Show reaction counts
- [ ] Show who reacted (tooltip)

---

## 5. Message Editing & Deletion

### 5.1 Database
- [x] Add `is_edited`, `edited_at`
- [x] Add `is_deleted`, `deleted_at`

### 5.2 Permissions
- [ ] Allow sender to edit own messages
- [ ] Allow moderators/admins to delete messages
- [ ] Prevent editing after delete

### 5.3 APIs
- [ ] Edit message endpoint
- [ ] Soft-delete message endpoint
- [ ] Broadcast edit/delete events

### 5.4 UI
- [ ] Edited label on messages
- [ ] Deleted message placeholder
- [ ] Context menu (edit / delete)

---

## 6. Unread Messages & Read Receipts

### 6.1 Database
- [x] Create `community_unread_messages` table

### 6.2 Backend Logic
- [ ] Increment unread count on new message
- [ ] Reset unread count when thread opened
- [ ] Track last read message id
- [ ] Exclude own messages from unread count

### 6.3 APIs
- [ ] Mark thread as read
- [ ] Fetch unread summary (all threads)
- [ ] Fetch unread count per thread

### 6.4 UI
- [ ] Unread badge on channels
- [ ] Bold unread threads
- [ ] Auto-mark read on focus

---

## 7. Typing Indicators (Realtime Only)

### 7.1 WebSocket Events
- [ ] typing:start (threadId, userId)
- [ ] typing:stop (threadId, userId)

### 7.2 Behavior
- [ ] Broadcast typing status to thread members
- [ ] Auto-timeout typing after inactivity
- [ ] Do not persist typing state in DB

### 7.3 UI
- [ ] “User is typing…” indicator
- [ ] Support multiple users typing

---

## 8. Channel Roles & Permissions

### 8.1 Database
- [x] Add permissions JSON to thread members
- [x] Create channel roles table

### 8.2 Permission Types
- [ ] can_post
- [ ] can_invite
- [ ] can_delete_messages
- [ ] can_pin_messages
- [ ] can_manage_roles

### 8.3 Backend Enforcement
- [ ] Validate permissions on every action
- [ ] Role inheritance resolution
- [ ] Owner/admin override

### 8.4 UI
- [ ] Role assignment UI
- [ ] Permission-aware buttons

---

## 9. Pinned Messages

### 9.1 Database
- [x] Create pinned messages table

### 9.2 APIs
- [ ] Pin message
- [ ] Unpin message
- [ ] Fetch pinned messages per thread

### 9.3 UI
- [ ] Pinned messages section
- [ ] Jump to pinned message
- [ ] Permission check for pinning

---

## 10. User Presence (Online / Offline)

### 10.1 Database
- [x] Create user presence table

### 10.2 Backend
- [ ] Update presence on WebSocket connect
- [ ] Update last seen on disconnect
- [ ] Heartbeat mechanism

### 10.3 UI
- [ ] Online indicator
- [ ] Last seen timestamp
- [ ] Status selector (online / away / busy)

---

## 11. Notifications

### 11.1 Triggers
- [ ] New message in inactive thread
- [ ] @mention
- [ ] Reply to your message

### 11.2 Types
- [ ] In-app notifications
- [ ] Badge counts
- [ ] (Optional) Email / Push later

---

## 12. Message Formatting

### 12.1 Features
- [ ] Markdown support
- [ ] Inline code
- [ ] Code blocks
- [ ] Links
- [ ] Emojis

### 12.2 Security
- [ ] Sanitize HTML
- [ ] Prevent XSS

---

## 13. Mentions (@user, @channel)

### 13.1 Parsing
- [ ] Detect @mentions in message body
- [ ] Resolve user ids

### 13.2 Behavior
- [ ] Highlight mentions
- [ ] Notify mentioned users
- [ ] Mention autocomplete

---

## 14. Message Search

### 14.1 Backend
- [ ] Full-text search index
- [ ] Search by keyword
- [ ] Filter by user / date

### 14.2 UI
- [ ] Search bar
- [ ] Jump to message result
- [ ] Highlight matches

---

## 15. Final Hardening

- [ ] Rate limiting
- [ ] Audit logs (moderation actions)
- [ ] Error handling & retries
- [ ] Load testing
- [ ] Security review
- [ ] API documentation

---

## 16. Release Phases (Suggested)

1. Core Messaging + Files + Replies
2. Reactions + Pagination + Unread
3. Permissions + Editing + Pinned
4. Presence + Typing + Mentions
5. Search + Notifications + Polish

---


# Community System – Full Backend Specification (DB, APIs, WebSocket)

> This document is a **complete low-level specification** of the community system.  
> It includes **database tables**, **REST endpoints**, and **WebSocket events**.  
> ❌ No implementation code  
> ✅ Purely architectural & operational reference

---

# 1. DATABASE LAYER

## 1.1 Core Tables

### community_threads
Represents channels and DMs.

- id (UUID, PK)
- type (`channel` | `dm`)
- name (TEXT, nullable for DMs)
- created_by (UUID → users.id)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- is_archived (BOOLEAN)

Indexes:
- (type)
- (created_at)

---

### community_thread_members
Users participating in threads.

- id (UUID, PK)
- thread_id (UUID → community_threads.id)
- user_id (UUID → users.id)
- role (TEXT, nullable)
- permissions (JSONB)
- joined_at (TIMESTAMP)
- last_seen_at (TIMESTAMP)

Constraints:
- UNIQUE (thread_id, user_id)

Indexes:
- (user_id)
- (thread_id)

---

### community_messages
All messages (channel + DM).

- id (UUID, PK)
- thread_id (UUID → community_threads.id)
- sender_id (UUID → users.id)
- body (TEXT)
- reply_to_message_id (UUID → community_messages.id, nullable)
- is_edited (BOOLEAN)
- edited_at (TIMESTAMP)
- is_deleted (BOOLEAN)
- deleted_at (TIMESTAMP)
- created_at (TIMESTAMP)

Indexes:
- (thread_id, created_at DESC)
- (reply_to_message_id)
- (sender_id)

---

## 1.2 Attachments & Media

### community_message_attachments
Metadata for Supabase-hosted files.

- id (UUID, PK)
- message_id (UUID → community_messages.id)
- file_name (TEXT)
- file_url (TEXT)
- file_size (BIGINT)
- mime_type (TEXT)
- thumbnail_url (TEXT, nullable)
- width (INTEGER, nullable)
- height (INTEGER, nullable)
- created_at (TIMESTAMP)

Indexes:
- (message_id)

---

## 1.3 Reactions

### community_message_reactions
Emoji reactions per message.

- id (UUID, PK)
- message_id (UUID → community_messages.id)
- user_id (UUID → users.id)
- emoji (TEXT)
- created_at (TIMESTAMP)

Constraints:
- UNIQUE (message_id, user_id, emoji)

Indexes:
- (message_id)
- (user_id)

---

## 1.4 Unread & Read State

### community_unread_messages
Tracks read state per user per thread.

- id (UUID, PK)
- thread_id (UUID → community_threads.id)
- user_id (UUID → users.id)
- last_read_message_id (UUID → community_messages.id)
- unread_count (INTEGER)
- last_read_at (TIMESTAMP)
- updated_at (TIMESTAMP)

Constraints:
- UNIQUE (thread_id, user_id)

Indexes:
- (user_id)
- (thread_id)

---

## 1.5 Roles & Permissions

### community_channel_roles
Reusable role definitions.

- id (UUID, PK)
- channel_id (UUID → community_threads.id)
- role_name (TEXT)
- permissions (JSONB)
- created_at (TIMESTAMP)

Constraints:
- UNIQUE (channel_id, role_name)

---

## 1.6 Pinned Messages

### community_pinned_messages
Pinned messages per thread.

- id (UUID, PK)
- thread_id (UUID → community_threads.id)
- message_id (UUID → community_messages.id)
- pinned_by (UUID → users.id)
- pinned_at (TIMESTAMP)

Constraints:
- UNIQUE (thread_id, message_id)

---

## 1.7 User Presence

### community_user_presence
Real-time presence snapshot.

- user_id (UUID, PK → users.id)
- status (`online` | `away` | `busy` | `offline`)
- last_seen_at (TIMESTAMP)
- updated_at (TIMESTAMP)

---

# 2. REST API ENDPOINTS

## 2.1 Threads & Channels

### Create Channel
- POST `/community/channels`
- Creates a new channel

### List Threads
- GET `/community/threads`
- Returns channels + DMs user belongs to

### Get Thread Info
- GET `/community/threads/:threadId`

### Join / Leave Channel
- POST `/community/threads/:threadId/join`
- POST `/community/threads/:threadId/leave`

---

## 2.2 Messages

### Send Message
- POST `/community/threads/:threadId/messages`
- Supports:
  - text
  - reply_to_message_id
  - attachments

### Fetch Messages (Pagination)
- GET `/community/threads/:threadId/messages`
- Query params:
  - `before`
  - `after`
  - `limit`

### Edit Message
- PATCH `/community/messages/:messageId`

### Delete Message
- DELETE `/community/messages/:messageId`

---

## 2.3 Attachments

### Upload File
- POST `/community/upload`
- Uploads file to Supabase
- Returns public URL + metadata

---

## 2.4 Reactions

### Add Reaction
- POST `/community/messages/:messageId/reactions`

### Remove Reaction
- DELETE `/community/messages/:messageId/reactions/:emoji`

---

## 2.5 Read State

### Mark Thread as Read
- POST `/community/threads/:threadId/mark-read`

### Unread Summary
- GET `/community/unread-summary`

---

## 2.6 Roles & Permissions

### Create Role
- POST `/community/threads/:threadId/roles`

### Assign Role
- POST `/community/threads/:threadId/members/:userId/role`

---

## 2.7 Pinned Messages

### Pin Message
- POST `/community/messages/:messageId/pin`

### Unpin Message
- DELETE `/community/messages/:messageId/pin`

### List Pins
- GET `/community/threads/:threadId/pins`

---

## 2.8 Presence

### Update Status
- POST `/community/presence`

### Get Presence
- GET `/community/presence`

---

# 3. WEBSOCKET (REALTIME)

## 3.1 Connection

### Authenticate
- Event: `auth`
- Payload: access token
- Response: success / failure

---

## 3.2 Messaging Events

### New Message
- Event: `message:new`
- Payload:
  - message object
  - attachments
  - reply preview

### Message Edited
- Event: `message:edited`

### Message Deleted
- Event: `message:deleted`

---

## 3.3 Reactions

### Reaction Added
- Event: `reaction:add`
- Payload:
  - messageId
  - emoji
  - user

### Reaction Removed
- Event: `reaction:remove`

---

## 3.4 Typing Indicators

### Start Typing
- Event: `typing:start`
- Payload:
  - threadId
  - userId

### Stop Typing
- Event: `typing:stop`

Rules:
- Auto-expire after inactivity
- Never persisted

---

## 3.5 Read Receipts

### Thread Read
- Event: `thread:read`
- Payload:
  - threadId
  - userId
  - lastReadMessageId

---

## 3.6 Presence

### User Online
- Event: `presence:online`

### User Offline
- Event: `presence:offline`

### Status Change
- Event: `presence:update`

---

## 3.7 Thread Events

### User Joined
- Event: `thread:member_joined`

### User Left
- Event: `thread:member_left`

### Role Updated
- Event: `thread:role_updated`

---

# 4. SYSTEM RULES & GUARANTEES

- Messages are immutable except edits
- Deletes are soft deletes
- Attachments are immutable
- Presence is best-effort
- Typing is ephemeral
- Reactions are idempotent
- Pagination is cursor-based
- All actions permission-checked

---

# 5. IMPLEMENTATION ORDER (RECOMMENDED)

1. Core messages + pagination
2. Attachments + Supabase
3. Replies (Telegram-style)
4. Reactions
5. Unread tracking
6. Presence & typing
7. Roles & permissions
8. Pins
9. Search & notifications

---

# END OF SPEC
