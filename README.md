# QOINZ Backend API Endpoints & JSON Outputs

This document lists all backend endpoints and their JSON outputs, strictly matching the SQL schema and backend implementation. Endpoints for tables present in the SQL schema but not yet implemented in the backend are also noted.

---

## Tables Endpoints (`/api/v1/tables`)

### `GET /` — List all tables (optionally filter by user)
**Response:**
```json
[
  {
    "id": 1,
    "owner_id": 2,
    "name": "Arena Table 1",
    "status": "open",
    "max_members": 8,
    "entry_fee": 1.1,
    "exp_pool": 100,
    "reward_pool": 8.8,
    "level": 1,
    "parent_table_id": null,
    "platform_fee": 0.1,
    "reward_amount": 2.5,
    "created_at": "2024-06-01T12:00:00Z",
    "completed_at": null
  }
]
```

### `POST /` — Create a new table
**Body:**
```json
{
  "name": "Arena Table 1",
  "max_members": 8,
  "entry_fee": 1.1,
  "exp_pool": 100
}
```
**Response:**
```json
{ "message": "Table created", "tableId": 123 }
```

### `GET /:id` — Get table details
**Response:**
```json
{
  "id": 1,
  "owner_id": 2,
  "name": "Arena Table 1",
  "status": "open",
  "max_members": 8,
  "entry_fee": 1.1,
  "exp_pool": 100,
  "reward_pool": 8.8,
  "level": 1,
  "parent_table_id": null,
  "platform_fee": 0.1,
  "reward_amount": 2.5,
  "created_at": "2024-06-01T12:00:00Z",
  "completed_at": null
}
```

### `POST /:id/join` — Join a table
**Response:**
```json
{ "message": "Joined table", "position": 3 }
```

### `POST /:id/leave` — Leave a table
**Response:**
```json
{ "message": "Left table" }
```

### `POST /:id/complete` — Mark table as completed (owner only)
**Response:**
```json
{ "message": "Table marked as completed" }
```

### `GET /:id/members` — List table members
**Response:**
```json
[
  { "id": 1, "table_id": 1, "user_id": 2, "position": 1, "current_level": 1, "joined_at": "2024-06-01T12:00:00Z", "is_winner": false }
]
```

### `GET /available` — List all joinable tables (marketplace)
**Response:**
```json
{
  "tables": [
    {
      "id": 1,
      "name": "Arena Table 1",
      "level": 1,
      "status": "open",
      "max_members": 8,
      "entry_fee": 1.1,
      "platform_fee": 0.1,
      "reward_amount": 2.5,
      "reward_pool": 8.8,
      "created_at": "2024-06-01T12:00:00Z",
      "slots_left": 3
    }
  ]
}
```

### `PUT /:id/config` — Admin: Update table config
**Body:**
```json
{ "reward_amount": 2.5, "entry_fee": 1.1, "platform_fee": 0.1 }
```
**Response:**
```json
{ "message": "Table config updated", "table": { /* table object */ } }
```

---

## Users Endpoints (`/api/v1/users`)

### `GET /profile` — Get user profile
**Response:**
```json
{
  "id": 2,
  "username": "player1",
  "email": "player1@example.com",
  "level": 1,
  "exp": 0,
  "table_slots": 1,
  "first_name": "Alice",
  "last_name": "Smith",
  "phone": "1234567890",
  "qoinz_balance": 10.5,
  "created_at": "2024-06-01T12:00:00Z",
  "avatar_url": null
}
```

### `PUT /profile` — Update user profile
**Body:**
```json
{ "username": "player1", "email": "player1@example.com", "first_name": "Alice", "last_name": "Smith", "phone": "1234567890" }
```
**Response:**
```json
{ "id": 2, "username": "player1", "email": "player1@example.com", "level": 1, "exp": 0, "table_slots": 1, "first_name": "Alice", "last_name": "Smith", "phone": "1234567890", "qoinz_balance": 10.5, "created_at": "2024-06-01T12:00:00Z", "avatar_url": null }
```

### `GET /stats` — Get user statistics
**Response:**
```json
{
  "level": 1,
  "exp": 0,
  "table_slots": 1,
  "first_name": "Alice",
  "last_name": "Smith",
  "phone": "1234567890",
  "qoinz_balance": 10.5,
  "total_tables": 3,
  "completed_tables": 1,
  "achievements_unlocked": 2
}
```

