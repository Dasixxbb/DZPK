# DZPK - 局域网在线德州扑克

一个基于 **Vue 3 + Vite + Node.js + Express + Socket.IO** 的局域网德州扑克游戏平台。

支持 10 个固定房间：

- 房间 1-5：经典模式
- 房间 6-10：癞子模式

每房最多 6 人，支持准备、大小盲、下注、加注、All In、摊牌 7 选 5、边池结算、断线重连、准备倒计时、共享阶段倒计时等功能。

## 1. 项目结构

```text
DZPK/
├── client/                      # 前端（Vue 3 + Vite）
│   ├── public/config.yml        # 前端运行时配置
│   ├── src/
│   │   ├── main.js              # 入口
│   │   ├── views/               # Lobby / Room 页面
│   │   ├── components/          # 组件
│   │   └── utils/               # Socket / 牌型 / 格式化工具
│   ├── vite.config.js
│   └── package.json
├── server/                      # 后端（Node.js + Express + Socket.IO）
│   ├── config.yml               # 服务端配置
│   ├── src/
│   │   ├── index.js             # 服务入口
│   │   ├── sockets/             # 通信层
│   │   ├── managers/            # 玩家 / 房间管理
│   │   └── game/                # 游戏引擎与牌型判定
│   ├── tests/                   # 核心测试与 E2E 脚本
│   └── package.json
├── docs/
│   ├── PRD.md                   # 产品需求文档
│   └── DEPLOY.md                # 部署与维护文档
├── .gitignore
└── README.md
```

## 2. 环境要求

- Node.js：推荐 **18 LTS**，次选 **16 LTS**
- npm：随 Node 安装即可
- 浏览器：Chrome / Edge / Firefox 最新稳定版

> 当前项目使用前后端两套 YAML 配置文件，启动和构建时会分别读取：
> - 前端：[client/public/config.yml](file:///d:/ProjectCode/DZPK/client/public/config.yml)
> - 后端：[server/config.yml](file:///d:/ProjectCode/DZPK/server/config.yml)

## 3. 安装依赖

分别在服务端和前端安装依赖：

**Windows / macOS / Linux 通用：**

```bash
# 1. 安装服务端依赖
cd server
npm ci

# 2. 安装前端依赖
cd ../client
npm ci
```

如果你是本机第一次拉代码、没有 lockfile，也可以使用：

```bash
cd server
npm install

cd ../client
npm install
```

推荐优先使用 `npm ci`，这样依赖版本会严格按照 `package-lock.json` 安装，更稳定。

## 4. 本地开发运行

需要同时启动两个进程：**后端服务** + **前端开发服务器**。

### 4.1 启动后端

```bash
cd server
npm start
```

默认监听端口：**3000**

健康检查地址：

```text
http://localhost:3000/health
```

启动成功后，`/health` 会返回：

```json
{"status":"ok","timestamp":1786627000000}
```

### 4.2 启动前端

```bash
cd client
npm run dev
```

默认开发地址：

```text
http://localhost:5173/
```

Vite 已配置 `host: 0.0.0.0`，因此同局域网其他机器也可以通过你本机局域网 IP 访问：

```text
http://你的局域网IP:5173/
```

### 4.3 局域网内访问的额外配置

如果你要让局域网其他机器访问开发环境，需要修改前端配置中的后端地址：

文件：[client/public/config.yml](file:///d:/ProjectCode/DZPK/client/public/config.yml)

把：

```yml
ws:
  url: http://localhost:3000
```

改成：

```yml
ws:
  url: http://你的局域网IP:3000
```

例如：

```yml
ws:
  url: http://192.168.1.50:3000
```

否则局域网其他电脑打开前端后，会试图连接它们自己的 `localhost:3000`，自然连不上后端。

## 5. 前端构建生产包

在 `client` 目录下执行：

```bash
cd client
npm run build
```

构建产物会生成到：

```text
client/dist/
```

构建成功后，通常会看到类似输出：

```text
dist/index.html
dist/assets/index-*.css
dist/assets/index-*.js
dist/config.yml
```

注意：

- 前端在运行时会读取 `dist/config.yml`
- 因此生产部署时，可以直接改 `dist/config.yml`，不必重新构建

例如部署到服务器 `192.168.1.50`，就把 `dist/config.yml` 改成：

```yml
ws:
  url: http://192.168.1.50:3000
```

## 6. 服务端生产运行

服务端生产运行入口为：

```bash
cd server
node src/index.js
```

也支持通过环境变量覆盖端口：

```bash
PORT=3000 node src/index.js
```

在 Linux / Debian 上推荐用 `systemd` 或 `PM2` 常驻运行，具体步骤可参考部署文档。

## 7. 常用测试命令

### 7.1 核心测试

牌型判定、癞子规则、房间积分生命周期等核心逻辑：

```bash
cd server
node tests/coreTests.js
```

正常会输出：

```text
结果: 通过 26 / 失败 0
```

### 7.2 双玩家流程测试

先在一个终端启动服务端：

```bash
cd server
npm start
```

再另起一个终端执行：

```bash
cd server
node tests/e2eTwoPlayers.js --two
```

用于验证：

- 两人局完整流程
- 连续两局庄位轮换
- 开始 / 结算 / 结束等事件

### 7.3 单机器人调试

```bash
cd server
node tests/playerBot.js
```

适合联调时观察事件流和日志。

### 7.4 说明

当前不要使用：

```bash
npm test
```

因为 `server/package.json` 里的默认 test 脚本指向的 `tests/runTests.js` 暂未纳入仓库，实际有效测试命令以本文第 7 节为准。

## 8. 推荐部署方式

基于当前代码结构，推荐生产部署方式为：

- **前端**：构建 `client/dist` 后，由 **Nginx** 托管静态文件
- **后端**：由 Node 进程独立运行在 `3000` 端口
- **配置**：通过 `client/dist/config.yml` 指定后端地址

完整部署、维护、日志、巡检与离线 Debian 部署流程，请参考：

- [docs/DEPLOY.md](file:///d:/ProjectCode/DZPK/docs/DEPLOY.md)

## 9. 配置文件速查

### 9.1 服务端

文件：[server/config.yml](file:///d:/ProjectCode/DZPK/server/config.yml)

常用字段：

- `server.port`：服务监听端口
- `rooms.totalRooms`：总房间数，当前固定 10
- `player.defaultScore`：新玩家初始积分
- `timeouts.actionMs`：行动阶段倒计时
- `timeouts.showdownSelectMs`：摊牌选牌倒计时
- `timeouts.reconnectGraceMs`：断线重连宽限时间
- `timeouts.readyMs`：下一局准备倒计时

### 9.2 前端

文件：[client/public/config.yml](file:///d:/ProjectCode/DZPK/client/public/config.yml)

常用字段：

- `ws.url`：连接的后端地址
- `socket.reconnectionDelayMs` / `reconnectionDelayMaxMs`：断线重连间隔
- `lobby.refreshIntervalMs`：大厅刷新间隔
- `room.playerActionSeconds`：前端阶段倒计时显示基准
- `room.reconnectGraceSeconds`：前端断线重连倒计时显示基准

## 10. 快速开始（最小上手）

```bash
# 1. 安装依赖
cd server
npm ci

cd ../client
npm ci

# 2. 启动后端（终端 1）
cd ../server
npm start

# 3. 启动前端（终端 2）
cd ../client
npm run dev

# 4. 浏览器打开
# http://localhost:5173/
```

如果需要多人在同一局域网试玩，把 `client/public/config.yml` 里的后端地址改成你本机的局域网 IP 即可。
