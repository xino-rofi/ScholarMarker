# ScholarMarker

**让 PDF 阅读拥有自己的 Ping。 / Add your own Pings to PDF reading.**

ScholarMarker 是 Zotero PDF 阅读器插件：将导入的图片或 GIF 放在页面上，播放动画/音效，并可关联已有原生高亮。

ScholarMarker adds material-based Pings to Zotero's PDF Reader: place images or GIFs on a page, play animations/audio, and link them to existing native highlights. 

## 功能 / Features

- PNG、WebP、GIF素材；WAV/MP3音频。Import image/GIF materials and WAV/MP3 audio.
- 临时播放或保留页面Ping；拖动位置。Play temporary Pings or retain and move them on PDF pages.
- 素材级16–96px尺寸（默认32px）、七种点击动画选项，设置持久化。Persistent per-material size and click-animation settings.
- 原生高亮LINK/UNLINK、当前PDF单条或多选删除。Link/unlink existing highlights; delete individual or selected Pings in the current PDF.
- 删除Ping不删除素材、原生批注或文献Item。Deleting a Ping keeps materials, native annotations and library items.

## 环境 / Compatibility

目前仅验证 **Windows / Zotero 10.0.8**。其他宿主版本、macOS和Linux未支持；不承诺跨平台、云同步或自动更新。

Tested only on **Windows with Zotero 10.0.8**. Other versions/platforms are unsupported. No cloud-sync or automatic-update support is claimed.

## 安装 / Install

1. 从[Releases](https://github.com/xino-rofi/ScholarMarker/releases)下载 `.xpi`，不要下载源码ZIP作为插件。
2. 在Zotero打开 **工具 → 插件 / Tools → Plugins**，将XPI拖入插件窗口并按宿主提示安装。
3. 打开可编辑的用户库PDF，点击Reader中的ScholarMarker设置，阅读说明并选择“启用本机 Ping 功能”；也可暂不启用。

Download the XPI from Releases, then open **Tools → Plugins** in Zotero and drag the XPI into that window. Open an editable user-library PDF and explicitly enable local Ping features when ready. No CMD, Node or authorization script is needed to use the plugin. See [INSTALLATION.md](INSTALLATION.md) and [Zotero's installation instructions](https://www.zotero.org/support/plugins).

## 快速上手 / Quick start

1. 在PDF Reader点击 **Ping → 我的Ping → 添加Ping**，导入素材；展开素材“设置”管理尺寸、点击动画和声音。
2. 在素材设置中配置快捷键。鼠标移入PDF、让阅读区获得焦点，再按已保存快捷键；用“保留 Ping”选择页面保存或临时播放。输入框、原生快捷键冲突或焦点不符时会拒绝触发。
3. 右键已保留Ping选择“关联标注”，展开左侧原生高亮卡片，明确点击关联按钮；解除仅移除关系，不删除Ping或高亮。
4. 在“管理”页选择当前PDF的Ping并确认删除。批量按顺序逐项执行，不是一个可回滚原子操作。

Open **Ping → My Pings**, import a material and expand its settings. Assign a supported shortcut, hover over the PDF and focus the reading area before triggering it. The retained-Ping setting controls persistence. To link a retained Ping, use its context menu and explicitly confirm the target highlight card. The management tab handles Pings in the current PDF only.

## 本地数据 / Local data

业务sidecar保存在当前Zotero profile的 `scholarmarker/` 命名空间，显示与声音等偏好保存在当前profile。首次启用需明确同意；拒绝时不建立业务库。不要手动复制owner或未知业务文件来迁移实例。未决状态会阻止继续写入，不应删锁、恢复或重复提交删除。

Business sidecars live under `scholarmarker/` in the current Zotero profile; preferences are profile-local. Initial business use requires explicit consent. Do not copy ownership metadata between instances. An uncertain/pending operation blocks further writes: preserve it and report the issue. Zotero Sync is not promised to sync these sidecars.

## 已知限制 / Known limitations

- **批量删除速度偏慢**：顺序逐项确认；请等待完成，不要反复提交。Batch deletion can be slow; wait for the sequential operation to finish.
- 仅限当前PDF的Ping管理，不是素材库或原生批注批量删除。Management is scoped to Pings in the current PDF.
- 不自动迁移旧开发目录，不承诺降级恢复；升级前备份。No automatic migration of old development data or downgrade recovery.
- 关联卡片操作后，快捷键/播放需PDF阅读区重新获得焦点。Refocus the PDF after working in annotation cards.
- 新显示大小可遮挡正文；当前使用方形命中盒和既有叠放顺序。Large Pings can cover text; rectangular hit boxes and existing stacking order apply.

## 构建 / Build

使用 **Node 24.20.0**，无第三方npm依赖：

```sh
node --test scripts/build.test.cjs tests/shutdown.test.cjs
node scripts/build.cjs
```

XPI生成于 `dist/`。`identity.json`为单一身份/版本来源；模板生成元数据，`inputs.json`核验包资源。ZIP顺序/时间/权限固定，可重复构建。安装者不需要Node。

The build uses explicit inputs and deterministic ZIP metadata. End users only need the XPI, not Node. [MEDIA-AUTHORING.md](MEDIA-AUTHORING.md) documents the new default media and generator.

## 许可与反馈 / License and feedback

[GPL-3.0-or-later](LICENSE)，适用于维护者有权授权的代码及所列项目资源；详见[范围](LICENSE-SCOPE.md)和[第三方说明](THIRD-PARTY-NOTICES.md)。用户导入素材、PDF及宿主不由本项目重新许可。

GPL-3.0-or-later applies within the documented scope. Imported user materials and the host application retain their own rights.

请到[Issues](https://github.com/xino-rofi/ScholarMarker/issues)提供Zotero/Windows版本、插件版本、复现步骤及错误提示。请勿公开PDF、数据库、完整profile、owner或原始隐私日志。

Report issues with version details and reproduction steps. Do not upload private papers, databases, complete profiles or ownership metadata.
