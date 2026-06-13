# 网易云音乐链接转换器

将网易云音乐歌曲链接批量转换为可直接播放的音频流地址，支持在线试听与一键复制。

## 功能

- **批量转换** — 多行输入，自动识别并提取歌曲 ID，生成 `https://music.163.com/song/media/outer/url?id=xxx.mp3` 格式的音频流地址
- **在线播放** — 点击卡片直接播放，切换歌曲自动停止旧播放
- **一键复制** — 单条复制或一键复制全部转换结果
- **多种链接格式** — 支持 `/song?id=`、`/#/song?id=`、`/song/media/outer/url?id=` 等格式
- **响应式设计** — 适配手机、平板、电脑
- **毛玻璃 UI** — 半透明遮罩 + 背景模糊效果
- **自定义外观** — 通过环境变量自定义站点标题、图标、背景图

## 技术栈

- React 18 + TypeScript
- Vite 6
- Tailwind CSS 3
- 纯静态前端，无需后端

## 部署（Cloudflare Pages）

### 1. Fork 或上传代码到 GitHub

### 2. 在 Cloudflare Pages 中创建项目

- 构建命令：`npm run build`
- 构建输出目录：`dist`

### 3. 配置环境变量（可选）

在 Cloudflare Pages 控制台 → 项目设置 → 环境变量 中添加：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `VITE_TITLE` | 浏览器标签页标题 | `网易云音乐` |
| `VITE_FAVICON` | 网站图标 URL（SVG 格式） | `https://example.com/favicon.svg` |
| `VITE_BG` | 页面背景图 URL | `https://example.com/bg.jpg` |

> 所有变量均为可选，不设置则使用默认值（空标题、无图标、深色纯色背景）。

### 4. 本地开发

```bash
npm install
npm run dev
```

## 使用方法

1. 将网易云音乐歌曲链接粘贴到输入框（支持多行）
2. 点击「转换」按钮
3. 点击卡片播放音乐，或点击「跳转」在新标签页打开音频流
4. 点击「复制」复制单条链接，或点击「复制全部」批量复制

## 支持的链接格式

```
https://music.163.com/song?id=34497630
https://music.163.com/#/song?id=34497630
https://music.163.com/song/media/outer/url?id=34497630.mp3
```

## 许可

MIT