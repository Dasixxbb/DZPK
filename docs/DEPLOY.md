# 局域网在线德州扑克 - 运行部署维护文档

本文档基于当前仓库代码重新整理，覆盖原有 `DEPLOY.md`。内容以当前项目实际实现为准，而不是历史方案或预留方案。

## 1. 当前代码现状

### 1.1 架构概览

| 项目 | 当前实现 |
| --- | --- |
| 前端 | Vue 3 + Vite + Vue Router + Socket.IO Client |
| 后端 | Node.js + Express + Socket.IO |
| 状态存储 | 单进程内存态，无数据库，无 Redis |
| 房间数 | 10 个固定房间 |
| 模式 | 1-5 房为经典模式，6-10 房为癞子模式 |
| 每房人数 | 最多 6 人 |
| 路由模式 | `createWebHashHistory()`，即 `/#/room/:roomId` |
| 配置方式 | 前后端均使用 YAML 配置文件 |

### 1.2 与旧文档不同的关键点

1. **服务端当前并不会托管前端静态文件**  
   `server/src/index.js` 只提供 `/health` 和 Socket.IO 服务，没有 `express.static(...)`。

2. **前端生产配置不是靠构建时注入，而是运行时读取 `config.yml`**  
   前端启动时会请求 `./config.yml`，对应代码在 `client/src/utils/config.js`。

3. **前端使用的是 Hash 路由**  
   正常访问入口是 `/`，实际页面跳转是 `/#/room/1` 这种形式，因此静态服务器一般**不需要**额外做 SPA 路由回退。

4. **服务端 `npm test` 当前不可直接使用**  
   `server/package.json` 里的 `test` 指向 `tests/runTests.js`，但仓库中该文件不存在。当前有效的测试命令见本文第 8 节。

5. **服务端重启会清空所有内存态房间和对局状态**  
   包括玩家房间绑定、当前牌局、准备状态、积分变动等。当前版本没有持久化恢复能力。

---

## 2. 目录与关键文件

```text
DZPK/
├── client/
│   ├── public/config.yml          # 前端运行时配置
│   ├── src/
│   │   ├── main.js                # 前端启动入口
│   │   ├── utils/config.js        # 读取 public/config.yml
│   │   ├── utils/socket.js        # Socket.IO 客户端
│   │   ├── views/Lobby.vue        # 大厅页
│   │   └── views/Room.vue         # 房间页
│   ├── vite.config.js             # 开发服务器配置
│   ├── package.json
│   └── dist/                      # 构建产物
├── server/
│   ├── config.yml                 # 服务端配置
│   ├── src/
│   │   ├── index.js               # 服务端启动入口
│   │   ├── config.js              # 读取 server/config.yml
│   │   ├── sockets/SocketHandler.js
│   │   ├── managers/
│   │   └── game/
│   ├── tests/
│   │   ├── coreTests.js
│   │   ├── e2eTwoPlayers.js
│   │   └── playerBot.js
│   └── package.json
└── docs/DEPLOY.md
```

---

## 3. 运行环境要求

### 3.1 推荐版本

| 组件 | 建议版本 | 说明 |
| --- | --- | --- |
| Node.js | 18 LTS | 本地开发和一般部署推荐 |
| Node.js | 16 LTS | 低版本 Debian 离线服务器优先考虑 |
| npm | 随 Node 附带 | 用于安装依赖与构建 |
| 浏览器 | Chrome / Edge 最新稳定版 | 局域网客户端访问 |
| 静态文件服务 | Nginx 推荐 | 生产环境托管前端 `dist` |

### 3.2 端口占用

| 端口 | 用途 | 是否必须 |
| --- | --- | --- |
| `3000` | Node 服务端 HTTP + Socket.IO | 必须 |
| `5173` | Vite 开发服务器 | 仅开发环境 |
| `80` | Nginx 托管前端静态文件 | 推荐 |

---

## 4. 配置说明

### 4.1 服务端配置

文件：`server/config.yml`

当前默认配置：

```yml
server:
  port: 3000

rooms:
  totalRooms: 10

player:
  defaultScore: 500
  maxNicknameLength: 20

heartbeat:
  timeoutMs: 60000

timeouts:
  actionMs: 120000
  smallBlindDeclareMs: 120000
  showdownSelectMs: 120000
  reconnectGraceMs: 20000
  readyMs: 20000
```