### `POST /change-password` — Change password
**Body:**
```json
{ "old_password": "string", "new_password": "string" }
```
**Response:**
```json
{ "message": "Password changed successfully." }
```

### `GET /activity_log` — Get user activity log
**Query params:** `action`, `limit`, `offset`
**Response:**
```json
[
  {
    "id": 1,
    "action": "login",
    "timestamp": "2025-05-30T10:38:47Z",
    "ip_address": "190.88.16.2",
    "country": "Curacao",
    "city": "Sint Michiel",
    "isp": "Columbus Communications Curacao NV",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; ...)",
    "referrer": "http://localhost:4200/",
    "details": { "table_id": 1 }
  }
]
```

---

## Wallet Endpoints (`/api/v1/wallet`)

### `GET /` — Get wallet balance and recent transactions
**Response:**
```json
{
  "balance": 10.5,
  "transactions": [
    { "id": 1, "user_id": 2, "amount": 1.1, "type": "join_fee", "source_table_id": 1, "created_at": "2024-06-01T12:00:00Z" }
  ]
}
```

### `GET /transactions` — Get transaction history (paginated)
**Query params:** `page`, `limit`
**Response:**
```json
{
  "transactions": [
    { "id": 1, "user_id": 2, "amount": 1.1, "type": "join_fee", "source_table_id": 1, "created_at": "2024-06-01T12:00:00Z" }
  ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "pages": 3 }
}
```

---

## Achievements Endpoints (`/api/v1/achievements`)

### `GET /` — Get user's achievements
**Response:**
```json
[
  { "id": 1, "category_id": 1, "name": "First Steps", "description": "Complete your first transaction", "exp_reward": 50, "qoinz_reward": 10.0, "requirements": { "type": "transaction", "count": 1 }, "unlocked_at": "2024-06-01T12:00:00Z" }
]
```

### `GET /:id` — Get achievement details
**Response:**
```json
{ "id": 1, "category_id": 1, "name": "First Steps", "description": "Complete your first transaction", "exp_reward": 50, "qoinz_reward": 10.0, "requirements": { "type": "transaction", "count": 1 }, "unlocked_at": "2024-06-01T12:00:00Z", "is_unlocked": true }
```

### `POST /:id/claim` — Claim achievement reward
**Response:**
```json
{ "message": "Reward claimed successfully", "amount": 10.0 }
```

---

## Level Endpoints (`/api/v1/level`)

### `GET /` — Get user's level and experience
**Response:**
```json
{ "level": 1, "exp": 0, "label": "Seedling", "exp_required": 100, "branch_slots": 1, "qoinz_reward": 0.05, "exp_reward": 0, "badge": "Seedling" }
```

### `POST /exp` — Add experience to user
**Body:**
```json
{ "amount": 100, "source": "table_join", "source_id": 1 }
```
**Response:**
```json
{ "message": "Experience added successfully", "level": 2, "exp": 0, "label": "Visionary", "exp_required": 200, "branch_slots": 1, "qoinz_reward": 0.1, "exp_reward": 10, "badge": "Visionary", "leveledUp": true, "rewards": [ { "level": 2, "label": "Visionary", "branch_slots": 1, "qoinz_reward": 0.1, "badge": "Visionary" } ] }
```

### `GET /requirements` — Get level requirements
**Response:**
```json
{ "currentLevel": 1, "currentExp": 0, "nextLevel": 2, "nextLabel": "Visionary", "expForNextLevel": 200, "expNeeded": 200, "progress": 0 }
```

---

## Admin Endpoints (`/api/v1/admin`)

### `GET /users` — Get all users
**Response:**
```json
[
  { "id": 2, "username": "player1", "email": "player1@example.com", "level": 1, "exp": 0, "table_slots": 1, "first_name": "Alice", "last_name": "Smith", "phone": "1234567890", "qoinz_balance": 10.5, "created_at": "2024-06-01T12:00:00Z" }
]
```

### `GET /users/:id` — Get user by ID
**Response:**
```json
{ "id": 2, "username": "player1", "email": "player1@example.com", "level": 1, "exp": 0, "table_slots": 1, "first_name": "Alice", "last_name": "Smith", "phone": "1234567890", "qoinz_balance": 10.5, "created_at": "2024-06-01T12:00:00Z" }
```

