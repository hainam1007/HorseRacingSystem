'use strict';

/**
 * config/swagger.js
 *
 * Base OpenAPI 3.0 metadata — project info, servers, security schemes, and tags.
 * All path entries are generated at runtime by utils/swaggerAutoDiscover.js,
 * which introspects the Express router stack after all routes are mounted.
 *
 * To add a new API group: mount its router in app.js and add a matching entry
 * to the routeRegistry array there. No changes needed in this file.
 */

/** @type {object} OpenAPI 3.0 base spec (no paths — auto-discovered at runtime) */
const baseSpec = {
  openapi: '3.0.3',
  info: {
    title: '🐎 Horse Racing Management API',
    version: '1.0.0',
    description: `
## Tổng quan
API backend cho hệ thống quản lý đua ngựa trực tuyến, bao gồm:
- 🔐 Xác thực & phân quyền (JWT)
- 💰 Module Dòng Tiền: Nạp tiền, Gói nạp, Lịch sử giao dịch
- 🏇 Quản lý đua: Giải đấu, Vòng đua, Cuộc đua, Kết quả
- 🎰 Đặt cược & Phần thưởng
- 👤 Quản lý người dùng & Vai trò

## Xác thực
Hầu hết các endpoint yêu cầu **JWT Bearer Token**.
1. Gọi \`POST /api/auth/login\` → copy \`accessToken\` từ response.
2. Bấm nút **Authorize 🔓** ở góc phải trên → dán token → **Authorize** → **Close**.
3. Tất cả endpoint có 🔒 sẽ tự gửi kèm \`Bearer <token>\`.

## Base URL
\`http://localhost:3000\`
    `.trim(),
    contact: {
      name: 'Horse Racing Dev Team',
      email: 'dev@horseracing.io',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },

  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local Development Server',
    },
  ],

  // Tags are merged with auto-discovered tags in swaggerAutoDiscover.js.
  // Order here determines display order in Swagger UI.
  tags: [
    { name: 'Auth',                   description: 'Đăng ký, đăng nhập, đổi mật khẩu, xác thực tài khoản' },
    { name: 'Users',                  description: 'Quản lý thông tin người dùng' },
    { name: 'Admin',                  description: 'Quản trị: duyệt người dùng, quản lý vai trò' },
    { name: 'Role Applications',      description: 'Nộp & duyệt đơn xin vai trò' },
    { name: 'Tournaments',            description: 'Quản lý giải đấu' },
    { name: 'Rounds',                 description: 'Quản lý vòng đấu trong giải' },
    { name: 'Races',                  description: 'Quản lý cuộc đua, betting, kết quả' },
    { name: 'Registrations',          description: 'Đăng ký ngựa tham gia cuộc đua' },
    { name: 'Jockeys',                description: 'Quản lý nài ngựa' },
    { name: 'Jockey Assignments',     description: 'Phân công nài ngựa vào cuộc đua' },
    { name: 'Horse Owner',            description: 'Quản lý thông tin chủ ngựa & ngựa' },
    { name: 'Horse Checks',           description: 'Kiểm tra sức khỏe ngựa trước đua' },
    { name: 'Referees',               description: 'Quản lý trọng tài' },
    { name: 'Referee Reports',        description: 'Báo cáo của trọng tài sau cuộc đua' },
    { name: 'Race Results',           description: 'Kết quả chính thức của cuộc đua' },
    { name: 'Prizes',                 description: 'Giải thưởng cho cuộc đua' },
    { name: 'Bets',                   description: 'Đặt cược & thanh toán cược' },
    { name: 'Violations',             description: 'Vi phạm trong cuộc đua' },
    { name: 'Wallet',                 description: 'Ví token: số dư & lịch sử giao dịch' },
    { name: 'Rewards',                description: 'Đổi token lấy phần thưởng' },
    { name: 'Deposit — Spectator',    description: 'Người chơi: xem gói, xem trước, tạo lệnh nạp, lịch sử' },
    { name: 'Deposit — Webhook',      description: 'Callback từ cổng thanh toán (public, không cần JWT)' },
    { name: 'Deposit — Admin',        description: 'Quản trị viên: CRUD gói nạp tiền' },
    { name: 'Internal (Race Engine)', description: 'API nội bộ cho race engine (không phải public)' },
  ],

  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT accessToken. Lấy từ `POST /api/auth/login` → trường `accessToken`.',
      },
    },
  },

  // Global default: require JWT on all endpoints.
  // Auto-discover overrides per-route based on middleware detection.
  security: [{ BearerAuth: [] }],

  // paths: {} — intentionally empty; populated at runtime by swaggerAutoDiscover.js
  paths: {},
};

module.exports = baseSpec;