说明：

- `server.port`：服务监听端口，默认 `3000`
- `rooms.totalRooms`：固定房间数量
- `player.defaultScore`：新玩家默认积分
- `heartbeat.timeoutMs`：服务端判定断线的心跳超时
- `timeouts.*`：行动、声明小盲、摊牌、重连宽限、准备倒计时

服务端也支持环境变量 `PORT` 覆盖监听端口：

```bash
PORT=3001 node src/index.js
```

### 4.2 前端配置

文件：`client/public/config.yml`

当前默认配置：

```yml
ws:
  url: http://localhost:3000

socket:
  reconnectionDelayMs: 1000
  reconnectionDelayMaxMs: 5000
  heartbeatIntervalMs: 25000

lobby:
  refreshIntervalMs: 3000

ui:
  toastDurationMs: 3000
  nicknameMaxLength: 20

room:
  playerActionSeconds: 120
  stateRetryDelayMs: 200
  reconnectGraceSeconds: 20
```

说明：

- `ws.url`：前端连接的后端地址
- `socket.*`：客户端重连和心跳
- `lobby.refreshIntervalMs`：大厅定时刷新间隔
- `room.reconnectGraceSeconds`：前端断线倒计时显示基准

### 4.3 一个很重要的部署特性

前端是**运行时**读取 `config.yml`，不是把地址写死到 JS 包里。  
因此生产部署时有两种做法：

1. 先改 `client/public/config.yml` 再执行 `npm run build`
2. 构建完成后，直接改 `client/dist/config.yml`

第二种方式非常适合离线服务器部署和后期改 IP，不需要重新构建前端。

---

## 5. 本地开发运行

### 5.1 安装依赖

```powershell
cd d:\ProjectCode\DZPK\server
npm ci

cd ..\client
npm ci
```

### 5.2 启动服务

终端 1：

```powershell
cd d:\ProjectCode\DZPK\server
npm start
```

终端 2：

```powershell
cd d:\ProjectCode\DZPK\client
npm run dev
```

### 5.3 验证

1. 打开 `http://localhost:3000/health`
2. 打开 `http://localhost:5173/`
3. 进入大厅后应能看到 10 个房间

### 5.4 局域网开发时的注意事项

虽然 Vite 已配置 `host: 0.0.0.0`，但前端默认仍会去连：

```text
http://localhost:3000
```

所以如果你要让局域网其他机器访问当前开发环境，需要把 `client/public/config.yml` 中的：

```yml
ws:
  url: http://localhost:3000
```

改成服务端机器的局域网 IP，例如：

```yml
ws:
  url: http://192.168.1.50:3000
```

---

## 6. 推荐生产部署方式

### 6.1 结论

基于当前代码，最稳妥的生产部署方式是：

- **前端**：构建后交给 Nginx 托管
- **后端**：Node 单独运行在 `3000`
- **前端通过 `dist/config.yml` 连接后端**

这是当前仓库**不修改代码**即可直接落地的方案。

### 6.2 前端构建

```powershell
cd d:\ProjectCode\DZPK\client
npm run build
```

当前已验证该命令可以成功执行。

构建产物位于：

```text
client/dist/
```

### 6.3 后端启动

```bash
cd /opt/dzpk/server
node src/index.js
```

或指定端口：

```bash
cd /opt/dzpk/server
PORT=3000 node src/index.js
```

### 6.4 Nginx 托管前端

一个最小可用的 Nginx 配置示例：

```nginx
server {
    listen 80;
    server_name _;

    root /opt/dzpk/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

说明：

- 当前前端使用 Hash 路由，正常入口是 `/`
- 页面跳转发生在 `#` 后面，服务端不会收到 `/room/...` 这类真实路径
- 因此这里不强制要求 SPA fallback

### 6.5 生产环境最常见的配置

部署后把 `client/dist/config.yml` 改成：

```yml
ws:
  url: http://192.168.1.50:3000
```

然后：

- 浏览器访问：`http://192.168.1.50/`
- Socket.IO 连接：`http://192.168.1.50:3000`

### 6.6 当前不推荐的说法

以下做法不是当前代码默认支持的，不应再作为主文档方案：

1. “服务端已内置托管前端静态文件”  
   当前并没有实现。

