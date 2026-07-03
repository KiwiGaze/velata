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

双笔画 V 字标，讲产品故事本身：左笔画 ink @ 45%（毛坯的口述输入），右笔画 ink 实色（改写后的成稿）——「说得乱，发得净」。只有两级墨色，无色相、无渐变；圆头笔画呼应整体圆角语言。

| 资产                        | 用途                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `logo/velata-mark.svg`      | 标准字标（浅色背景）                                                                                                              |
| `logo/velata-mark-dark.svg` | 深色背景变体（paper 色笔画）                                                                                                      |
| `logo/velata-icon.svg`      | macOS 应用图标源：paper 圆角砖 + line-2 发丝描边 + 柔和投影 + 居中字标。改动后跑 `pnpm tauri icon design/logo/velata-icon.svg` 重新生成 `apps/desktop/src-tauri/icons/` |

**规则**：

- 菜单栏托盘用 `apps/desktop/src-tauri/icons/tray.png`（黑 + alpha 模板图像，系统随菜单栏明暗自动着色）。
- 界面内一律用 `apps/desktop/src/components/logo.tsx` 的 `VelataMark`（currentColor，墨色随上下文）。
- 字标四周留白 ≥ 一个笔画宽；不加色、不加特效、不变形。