### `PUT /users/:id` — Update user
**Body:**
```json
{ "username": "player1", "email": "player1@example.com", "level": 1, "exp": 0, "table_slots": 1, "first_name": "Alice", "last_name": "Smith", "phone": "1234567890", "qoinz_balance": 10.5 }
```
**Response:**
```json
{ "message": "User updated successfully" }
```

### `DELETE /users/:id` — Delete user
**Response:**
```json
{ "message": "User deleted successfully" }
```

### `GET /levels` — Get all level rewards
**Response:**
```json
[
  { "id": 1, "level": 1, "branch_slots": 1, "qoinz_reward": 0.05, "exp_reward": 0, "badge": "Seedling", "label": "Seedling", "exp_required": 100 }
]
```

---

## EXP Log Endpoints (`/api/v1/exp_log`)

### `GET /` — List all EXP log entries for the user
**Response:**
```json
[
  { "id": 1, "user_id": 2, "amount": 100, "source": "table_join", "source_id": 1, "created_at": "2024-06-01T12:00:00Z" }
]
```

### `POST /` — Add a new EXP log entry
**Body:**
```json
{ "amount": 100, "source": "table_join", "source_id": 1 }
```
**Response:**
```json
{ "message": "EXP log entry created", "expLogId": 123 }
```

---

## Auth Endpoints (`/api/v1/auth`)

### `POST /register` — Register new user
**Body:**
```json
{ "username": "player1", "email": "player1@example.com", "password": "string", "voucher_code": "optional" }
```
**Response:**
```json
{ "message": "User registered successfully", "token": "...", "refresh_token": "...", "user": { "id": 2, "username": "player1", "email": "player1@example.com", "level": 1, "exp": 0, "first_name": null, "last_name": null, "phone": null, "qoinz_balance": 0 } }
```

### `POST /login` — Login
**Body:**
```json
{ "email": "player1@example.com", "password": "string" }
```
**Response:**
```json
{ "message": "Login successful", "token": "...", "refresh_token": "...", "user": { "id": 2, "username": "player1", "email": "player1@example.com", "level": 1, "exp": 0, "first_name": null, "last_name": null, "phone": null, "qoinz_balance": 0 } }
```

### `POST /refresh` — Refresh token
**Body:**
```json
{ "refresh_token": "..." }
```
**Response:**
```json
{ "token": "...", "refresh_token": "..." }
```

### `POST /logout` — Logout
**Response:**
```json
{ "message": "Logged out successfully" }
```

---

## Shop Endpoints (`/api/v1/shop`)

### `GET /items` — List available shop items
**Response:**
```json
[
  {
    "id": 1,
    "name": "Test Sword",
    "description": "A sharp blade for testing.",
    "price": 5.00,
    "image_url": "https://example.com/sword.png",
    "category": "Weapon",
    "badge": "Starter",
    "rarity": "Common",
    "featured": 0,
    "limited_time": 0,
    "expires_at": null,
    "created_at": "2024-06-01T12:00:00Z"
  }
]
```

### `POST /buy` — Buy item by ID and deduct from wallet
**Body:**
```json
{ "item_id": 1 }
```
**Response:**
```json
{
  "message": "Purchase successful",
  "balance": 95.00,
  "inventory": [
    {
      "id": 1,
      "user_id": 3,
      "item_id": 1,
      "quantity": 3,
      "acquired_at": "2024-06-01T12:00:00Z",
      "name": "Test Sword",
      "description": "A sharp blade for testing.",
      "image_url": "https://example.com/sword.png",
      "category": "Weapon",
      "badge": "Starter",
      "rarity": "Common"
    }
  ]
}
```

### `GET /inventory` — List all items owned by the user
**Response:**
```json
[
  {
    "id": 1,
    "user_id": 3,
    "item_id": 1,
    "quantity": 2,
    "acquired_at": "2024-06-01T12:00:00Z",
    "name": "Test Sword",
    "description": "A sharp blade for testing.",
    "image_url": "https://example.com/sword.png",
    "category": "Weapon",
    "badge": "Starter",
    "rarity": "Common"
  }
]
```

---

## Voucher Endpoints (`/api/v1/vouchers`)

### `POST /create` — Create a voucher
**Body:**
```json
{ "amount": 10, "inviter_id": 2 }
```
**Response:**
```json
{ "code": "A1B2C3D4", "amount": 10, "inviter_id": 2 }
```