2. “生产环境靠 `window.__WS_URL__` 注入地址”  
   当前项目真正生效的是 `config.yml` 运行时加载机制。

---

## 7. 离线 Debian 服务器部署

本节适用于：服务器不能联网，但可以通过 U 盘或内网拷贝文件。

### 7.1 推荐准备方式

最好在一台**联网且系统尽量接近目标 Debian 版本**的机器上准备部署包。

推荐准备内容：

```text
deploy/
├── client-dist/
├── server/
│   ├── src/
│   ├── config.yml
│   ├── package.json
│   ├── package-lock.json
│   └── node_modules/
└── node/
    └── Node.js 离线安装包或二进制
```

### 7.2 打包步骤

在联网打包机上：

```bash
# 前端
cd client
npm ci
npm run build

# 后端
cd ../server
npm ci --omit=dev
```

然后复制：

- `client/dist` -> `deploy/client-dist`
- `server/src`
- `server/config.yml`
- `server/package.json`
- `server/package-lock.json`
- `server/node_modules`

### 7.3 关于跨平台拷贝 `node_modules`

当前服务端依赖是纯 JS 包为主，跨平台直接拷贝**大概率可用**。  
但正式部署仍建议：

1. 尽量在 Linux 打包机上准备 `server/node_modules`
2. 或直接采用 Docker 离线镜像方式

不要把“Windows 上打好的 `node_modules` 直接拿到 Debian”当成长期标准方案。

### 7.4 服务器落地步骤

假设部署目录：

```text
/opt/dzpk/
├── client/dist
└── server
```

启动后端：

```bash
cd /opt/dzpk/server
node src/index.js
```

修改前端运行配置：

```bash
vi /opt/dzpk/client/dist/config.yml
```

把 `ws.url` 改成服务器实际 IP。

如果已安装 Nginx，则将站点根目录指向：

```text
/opt/dzpk/client/dist
```

---

## 8. 测试与发布前验证

### 8.1 核心测试

```bash
cd server
node tests/coreTests.js
```

当前已验证结果：

```text
结果: 通过 26 / 失败 0
```

### 8.2 双玩家流程测试

先启动服务端，再执行：

```bash
cd server
node tests/e2eTwoPlayers.js --two
```

该脚本会验证：

- 两人局自动流程
- 连续两局庄位轮换
- 手牌开始、结算、手牌结束等关键流程

### 8.3 单机器人调试

```bash
cd server
node tests/playerBot.js
```

适合在手工联调时观察事件流。

### 8.4 前端构建验证

```bash
cd client
npm run build
```

当前已验证该命令可成功构建。

### 8.5 注意

当前不要使用：

```bash
npm test
```

因为 `server/package.json` 的 `test` 脚本指向的 `tests/runTests.js` 并不存在。

---

## 9. 常驻运行建议

### 9.1 Linux systemd 方案

建议在 Debian 上使用 `systemd` 托管 Node 服务。

示例：

