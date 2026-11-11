# 视频脚本器

完整保存的 **0.1.18 本机定制版**。本仓库基于恢复后实际运行、已检查界面的程序整理，保留紧凑选款分页、店铺筛选、跨页多选、任务卡双状态药丸、整卡进入详情，以及苹果风字体和紫色品牌图标。

[下载 Windows x64 完整程序包](https://github.com/kobong1965/shipin-jiaobenqi/releases/latest)

## 运行

1. 下载 Release 中的 `VideoScriptTool-0.1.18-custom-Windows-x64.zip`，完整解压到单独目录。
2. 在 Windows 10/11 x64 上运行“视频Skill工作台.exe”。本版沿用原程序名称，需要可用的 E 盘和 Microsoft WebView2；随包提供 Node、PostgreSQL 和 .NET 运行依赖。
3. 本机数据位置仍为 `E:\Codex工作盘\projects\video-skill-workbench-data`。使用已有数据前先备份，首次使用按界面配置账号和自己的接口。

程序包只包含软件；账号、API 密钥、数据库、商品图、任务记录、私有 Skill 和效果视频均未上传。GitHub 源码 ZIP 不含完整 Windows 运行时，运行软件请使用 Release 里的程序包。

## 本版界面

- 选款弹窗：紧凑网格、按窗口尺寸分页、店铺筛选、跨页多选，操作按钮置顶。
- 任务栏：紧凑卡片；“完成／未完”和“已传／未传”双状态药丸，完成或已上传为绿色，其余为深灰色；点击卡片进入详情。
- 字体和品牌：保留苹果风系统字体栈、简洁布局和紫色图标；字体按当前系统实际安装情况回退。

## 保存方式与构建

`frozen-web/` 保存当前实际运行入口及全部可达静态资源，`frozen-web-manifest.json` 记录逐文件 SHA-256。默认构建复制这套已经验证的界面，避免旧基础源码重建时覆盖本机定制部分。

```sh
node scripts/preserved-ui.mjs verify
npm run build
node scripts/preserved-ui.mjs build --output-root <输出目录>
```

默认输出为 `dist/web/`。后端开发、测试等命令仍在 `package.json`；本项目原开发工具将数据、缓存和测试产物放在 `E:\Codex工作盘` 下。

`apps/`、`packages/`、`database/` 保存整理后的应用源码和实际运行后端；`custom-ui-source/` 保存定制界面的可用编辑源。`npm run build:source` 保留原 Vite 源码构建入口，适合后续开发。它不能保证字节重现这套历史定制界面；本次发行以 `frozen-web/` 和已校验的 Windows 程序包为准。历史原生桌面源码中的程序集版本字段可能早于运行发行标识，不能仅凭该字段判断本次保存版本。

`SOURCE-PROVENANCE.json` 记录源文件来源与版本边界，`docs/release-0.1.18-custom.md` 记录本次发行说明。打包后的 `package-manifest.json`、`SHA256SUMS.txt` 和 `software-release-audit.json` 可用于核对完整性。

## 校验下载

在 PowerShell 中运行：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\VideoScriptTool-0.1.18-custom-Windows-x64.zip'
```

将结果与同一 Release 中 `SHA256SUMS.txt` 对照。

第三方组件许可与声明见 `NOTICE.md`、`THIRD-PARTY-NOTICES.md` 以及程序包中的许可文件。
