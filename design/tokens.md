# Design Tokens — Velata「clean sheet」定稿语言

浅色冷调、零彩色、单字体、狠留白。强调只用「近黑墨色」（不是任何色相）。参考图见本目录 HTML。

## 颜色（hex）

| 变量    | 值        | 用途                                         |
| ------- | --------- | -------------------------------------------- |
| paper   | `#FCFCFD` | 纸面 / 主背景                                |
| raise   | `#F2F3F6` | hover / 次级填充                             |
| raise-2 | `#EAECF0` | active / 选中填充                            |
| ink     | `#191B20` | 主文字 · 唯一「强调色」（开关开态 / 主按钮） |
| ink-2   | `#646A75` | 次要文字                                     |
| ink-3   | `#A4A9B3` | 三级 / 提示 / gutter                         |
| line    | `#EBECF0` | 发丝分隔线                                   |
| line-2  | `#E0E2E7` | 输入框边框                                   |

**规则**：没有品牌色、没有彩色边框、没有闪烁点动效。层次只靠墨色深浅 + 留白 + 轻微高度差。

## 字体

- Sans（UI + 正文）：**Geist**
- Mono（键帽 / 元数据 / gutter）：**Geist Mono**
- CJK 回退：PingFang SC, Hiragino Sans GB
- 层次靠字重（400/500/600），不靠色相。

## 形状 / 动效

- 圆角：面板 ~18px，嵌套卡 ~14/11px，控件 ~9px
- 阴影：大而柔的漂浮投影（浅色上克制）
- 动效：极简。Refining = 顶部细 `Progress` 平滑推进；**无彩色、无闪点**。

## 映射到 shadcn（Tailwind v4，globals.css）

把上面 hex 填进 shadcn 主题变量（Tailwind v4 默认 oklch，可转换）：

- `--background` = paper · `--foreground` = ink
- `--card` = paper · `--muted` = raise · `--muted-foreground` = ink-3
- `--accent` = raise-2 · `--border` = line-2 · `--input` = line-2
- `--primary` = ink · `--primary-foreground` = paper
- `--ring` = ink @ ~18% alpha · `--radius` = 0.9rem
  装 shadcn 组件后，逐一去掉默认多余的圆角/阴影/边框，贴合以上语言。

## Logo / 标识

「双面板」标：两块实心墨色圆角方板，前板向右下错位，重叠处由一圈等宽的**真镂空**间隙隔开——悬浮便签盖在工作面之上。单一墨色、无透明度层级、无渐变；背板画成 L 形路径，间隙是真负空间，任何底色都能透出。

两套母版（512 画布）：**标准版**（面板 224、圆角 58、错位 72、间隙 24）用于 ≥20px（应用图标、界面、字标）；**紧凑版**（面板 248、圆角 64、错位 100、间隙 48）用于 <20px 与菜单栏托盘，小尺寸不糊。

| 资产                        | 用途                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `logo/velata-mark.svg`      | 标准字标（浅色背景）                                                                                                              |
| `logo/velata-mark-dark.svg` | 深色背景变体（paper 色填充）                                                                                                      |
| `logo/velata-icon.svg`      | macOS 应用图标源：paper 圆角砖 + line-2 发丝描边 + 柔和投影 + 居中标准版字标。改动后跑 `pnpm tauri icon design/logo/velata-icon.svg` 重新生成 `apps/desktop/src-tauri/icons/` |
| `logo/velata-tray.svg`      | 菜单栏托盘源（紧凑版、纯黑填充）。改动后跑 `pnpm tauri icon design/logo/velata-tray.svg -o <临时目录>`，取其 `32x32.png` 覆盖 `apps/desktop/src-tauri/icons/tray.png` |

**规则**：

- 菜单栏托盘用 `apps/desktop/src-tauri/icons/tray.png`（黑 + alpha 模板图像，系统随菜单栏明暗自动着色）。
- 界面内一律用 `apps/desktop/src/components/logo.tsx` 的 `VelataMark`（currentColor，墨色随上下文；`size < 20` 自动切换紧凑版几何）。
- 字标四周留白 ≥ 面板间隙宽度的两倍；不加色、不加特效、不变形。