```ini
[Unit]
Description=DZPK Server
After=network.target

[Service]
WorkingDirectory=/opt/dzpk/server
ExecStart=/usr/bin/node /opt/dzpk/server/src/index.js
Restart=always
RestartSec=3
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

常用命令：

```bash
sudo systemctl daemon-reload
sudo systemctl enable dzpk-server
sudo systemctl start dzpk-server
sudo systemctl restart dzpk-server
sudo systemctl status dzpk-server
```

### 9.2 PM2 方案

如果服务器已经装了 PM2，也可以使用：

```bash
cd /opt/dzpk/server
pm2 start src/index.js --name dzpk-server
pm2 save
```

---

## 10. 日志、健康检查与巡检

### 10.1 服务端日志格式

服务端日志全部输出到 stdout，格式为：

```text
[YYYY-MM-DD HH:mm:ss.mmm] [LEVEL] message {json}
```

日志级别：

- `DEBUG`
- `INFO`
- `WARN`
- `ERROR`

### 10.2 健康检查

```bash
curl http://127.0.0.1:3000/health
```

预期结果：

```json
{"status":"ok","timestamp":1234567890}
```

### 10.3 常用巡检命令

```bash
ss -lntp | grep 3000
journalctl -u dzpk-server -n 100
journalctl -u dzpk-server -f
```

### 10.4 发布后最小冒烟检查

1. 打开大厅页面
2. 检查 10 个房间都正常显示
3. 两个浏览器进入同一房间
4. 两人准备并开始一局
5. 确认下注、摊牌、结算和下一局准备流程正常

---

## 11. 运维注意事项

### 11.1 服务端重启会丢失当前状态

当前服务端是单进程内存态：

- 玩家会话
- 房间状态
- 当前牌局
- 当前积分

都不会持久化。  
因此生产环境中重启前应明确接受“本局和房间状态清空”的影响。

### 11.2 浏览器身份依赖 `localStorage.sessionId`

前端会在 `localStorage` 中保存 `sessionId`。如果浏览器清缓存、换浏览器或手动清掉该值，玩家会被视为新会话。

### 11.3 前端连不上后端时，优先检查 `config.yml`

绝大多数连接问题都不是代码错误，而是：

- `client/dist/config.yml` 中 `ws.url` 写错
- 写成了 `localhost`
- 服务端端口未开放

### 11.4 重连是有宽限时间的

当前默认重连宽限为 `20s`：

- 服务端：`timeouts.reconnectGraceMs`
- 前端：`room.reconnectGraceSeconds`

如果两边数值不一致，界面表现和实际服务端行为可能出现偏差，因此建议同步维护。

### 11.5 准备计时与阶段计时都来自服务端 deadline

当前阶段共享倒计时、准备倒计时、重连倒计时都与服务端 deadline 机制绑定。  
如果你修改超时配置，需同时核对前端显示是否与服务器策略一致。

---

## 12. 常见问题

### 12.1 页面能打开，但无法进入房间或无法同步

先检查：

1. `http://服务器IP:3000/health` 是否正常
2. `client/dist/config.yml` 中 `ws.url` 是否为真实 IP
3. 服务器防火墙是否放行 `3000`

### 12.2 局域网其他电脑打不开开发环境

通常原因是：

- 访问的是 `5173`，但前端仍在连接 `localhost:3000`
- 本机防火墙没有放行 `5173` 或 `3000`

### 12.3 服务器重启后玩家积分没了

这是当前架构的正常行为，不是 bug。  
项目目前没有持久化积分或牌局恢复。

### 12.4 直接刷新房间页面会不会 404

当前不会因为前端使用的是 Hash 路由，真实请求仍然是 `/`。

### 12.5 为什么文档不再把“服务端托管前端”作为默认方案

因为当前实际代码中没有实现 `express.static`，文档必须以现状为准。

---

## 13. 推荐发布流程

```bash
# 1. 后端测试
cd server
node tests/coreTests.js

# 2. 前端构建
cd ../client
npm run build

# 3. 更新生产前端包
# 将 client/dist 发布到静态服务器目录

# 4. 更新服务端代码和配置

# 5. 重启 Node 服务

# 6. 冒烟验证
# - /health
# - 大厅
# - 双人进房
# - 一局完整流程
```

---

## 14. 关键文件索引

| 文件 | 作用 |
| --- | --- |
| `server/src/index.js` | 服务端入口、健康检查、Socket.IO 初始化 |
| `server/src/config.js` | 读取 `server/config.yml` |
| `server/src/sockets/SocketHandler.js` | 所有 Socket 事件、断线重连、广播、准备计时 |
| `server/src/game/GameEngine.js` | 游戏状态机、行动超时、摊牌、结算 |
| `server/src/managers/PlayerManager.js` | 玩家会话、昵称、积分、计划下注额 |
| `server/src/managers/RoomManager.js` | 房间、座位、准备、模式 |
| `client/src/main.js` | 前端入口、路由初始化 |
| `client/src/utils/config.js` | 前端运行时读取 `config.yml` |
| `client/src/utils/socket.js` | Socket.IO 客户端、自动重连、心跳 |
| `client/src/views/Lobby.vue` | 大厅逻辑 |
| `client/src/views/Room.vue` | 房间界面、倒计时、操作面板、结算展示 |

---

**文档更新时间：** 2026-08-13  
**文档依据：** 当前仓库代码、当前配置文件、当前测试脚本、当前构建结果  
**下次必须修订的触发条件：**

1. 服务端开始托管前端静态文件
2. 前端配置读取方式发生变化
3. 路由模式从 Hash 改回 History
4. 引入数据库或任意持久化层
5. 新增 Dockerfile / docker-compose 并作为正式部署方式
