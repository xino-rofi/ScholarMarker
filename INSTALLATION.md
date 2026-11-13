# 安装与升级 / Installation and upgrade

已验证环境：**Windows / Zotero 10.0.8**。其他系统和版本未验证。

1. 从 [Beta 2 Release](https://github.com/xino-rofi/ScholarMarker/releases/tag/v0.9.4-beta.2) 下载 `scholarmarker-0.9.4beta2.xpi`；源码ZIP不是安装包。
2. Zotero打开“工具 → 插件”，拖入XPI并按宿主提示安装。Beta 1用户直接原位安装，无需先卸载；不要更换profile、移动业务目录或复制owner。
3. 首次使用时打开用户库PDF，在ScholarMarker设置中明确选择“启用本机 Ping 功能”。已有兼容数据和有效本地同意的升级不需要重新建立业务库。
4. 在“我的Ping”导入素材，配置快捷键；PDF阅读区需获得焦点且鼠标位于页面内。
5. Beta 1曾禁用插件后台更新，这一设置可能保留。若要接收后续自动更新，请自行检查全局更新已开启，并将插件更新选项设为Default或启用。Beta 2不会替用户修改选择。

数据保存在当前profile的`scholarmarker/`及原有固定pref键，不保证通过Zotero Sync同步。升级前备份；不自动迁移旧开发目录。遇到未知或未决状态停止写入，保留证据，不清锁、不重提删除。

Tested on **Windows / Zotero 10.0.8** only.

1. Download the XPI from the Beta 2 Release, not a source ZIP.
2. Open **Tools → Plugins**, drag in the XPI and follow Zotero's prompts. Install over Beta 1 without uninstalling first. Keep the same profile and data locations.
3. On first use, explicitly enable local Ping functionality from ScholarMarker's Reader settings. A compatible upgrade retains existing local consent and data.
4. Import a material in My Pings, assign a shortcut, then focus and hover over the PDF to trigger it.
5. Review global and per-plugin update settings yourself. Beta 1's disabled setting may persist; Beta 2 respects that choice. Future update availability does not imply automatic installation is enabled.

Sidecars and preferences remain local to the profile. Back up before upgrading. Old development data is not migrated automatically. Preserve pending/unknown states instead of clearing locks or retrying deletion.

End users do not need Node or authorization scripts. See [Zotero's plugin installation guide](https://www.zotero.org/support/plugins).
