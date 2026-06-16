# 网易云音乐工具集

将网易云音乐链接批量转换为可播放的音频地址，以及本地解密 NCM/QMC/KGM 等加密音乐格式。纯静态前端，无需后端，可直接部署到 Cloudflare Pages。

## 功能

### 链接转换
- **批量转换** — 多行输入，自动提取歌曲 ID，生成音频流地址
- **在线播放** — 点击卡片直接播放，Web Audio API 驱动
- **一键复制** — 单条复制或一键复制全部结果
- **多种链接格式** — `/song?id=`、`/#/song?id=`、`/song/media/outer/url?id=` 等

### 格式转换
- **浏览器本地解密** — 无需上传，NCM/QMC/KGM/KWM/XM 全在浏览器完成
- **支持格式** — `.ncm`, `.qmc0/3/flac/ogg`, `.mflac`, `.mgg`, `.tkm`, `.kgm/a`, `.vpr`, `.kwm`, `.xm`
- **自动解密** — 拖拽或选择文件后立即解密，实时显示进度
- **元数据提取** — 自动读取歌名、歌手、专辑、封面
- **在线试听** — Web Audio API 播放，音频进度条
- **命名格式** — 支持「歌手 - 歌名」「歌名 - 歌手」「歌名」「原始文件名」四种
- **一键下载** — 单曲下载或批量打包下载
- **封面显示** — 自动提取并展示专辑封面

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 6 |
| 样式 | Tailwind CSS 3 |
| 加密 | crypto-js (AES-128-ECB / RC4) |
| 音频 | Web Audio API (AudioContext) |
| 代码规范 | ESLint 9 + TypeScript strict mode |
| 部署 | Cloudflare Pages (纯静态) |

## 项目结构

```
├── public/
│   ├── _headers          # Cloudflare Pages 缓存头
│   └── _redirects        # SPA 路由回退
├── src/
│   ├── main.tsx          # 应用入口
│   ├── App.tsx           # 根组件（路由、代码分割）
│   ├── index.css         # 全局样式 + 动画定义
│   ├── hooks/
│   │   ├── useAudioPlayer.ts   # Web Audio API 播放控制器
│   │   ├── useBackground.ts    # 背景图预加载
│   │   └── useClipboard.ts     # 剪贴板读写
│   ├── components/
│   │   ├── NavigationBar.tsx    # 顶部导航栏
│   │   ├── InputArea.tsx        # 链接输入区域（展开/收缩）
│   │   ├── ResultList.tsx       # 链接转换结果列表
│   │   ├── ResultItem.tsx       # 链接转换结果卡片
│   │   ├── NamingSelect.tsx     # 命名格式选择器
│   │   ├── DecryptResultItem.tsx # 解密结果卡片（含封面/播放）
│   │   ├── BackgroundImage.tsx  # 背景图
│   │   └── ErrorBoundary.tsx    # 错误边界
│   ├── pages/
│   │   └── UnlockMusic.tsx      # 格式转换页（懒加载）
│   └── utils/
│       ├── decrypt.ts           # NCM/QMC/KGM 解密核心
│       └── urlConverter.ts      # 网易云链接解析
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
└── .gitignore
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 本地开发

```bash
npm install
npm run dev        # 启动开发服务器，默认 http://localhost:5173
```

### 构建

```bash
npm run build      # TypeScript 类型检查 + Vite 生产构建
npm run preview    # 预览构建产物
```

### 代码检查

```bash
npm run lint       # ESLint 检查
npm run check      # TypeScript 类型检查
```

## 部署

### Cloudflare Pages

1. Fork 本仓库或上传到 GitHub
2. 在 Cloudflare Pages 创建项目，连接仓库
3. 构建设置：
   - **构建命令**: `npm run build`
   - **输出目录**: `dist`
4. **无需设置 Functions** — 项目为纯静态资产

### 环境变量（可选）

| 变量 | 说明 |
|------|------|
| `VITE_TITLE` | 浏览器标题 |
| `VITE_FAVICON` | 网站图标 URL (SVG) |
| `VITE_BG` | 页面背景图 URL |

### 缓存策略

- `/assets/*` — 1 年强缓存（文件名含 hash，永久不可变）
- `/*` — 1 小时缓存（HTML 入口）

由 `public/_headers` 配置，Cloudflare Pages 自动应用。

## 架构设计

### 代码分割

格式转换页（`UnlockMusic`）使用 `React.lazy` + `Suspense` 实现按需加载，避免首屏加载 84KB 的 crypto-js 解密库。仅访问链接转换页的用户无需下载解密代码。

```
首屏: index.js (12KB) + vendor.js (142KB)
切换到「格式转换」时: 额外加载 UnlockMusic.js (84KB)
```

### 状态管理

采用 React 原生状态管理（`useState` + `useCallback`），无额外状态库依赖：
- 全局状态：页面切换（`currentPage`）、背景加载状态（`useBackground`）
- 页面状态：输入值、转换/解密结果、播放状态、命名格式

### 模块职责

| 模块 | 职责 | 依赖 |
|------|------|------|
| `useAudioPlayer` | Web Audio API 解码/播放/进度 | 无 |
| `decrypt.ts` | NCM/QMC/KGM 文件解密 | crypto-js |
| `urlConverter.ts` | 链接正则匹配与转换 | 无 |
| `useClipboard` | 剪贴板读写封装 | 无 |
| `useBackground` | 背景图预加载 | 无 |

## 代码规范

- TypeScript strict mode，所有类型显式声明
- `noUnusedLocals: true` / `noUnusedParameters: true`
- 组件使用函数式声明 + `FC` 类型标注
- Props 使用 `interface` 定义，通过解构接收
- 事件处理函数以 `handle` 前缀命名
- CSS 动画统一在 `index.css` 中定义，使用 `@keyframes`

## 设计交互动画

| 动画 | 实现 | 触发场景 |
|------|------|----------|
| 页面转入 | `page-fade-in` (opacity + translateY) | 页面切换 |
| 结果逐项进入 | `item-slide-up` + `animation-delay` 错开 | 转换/解密完成 |
| 骨架屏 | `skeleton-pulse` (opacity 呼吸) | 懒加载等待 |
| 卡片悬停 | Tailwind `hover:scale-[1.01]` + `transition` | 鼠标悬浮 |
| 按钮反馈 | `active:scale-[0.97]` | 点击 |
| 拖拽高亮 | border-color + bg-color transition | 拖拽文件到上传区 |
| 进度条 | CSS transition width | 音频播放进度 |

所有动画使用 CSS（GPU 加速），`will-change` 仅用于关键元素，帧率 >60fps。

## 许可

MIT