### `POST /redeem` — Redeem a voucher
**Body:**
```json
{ "code": "A1B2C3D4" }
```
**Response:**
```json
{
  "message": "Voucher redeemed",
  "balance": 110.00,
  "voucher": {
    "code": "A1B2C3D4",
    "agent_id": 1,
    "amount": 10,
    "inviter_id": 2,
    "status": "redeemed",
    "redeemed_by": 3,
    "redeemed_at": "2024-06-01T12:00:00Z",
    "created_at": "2024-06-01T11:00:00Z"
  }
}
```

### `GET /my` — List vouchers created/redeemed by the user
**Response:**
```json
{
  "created": [
    { "code": "A1B2C3D4", "amount": 10, ... }
  ],
  "redeemed": [
    { "code": "A1B2C3D4", "amount": 10, ... }
  ]
}
```

---

## Admin Endpoints (Shop & Vouchers)

> **Note:** These endpoints are admin-only and require admin authentication/authorization.

### Shop Management

#### `POST /api/v1/shop/items` — Create a new shop item
**Body:**
```json
{
  "name": "Legendary Axe",
  "description": "A powerful axe.",
  "price": 50.00,
  "image_url": "https://example.com/axe.png",
  "category": "Weapon",
  "badge": "Legendary",
  "rarity": "Legendary",
  "featured": 1,
  "limited_time": 1,
  "expires_at": "2024-07-01T00:00:00Z"
}
```
**Response:**
```json
{ "message": "Shop item created", "item_id": 3 }
```

#### `PUT /api/v1/shop/items/:id` — Update a shop item
**Body:**
```json
{ "price": 45.00, "featured": 0 }
```
**Response:**
```json
{ "message": "Shop item updated", "item": { /* updated item object */ } }
```

#### `DELETE /api/v1/shop/items/:id` — Delete a shop item
**Response:**
```json
{ "message": "Shop item deleted" }
```

---

### Voucher Management

#### `GET /api/v1/vouchers` — List all vouchers (with optional filters)
**Query params:** `status`, `agent_id`, `redeemed_by`, etc.
**Response:**
```json
[
  { "code": "A1B2C3D4", "amount": 10, "status": "issued", ... }
]
```

#### `DELETE /api/v1/vouchers/:code` — Delete or expire a voucher
**Response:**
```json
{ "message": "Voucher deleted or expired" }
```

---

# Changelog / Notes

- **2024-06-08**: Added Shop endpoints (`/api/v1/shop/items`, `/api/v1/shop/buy`, `/api/v1/shop/inventory`) and Voucher endpoints (`/api/v1/vouchers/create`, `/api/v1/vouchers/redeem`, `/api/v1/vouchers/my`).
- **2024-06-08**: Documented planned admin endpoints for shop and voucher management.
- Shop system supports direct purchase, inventory, and wallet integration.
- Voucher system supports creation, redemption, inviter bonuses, and wallet integration.
- All new endpoints require authentication and follow the same JSON response conventions as the rest of the API.

---

# Suggestions & CapRover Deployment Notes

## Suggestions for Improvement
- **OpenAPI/Swagger Documentation:** Consider generating an OpenAPI (Swagger) spec for this API. This will make it easier for frontend and third-party developers to understand and consume your API.
- **Automated Tests:** Ensure all endpoints have automated tests (unit/integration) to maintain reliability as the codebase grows.
- **Error Handling:** Standardize error responses across all endpoints for consistency.
- **Rate Limiting & Security:** Implement rate limiting and additional security best practices for production deployments.
- **API Versioning:** You are already using `/api/v1/`—continue this practice for future breaking changes.
- **Shop/Inventory Endpoints:** As you implement endpoints for shop, orders, inventory, and vouchers, update this README and consider documenting request/response examples for each.
- **Environment Variables:** Document all required environment variables (e.g., database credentials, JWT secret, etc.) in this README for easier onboarding.

## CapRover Deployment Notes
- This backend is designed to be deployed on [CapRover](https://caprover.com/).
- Ensure your `caprover.json` and `captain-definition` files are up to date and reflect your build/start commands.
- Use CapRover's environment variable management to securely store secrets and configuration.
- For database connections, use CapRover's built-in database add-ons or connect to an external managed database.
- For scaling, CapRover allows you to easily scale your backend service horizontally.
- Monitor your app using CapRover's built-in monitoring tools and logs.

---

For any questions or contributions, please open an issue or pull request on the repository.
